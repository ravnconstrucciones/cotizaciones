#!/usr/bin/env python3
"""Respalda sesiones Codex/Claude y señala cierres estructurados faltantes.

Es un recolector determinístico: no invoca modelos ni interpreta el contenido
de la conversación. El cursor se publica solamente después de verificar los
archivos del Vault y registrar el único evento resumido de la corrida.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from typing import Any
from uuid import NAMESPACE_URL, uuid5


RAIZ_REPO = Path(__file__).resolve().parents[2]
if str(RAIZ_REPO) not in sys.path:
    sys.path.insert(0, str(RAIZ_REPO))

from daemon.memoria.almacen import AlmacenMemoria, _crudo_a_markdown
from daemon.memoria.colectores import descubrir_sesiones, leer_sesion
from daemon.memoria.modelo import Mensaje
from jobslib import DIR_JOBS, VAULT, registrar_evento


CURSOR = DIR_JOBS / "memoria-cursor.json"
ARCHIVED_CODEX = Path.home() / ".codex" / "archived_sessions"
INACTIVA_SEGUNDOS = 15 * 60


def correr(cfg: dict[str, str], token: str) -> dict[str, object]:
    """Archiva sólo fuentes nuevas o modificadas y devuelve un resumen."""
    cursor = _leer_cursor(CURSOR)
    sesiones_previas = cursor.get("sesiones", {})
    if not isinstance(sesiones_previas, dict):
        raise ValueError(f"Cursor de memoria inválido: {CURSOR}")

    fuentes = _descubrir_todas()
    es_cursor_v2 = cursor.get("version") == 2
    sesiones_actuales = dict(sesiones_previas) if es_cursor_v2 else {}
    cierres = _cierres_existentes(VAULT)
    almacen = AlmacenMemoria(VAULT)
    resultado: dict[str, Any] = {
        "procesadas": 0,
        "archivadas": 0,
        "sin_cierre": 0,
        "omitidas": 0,
        "errores": 0,
        "resueltas": 0,
        "hosts": {"codex": 0, "claude": 0},
    }
    cursor_cambio = not es_cursor_v2
    pendientes_advertencia: set[Path] = set()
    respaldos_evento: set[str] = set()
    errores_evento: set[str] = set()

    pendientes_resueltos = _resolver_pendientes_cerrados(VAULT, cierres)
    resultado["resueltas"] = len(pendientes_resueltos)

    for fuente in fuentes:
        stat = fuente.stat()
        firma = {"mtime_ns": stat.st_mtime_ns, "size": stat.st_size}
        clave_fuente = str(fuente.resolve())
        entrada_previa = sesiones_previas.get(clave_fuente)
        if _entrada_v2_vigente(entrada_previa, firma):
            if entrada_previa["estado"] != "archivada":
                continue
            sesion = _mensaje_desde_cursor(entrada_previa)
            if (
                _esta_inactiva(stat.st_mtime_ns)
                and (sesion.host, sesion.thread_id) not in cierres
            ):
                pendiente, requiere_advertencia = _marcar_cierre_faltante(
                    almacen, fuente, firma, sesion
                )
                if requiere_advertencia and pendiente not in pendientes_advertencia:
                    pendientes_advertencia.add(pendiente)
                    resultado["sin_cierre"] += 1
                    resultado["procesadas"] += 1
                    resultado["hosts"][sesion.host] += 1
            continue

        try:
            mensajes = _completar_timestamps(leer_sesion(fuente), stat.st_mtime)
            if not mensajes:
                raise ValueError(f"La sesión no contiene mensajes archivables: {fuente}")
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            descripcion = str(error)
            sesiones_actuales[clave_fuente] = {
                "firma": firma,
                "host": None,
                "thread_id": None,
                "estado": "omitida",
                "error": descripcion,
            }
            cursor_cambio = True
            resultado["procesadas"] += 1
            resultado["omitidas"] += 1
            resultado["errores"] += 1
            errores_evento.add(
                f"{clave_fuente}\0{firma['mtime_ns']}\0{firma['size']}\0{descripcion}"
            )
            continue

        sesion = mensajes[0]
        hubo_accion = False
        _guardar_crudo_completo(almacen, mensajes)
        resultado["archivadas"] += 1
        sesiones_actuales[clave_fuente] = {
            "firma": firma,
            "host": sesion.host,
            "thread_id": sesion.thread_id,
            "estado": "archivada",
            "error": None,
        }
        cursor_cambio = True
        hubo_accion = True
        respaldos_evento.add(
            f"{clave_fuente}\0{firma['mtime_ns']}\0{firma['size']}"
        )

        if _esta_inactiva(stat.st_mtime_ns) and (sesion.host, sesion.thread_id) not in cierres:
            pendiente, requiere_advertencia = _marcar_cierre_faltante(
                almacen, fuente, firma, sesion
            )
            if requiere_advertencia and pendiente not in pendientes_advertencia:
                pendientes_advertencia.add(pendiente)
                resultado["sin_cierre"] += 1
                hubo_accion = True

        if hubo_accion:
            resultado["procesadas"] += 1
            resultado["hosts"][sesion.host] += 1

    hay_evento = bool(resultado["procesadas"] or resultado["resueltas"])
    if not hay_evento:
        if cursor_cambio:
            _escribir_cursor(CURSOR, {"version": 2, "sesiones": sesiones_actuales})
        return resultado

    nivel = "warning" if resultado["sin_cierre"] or resultado["errores"] else "info"
    titulo = (
        f"memoria: {resultado['archivadas']} sesiones respaldadas, "
        f"{resultado['sin_cierre']} sin cierre, {resultado['omitidas']} omitidas, "
        f"{resultado['errores']} errores"
    )
    registrar_evento(
        cfg,
        token,
        "job_memoria",
        titulo,
        {**resultado, "nivel": nivel},
        evento_id=_identidad_evento(
            pendientes_advertencia,
            respaldos_evento,
            errores_evento,
            pendientes_resueltos,
        ),
    )
    _marcar_advertencias_emitidas(almacen, pendientes_advertencia)

    if cursor_cambio:
        nuevo_cursor = {"version": 2, "sesiones": sesiones_actuales}
        _escribir_cursor(CURSOR, nuevo_cursor)
    return resultado


def _descubrir_todas() -> list[Path]:
    """Combina sesiones activas de ambos hosts con el archivo Codex."""
    fuentes = {Path(path) for path in descubrir_sesiones() if Path(path).is_file()}
    if ARCHIVED_CODEX.is_dir():
        fuentes.update(path for path in ARCHIVED_CODEX.glob("*.jsonl") if path.is_file())
    return sorted(fuentes)


def _leer_cursor(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"version": 2, "sesiones": {}}
    with path.open(encoding="utf-8") as archivo:
        cursor = json.load(archivo)
    if not isinstance(cursor, dict):
        raise ValueError(f"Cursor de memoria inválido: {path}")
    return cursor


def _escribir_cursor(path: Path, cursor: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporal: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(cursor, archivo, ensure_ascii=False, indent=2, sort_keys=True)
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        os.replace(temporal, path)
        temporal = None
    finally:
        if temporal is not None:
            temporal.unlink(missing_ok=True)

    if _leer_cursor(path) != cursor:
        raise OSError(f"No se pudo verificar el cursor de memoria: {path}")


def _completar_timestamps(mensajes: list[Mensaje], mtime: float) -> list[Mensaje]:
    fallback = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    return [replace(mensaje, timestamp=mensaje.timestamp or fallback) for mensaje in mensajes]


def _guardar_crudo_completo(almacen: AlmacenMemoria, mensajes: list[Mensaje]) -> Path:
    """Conserva el último contenido cuando un JSONL activo vuelve a crecer."""
    esperado = _crudo_a_markdown(mensajes)
    destino = almacen.guardar_crudo(mensajes)
    if _verificar_archivo(destino) != esperado:
        almacen._escribir_atomico(destino, esperado)
    if _verificar_archivo(destino) != esperado:
        raise OSError(f"No se pudo verificar el respaldo completo: {destino}")
    return destino


def _esta_inactiva(mtime_ns: int) -> bool:
    return time.time_ns() - mtime_ns >= INACTIVA_SEGUNDOS * 1_000_000_000


def _entrada_v2_vigente(entrada: object, firma: dict[str, int]) -> bool:
    if not isinstance(entrada, dict) or entrada.get("firma") != firma:
        return False
    estado = entrada.get("estado")
    if estado == "archivada":
        return (
            entrada.get("host") in {"codex", "claude"}
            and isinstance(entrada.get("thread_id"), str)
            and bool(entrada["thread_id"])
        )
    return estado == "omitida" and isinstance(entrada.get("error"), str)


def _mensaje_desde_cursor(entrada: dict[str, object]) -> Mensaje:
    return Mensaje(
        host=str(entrada["host"]),
        thread_id=str(entrada["thread_id"]),
        timestamp="",
        autor="",
        tipo="",
        texto="",
        metadata={},
    )


def _cierres_existentes(vault: Path) -> set[tuple[str, str]]:
    raiz = vault / "Conversaciones" / "cierres"
    if not raiz.exists():
        return set()

    cierres: set[tuple[str, str]] = set()
    for path in raiz.rglob("*.md"):
        campos = _leer_frontmatter(path)
        host = campos.get("host")
        thread_id = campos.get("thread_id")
        if isinstance(host, str) and isinstance(thread_id, str):
            cierres.add((host, thread_id))
    return cierres


def _leer_frontmatter(path: Path) -> dict[str, object]:
    lineas = path.read_text(encoding="utf-8").splitlines()
    if not lineas or lineas[0] != "---":
        return {}

    campos: dict[str, object] = {}
    for linea in lineas[1:]:
        if linea == "---":
            return campos
        clave, separador, valor = linea.partition(":")
        if not separador:
            continue
        campos[clave.strip()] = _valor_frontmatter(valor.strip())
    return {}


def _valor_frontmatter(valor: str) -> object:
    if valor.startswith(('"', "'")):
        try:
            return json.loads(valor)
        except json.JSONDecodeError:
            return valor.strip("'\"")
    return valor


def _marcar_cierre_faltante(
    almacen: AlmacenMemoria,
    fuente: Path,
    firma: dict[str, int],
    sesion: Mensaje,
) -> tuple[Path, bool]:
    detalle: dict[str, object] = {
        "sesion": str(fuente.resolve()),
        "firma": firma,
        "host": sesion.host,
        "thread_id": sesion.thread_id,
        "advertencia_emitida": False,
    }
    existente = _buscar_pendiente(almacen.vault, detalle)
    pendiente = existente or almacen.marcar_pendiente(
        "cierre_estructurado_faltante", detalle
    )
    contenido = json.loads(_verificar_archivo(pendiente))
    detalle_guardado = contenido.get("detalle")
    if (
        contenido.get("operacion") != "cierre_estructurado_faltante"
        or not isinstance(detalle_guardado, dict)
        or detalle_guardado.get("host") != sesion.host
        or detalle_guardado.get("thread_id") != sesion.thread_id
    ):
        raise OSError(f"No se pudo verificar el pendiente de memoria: {pendiente}")
    return pendiente, not bool(detalle_guardado.get("advertencia_emitida"))


def _marcar_advertencias_emitidas(
    almacen: AlmacenMemoria, pendientes: set[Path]
) -> None:
    for pendiente in pendientes:
        contenido = json.loads(_verificar_archivo(pendiente))
        detalle = contenido.get("detalle")
        if not isinstance(detalle, dict):
            raise OSError(f"Pendiente de memoria inválido: {pendiente}")
        detalle["advertencia_emitida"] = True
        serializado = json.dumps(contenido, ensure_ascii=False, indent=2) + "\n"
        almacen._escribir_atomico(pendiente, serializado)
        verificado = json.loads(_verificar_archivo(pendiente))
        if not verificado.get("detalle", {}).get("advertencia_emitida"):
            raise OSError(f"No se pudo confirmar la advertencia: {pendiente}")


def _identidad_evento(
    pendientes: set[Path],
    respaldos: set[str],
    errores: set[str] | None = None,
    resueltos: set[Path] | None = None,
) -> str:
    """Identidad estable para reintentar el POST después de una falla local."""
    partes = [f"pendiente:{path.resolve()}" for path in pendientes]
    partes.extend(f"respaldo:{firma}" for firma in respaldos)
    partes.extend(f"error:{error}" for error in errores or set())
    partes.extend(f"resuelto:{path.resolve()}" for path in resueltos or set())
    if not partes:
        raise ValueError("No hay acciones para identificar el evento de memoria.")
    nombre = "ravn:job_memoria\n" + "\n".join(sorted(partes))
    return str(uuid5(NAMESPACE_URL, nombre))


def _resolver_pendientes_cerrados(
    vault: Path, cierres: set[tuple[str, str]]
) -> set[Path]:
    pendientes = vault / "Sistema" / "Memoria" / "pendientes-escritura"
    if not cierres or not pendientes.exists():
        return set()

    resueltos: set[Path] = set()
    with _bloquear_resolucion_pendientes(vault):
        for path in sorted(pendientes.glob("*.json")):
            try:
                contenido = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            detalle = contenido.get("detalle")
            if (
                contenido.get("operacion") != "cierre_estructurado_faltante"
                or not isinstance(detalle, dict)
                or (detalle.get("host"), detalle.get("thread_id")) not in cierres
            ):
                continue

            contenido["resuelto_at"] = datetime.now(timezone.utc).isoformat()
            serializado = json.dumps(contenido, ensure_ascii=False, indent=2) + "\n"
            AlmacenMemoria._escribir_atomico(path, serializado)
            destino = (
                vault
                / "Sistema"
                / "Memoria"
                / "pendientes-resueltos"
                / path.name
            )
            destino.parent.mkdir(parents=True, exist_ok=True)
            os.replace(path, destino)
            if json.loads(_verificar_archivo(destino)).get("resuelto_at") is None:
                raise OSError(f"No se pudo verificar el pendiente resuelto: {destino}")
            resueltos.add(destino)
    return resueltos


@contextmanager
def _bloquear_resolucion_pendientes(vault: Path):
    directorio = vault / "Sistema" / "Memoria"
    directorio.mkdir(parents=True, exist_ok=True)
    lock = directorio / ".resolver-pendientes.lock"
    with lock.open("a+", encoding="utf-8") as archivo:
        fcntl.flock(archivo.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(archivo.fileno(), fcntl.LOCK_UN)


def _buscar_pendiente(vault: Path, detalle: dict[str, object]) -> Path | None:
    raiz = vault / "Sistema" / "Memoria" / "pendientes-escritura"
    if not raiz.exists():
        return None
    for path in raiz.glob("*.json"):
        try:
            contenido = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            contenido.get("operacion") == "cierre_estructurado_faltante"
            and isinstance(contenido.get("detalle"), dict)
            and contenido["detalle"].get("host") == detalle["host"]
            and contenido["detalle"].get("thread_id") == detalle["thread_id"]
        ):
            return path
    return None


def _verificar_archivo(path: Path) -> str:
    contenido = path.read_text(encoding="utf-8")
    if not contenido.strip():
        raise OSError(f"La escritura de memoria quedó vacía: {path}")
    return contenido
