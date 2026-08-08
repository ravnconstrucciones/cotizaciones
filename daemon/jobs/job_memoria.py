#!/usr/bin/env python3
"""Respalda sesiones Codex/Claude y señala cierres estructurados faltantes.

Es un recolector determinístico: no invoca modelos ni interpreta el contenido
de la conversación. Verifica cada snapshot antes de publicar su firma y usa un
outbox durable para reintentar el único evento resumido de cada corrida.
"""

from __future__ import annotations

from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime, timezone
import fcntl
import hashlib
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
    """Serializa una corrida completa para proteger cursor, outbox y pendientes."""
    with _bloquear_job(CURSOR):
        return _correr_bloqueado(cfg, token)


def _correr_bloqueado(cfg: dict[str, str], token: str) -> dict[str, object]:
    """Archiva sólo fuentes nuevas o modificadas y devuelve un resumen."""
    cursor = _leer_cursor(CURSOR)
    sesiones_previas = cursor.get("sesiones", {})
    if not isinstance(sesiones_previas, dict):
        raise ValueError(f"Cursor de memoria inválido: {CURSOR}")

    fuentes = _descubrir_todas()
    es_cursor_v2 = cursor.get("version") == 2
    sesiones_actuales = dict(sesiones_previas) if es_cursor_v2 else {}
    errores_globales_previos = cursor.get("errores_globales", {})
    if not isinstance(errores_globales_previos, dict):
        errores_globales_previos = {}
    errores_globales_actuales: dict[str, dict[str, object]] = {}
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
    acciones_outbox = _acciones_en_outbox()
    pendientes_advertencia: set[Path] = set()
    respaldos_evento: set[str] = set()
    errores_evento: set[str] = set()
    errores_a_marcar: set[str] = set()
    errores_globales_a_marcar: set[str] = set()

    def registrar_error_global(clave: str, descripcion: str) -> None:
        nonlocal cursor_cambio
        entrada_previa = errores_globales_previos.get(clave)
        ya_reportado = (
            isinstance(entrada_previa, dict)
            and entrada_previa.get("error") == descripcion
            and entrada_previa.get("error_reportado") is True
        )
        entrada = {"error": descripcion, "error_reportado": ya_reportado}
        errores_globales_actuales[clave] = entrada
        cursor_cambio = cursor_cambio or entrada != entrada_previa
        error_evento = f"global\0{clave}\0{descripcion}"
        if not ya_reportado and f"error:{error_evento}" not in acciones_outbox:
            resultado["procesadas"] += 1
            resultado["errores"] += 1
            errores_evento.add(error_evento)
            errores_globales_a_marcar.add(clave)

    errores_preloop: list[tuple[str, str]] = []
    cierres = _cierres_existentes(VAULT, errores_preloop)
    cierres_confiables = not errores_preloop
    pendientes_resueltos_todos: set[Path] = set()
    if cierres_confiables:
        try:
            pendientes_resueltos_todos = _resolver_pendientes_cerrados(
                VAULT, cierres, errores_preloop
            )
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            errores_preloop.append(
                (
                    f"resolver:{(VAULT / 'Sistema' / 'Memoria').resolve()}",
                    _descripcion_error(error),
                )
            )
    for clave, descripcion in errores_preloop:
        registrar_error_global(clave, descripcion)

    pendientes_resueltos = {
        path
        for path in pendientes_resueltos_todos
        if f"resuelto:{path.resolve()}" not in acciones_outbox
    }
    resultado["resueltas"] = len(pendientes_resueltos)

    for fuente in fuentes:
        clave_fuente = str(fuente.resolve())
        entrada_previa = sesiones_previas.get(clave_fuente)
        firma: dict[str, int] | None = None
        sesion: Mensaje | None = None
        try:
            stat = fuente.stat()
            firma = {"mtime_ns": stat.st_mtime_ns, "size": stat.st_size}
            if _entrada_v2_vigente(entrada_previa, firma):
                if entrada_previa["estado"] != "archivada":
                    continue
                sesion = _mensaje_desde_cursor(entrada_previa)
                if (
                    cierres_confiables
                    and _esta_inactiva(stat.st_mtime_ns)
                    and (sesion.host, sesion.thread_id) not in cierres
                ):
                    pendiente, requiere_advertencia = _marcar_cierre_faltante(
                        almacen, fuente, firma, sesion
                    )
                    accion_pendiente = f"pendiente:{pendiente.resolve()}"
                    if (
                        requiere_advertencia
                        and accion_pendiente not in acciones_outbox
                        and pendiente not in pendientes_advertencia
                    ):
                        pendientes_advertencia.add(pendiente)
                        resultado["sin_cierre"] += 1
                        resultado["procesadas"] += 1
                        resultado["hosts"][sesion.host] += 1
                continue

            try:
                mensajes = _completar_timestamps(leer_sesion(fuente), stat.st_mtime)
                if not mensajes:
                    raise ValueError(
                        f"La sesión no contiene mensajes archivables: {fuente}"
                    )
            except (UnicodeError, json.JSONDecodeError, ValueError) as error:
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
            stat_despues = fuente.stat()
            firma_despues = {
                "mtime_ns": stat_despues.st_mtime_ns,
                "size": stat_despues.st_size,
            }
            if firma_despues != firma:
                raise OSError(f"La sesión cambió durante la lectura: {fuente}")
            _guardar_crudo_completo(almacen, mensajes)
            stat_persistida = fuente.stat()
            firma_persistida = {
                "mtime_ns": stat_persistida.st_mtime_ns,
                "size": stat_persistida.st_size,
            }
            if firma_persistida != firma:
                raise OSError(f"La sesión cambió durante la persistencia: {fuente}")

            if (
                cierres_confiables
                and _esta_inactiva(stat.st_mtime_ns)
                and (sesion.host, sesion.thread_id) not in cierres
            ):
                pendiente, requiere_advertencia = _marcar_cierre_faltante(
                    almacen, fuente, firma, sesion
                )
                accion_pendiente = f"pendiente:{pendiente.resolve()}"
                if (
                    requiere_advertencia
                    and accion_pendiente not in acciones_outbox
                    and pendiente not in pendientes_advertencia
                ):
                    pendientes_advertencia.add(pendiente)
                    resultado["sin_cierre"] += 1

            resultado["archivadas"] += 1
            sesiones_actuales[clave_fuente] = {
                "firma": firma,
                "host": sesion.host,
                "thread_id": sesion.thread_id,
                "estado": "archivada",
                "error": None,
            }
            cursor_cambio = True
            resultado["procesadas"] += 1
            resultado["hosts"][sesion.host] += 1
            respaldo_evento = (
                f"{clave_fuente}\0{firma['mtime_ns']}\0{firma['size']}"
            )
            if f"respaldo:{respaldo_evento}" not in acciones_outbox:
                respaldos_evento.add(respaldo_evento)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            descripcion = str(error)
            host = sesion.host if sesion is not None else None
            thread_id = sesion.thread_id if sesion is not None else None
            error_ya_reportado = (
                isinstance(entrada_previa, dict)
                and entrada_previa.get("estado") == "error"
                and entrada_previa.get("firma") == firma
                and entrada_previa.get("error") == descripcion
                and entrada_previa.get("error_reportado") is True
            )
            entrada_error = {
                "firma": firma,
                "host": host,
                "thread_id": thread_id,
                "estado": "error",
                "error": descripcion,
                "error_reportado": error_ya_reportado,
            }
            sesiones_actuales[clave_fuente] = entrada_error
            cursor_cambio = cursor_cambio or entrada_error != entrada_previa
            if not error_ya_reportado:
                error_evento = f"{clave_fuente}\0{firma}\0{descripcion}"
                if f"error:{error_evento}" not in acciones_outbox:
                    resultado["procesadas"] += 1
                    resultado["errores"] += 1
                    errores_evento.add(error_evento)
                    errores_a_marcar.add(clave_fuente)
            continue

    if errores_globales_actuales != errores_globales_previos:
        cursor_cambio = True

    hay_evento = bool(resultado["procesadas"] or resultado["resueltas"])
    if hay_evento:
        nivel = "warning" if resultado["sin_cierre"] or resultado["errores"] else "info"
        titulo = (
            f"memoria: {resultado['archivadas']} sesiones respaldadas, "
            f"{resultado['sin_cierre']} sin cierre, {resultado['omitidas']} omitidas, "
            f"{resultado['errores']} errores"
        )
        acciones_evento = _partes_evento(
            pendientes_advertencia,
            respaldos_evento,
            errores_evento,
            pendientes_resueltos,
        )
        if acciones_evento:
            evento_id = _identidad_evento(
                pendientes_advertencia,
                respaldos_evento,
                errores_evento,
                pendientes_resueltos,
            )
            _guardar_evento_pendiente(
                evento_id,
                titulo,
                {**resultado, "nivel": nivel},
                pendientes_advertencia,
                pendientes_resueltos,
                errores_a_marcar,
                errores_globales_a_marcar,
                acciones_evento,
            )

    if cursor_cambio:
        nuevo_cursor = {
            "version": 2,
            "sesiones": sesiones_actuales,
        }
        if errores_globales_actuales or "errores_globales" in cursor:
            nuevo_cursor["errores_globales"] = errores_globales_actuales
        _escribir_cursor(CURSOR, nuevo_cursor)
    eventos_emitidos = _emitir_eventos_pendientes(cfg, token, almacen)
    for evento_emitido in eventos_emitidos:
        evento_emitido.unlink(missing_ok=True)
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
    bytes_cursor = path.read_bytes()
    try:
        cursor = json.loads(bytes_cursor.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        _preservar_cursor_corrupto(path, bytes_cursor)
        return {"version": 0, "sesiones": {}}
    if not isinstance(cursor, dict) or not isinstance(cursor.get("sesiones"), dict):
        _preservar_cursor_corrupto(path, bytes_cursor)
        return {"version": 0, "sesiones": {}}
    return cursor


def _preservar_cursor_corrupto(path: Path, contenido: bytes) -> Path:
    digest = hashlib.sha256(contenido).hexdigest()[:16]
    respaldo = path.with_name(f"{path.name}.corrupt-{digest}")
    os.replace(path, respaldo)
    if respaldo.read_bytes() != contenido:
        raise OSError(f"No se pudo preservar el cursor corrupto: {path}")
    return respaldo


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


def _cierres_existentes(
    vault: Path, errores: list[tuple[str, str]] | None = None
) -> set[tuple[str, str]]:
    raiz = vault / "Conversaciones" / "cierres"
    if not raiz.exists():
        return set()

    cierres: set[tuple[str, str]] = set()
    try:
        paths = list(raiz.rglob("*.md"))
    except OSError as error:
        _anotar_error_preloop(errores, f"cierres:{raiz.resolve()}", error)
        return cierres
    for path in paths:
        try:
            campos = _leer_frontmatter(path)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            _anotar_error_preloop(errores, f"cierre:{path.resolve()}", error)
            continue
        host = campos.get("host")
        thread_id = campos.get("thread_id")
        if isinstance(host, str) and isinstance(thread_id, str):
            cierres.add((host, thread_id))
    return cierres


def _descripcion_error(error: BaseException) -> str:
    return f"{type(error).__name__}: {error}"


def _anotar_error_preloop(
    errores: list[tuple[str, str]] | None, clave: str, error: BaseException
) -> None:
    if errores is not None:
        errores.append((clave, _descripcion_error(error)))


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
    with _bloquear_resolucion_pendientes(almacen.vault):
        return _marcar_cierre_faltante_bloqueado(almacen, fuente, firma, sesion)


def _marcar_cierre_faltante_bloqueado(
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
    if not pendientes:
        return
    with _bloquear_resolucion_pendientes(almacen.vault):
        for pendiente in pendientes:
            ruta_actual = pendiente
            if not ruta_actual.exists():
                ruta_actual = (
                    almacen.vault
                    / "Sistema"
                    / "Memoria"
                    / "pendientes-resueltos"
                    / pendiente.name
                )
            if not ruta_actual.exists():
                continue
            contenido = json.loads(_verificar_archivo(ruta_actual))
            detalle = contenido.get("detalle")
            if not isinstance(detalle, dict):
                raise OSError(f"Pendiente de memoria inválido: {ruta_actual}")
            detalle["advertencia_emitida"] = True
            serializado = json.dumps(contenido, ensure_ascii=False, indent=2) + "\n"
            almacen._escribir_atomico(ruta_actual, serializado)
            verificado = json.loads(_verificar_archivo(ruta_actual))
            if not verificado.get("detalle", {}).get("advertencia_emitida"):
                raise OSError(f"No se pudo confirmar la advertencia: {ruta_actual}")


def _identidad_evento(
    pendientes: set[Path],
    respaldos: set[str],
    errores: set[str] | None = None,
    resueltos: set[Path] | None = None,
) -> str:
    """Identidad estable para reintentar el POST después de una falla local."""
    partes = _partes_evento(pendientes, respaldos, errores, resueltos)
    if not partes:
        raise ValueError("No hay acciones para identificar el evento de memoria.")
    nombre = "ravn:job_memoria\n" + "\n".join(sorted(partes))
    return str(uuid5(NAMESPACE_URL, nombre))


def _partes_evento(
    pendientes: set[Path],
    respaldos: set[str],
    errores: set[str] | None = None,
    resueltos: set[Path] | None = None,
) -> set[str]:
    partes = [f"pendiente:{path.resolve()}" for path in pendientes]
    partes.extend(f"respaldo:{firma}" for firma in respaldos)
    partes.extend(f"error:{error}" for error in errores or set())
    partes.extend(f"resuelto:{path.resolve()}" for path in resueltos or set())
    return set(partes)


def _acciones_en_outbox() -> set[str]:
    directorio = CURSOR.parent / "memoria-eventos-pendientes"
    cubiertas: set[str] = set()
    if directorio.exists():
        for path in directorio.glob("*.json"):
            try:
                evento = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            cubiertas.update(str(valor) for valor in evento.get("acciones", []))
    return cubiertas


def _guardar_evento_pendiente(
    evento_id: str,
    titulo: str,
    contenido: dict[str, object],
    pendientes: set[Path],
    resueltos: set[Path],
    errores: set[str],
    errores_globales: set[str],
    acciones: set[str],
) -> Path:
    directorio = CURSOR.parent / "memoria-eventos-pendientes"
    destino = directorio / f"{evento_id}.json"
    payload = {
        "id": evento_id,
        "tipo": "job_memoria",
        "titulo": titulo,
        "contenido": contenido,
        "pendientes": sorted(str(path) for path in pendientes),
        "resueltos": sorted(str(path) for path in resueltos),
        "errores": sorted(errores),
        "errores_globales": sorted(errores_globales),
        "acciones": sorted(acciones),
    }
    serializado = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if destino.exists() and destino.read_text(encoding="utf-8") != serializado:
        raise OSError(f"Conflicto en outbox de memoria: {destino}")
    if not destino.exists():
        AlmacenMemoria._escribir_atomico(destino, serializado)
    if json.loads(_verificar_archivo(destino)) != payload:
        raise OSError(f"No se pudo verificar el outbox de memoria: {destino}")
    return destino


def _emitir_eventos_pendientes(
    cfg: dict[str, str], token: str, almacen: AlmacenMemoria
) -> list[Path]:
    directorio = CURSOR.parent / "memoria-eventos-pendientes"
    if not directorio.exists():
        return []
    emitidos: list[Path] = []
    for path in sorted(directorio.glob("*.json")):
        evento = json.loads(_verificar_archivo(path))
        registrar_evento(
            cfg,
            token,
            str(evento["tipo"]),
            str(evento["titulo"]),
            evento["contenido"],
            evento_id=str(evento["id"]),
        )
        _marcar_advertencias_emitidas(
            almacen, {Path(valor) for valor in evento.get("pendientes", [])}
        )
        _marcar_resoluciones_emitidas(
            almacen.vault, {Path(valor) for valor in evento.get("resueltos", [])}
        )
        _marcar_errores_reportados(
            CURSOR,
            set(evento.get("errores", [])),
            set(evento.get("errores_globales", [])),
        )
        emitidos.append(path)
    return emitidos


def _marcar_errores_reportados(
    path: Path, claves: set[str], claves_globales: set[str]
) -> None:
    if (not claves and not claves_globales) or not path.exists():
        return
    cursor = _leer_cursor(path)
    sesiones = cursor.get("sesiones")
    if not isinstance(sesiones, dict):
        raise ValueError(f"Cursor de memoria inválido: {path}")
    cambio = False
    for clave in claves:
        entrada = sesiones.get(clave)
        if (
            isinstance(entrada, dict)
            and entrada.get("estado") == "error"
            and entrada.get("error_reportado") is not True
        ):
            entrada["error_reportado"] = True
            cambio = True
    errores_globales = cursor.get("errores_globales")
    if isinstance(errores_globales, dict):
        for clave in claves_globales:
            entrada = errores_globales.get(clave)
            if (
                isinstance(entrada, dict)
                and entrada.get("error_reportado") is not True
            ):
                entrada["error_reportado"] = True
                cambio = True
    if cambio:
        _escribir_cursor(path, cursor)


def _resolver_pendientes_cerrados(
    vault: Path,
    cierres: set[tuple[str, str]],
    errores: list[tuple[str, str]] | None = None,
) -> set[Path]:
    pendientes = vault / "Sistema" / "Memoria" / "pendientes-escritura"
    directorio_resueltos = vault / "Sistema" / "Memoria" / "pendientes-resueltos"

    resueltos: set[Path] = set()
    with _bloquear_resolucion_pendientes(vault):
        try:
            fuentes_pendientes = (
                sorted(pendientes.glob("*.json")) if pendientes.exists() else []
            )
        except OSError as error:
            _anotar_error_preloop(
                errores, f"resolver-listado:{pendientes.resolve()}", error
            )
            fuentes_pendientes = []
        for path in fuentes_pendientes:
            try:
                contenido = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
                _anotar_error_preloop(
                    errores, f"resolver-pendiente:{path.resolve()}", error
                )
                continue
            detalle = contenido.get("detalle")
            if (
                contenido.get("operacion") != "cierre_estructurado_faltante"
                or not isinstance(detalle, dict)
                or (detalle.get("host"), detalle.get("thread_id")) not in cierres
            ):
                continue

            try:
                contenido["resuelto_at"] = datetime.now(timezone.utc).isoformat()
                contenido["evento_emitido"] = False
                serializado = (
                    json.dumps(contenido, ensure_ascii=False, indent=2) + "\n"
                )
                AlmacenMemoria._escribir_atomico(path, serializado)
                destino = directorio_resueltos / path.name
                destino.parent.mkdir(parents=True, exist_ok=True)
                os.replace(path, destino)
                if json.loads(_verificar_archivo(destino)).get("resuelto_at") is None:
                    raise OSError(
                        f"No se pudo verificar el pendiente resuelto: {destino}"
                    )
            except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
                _anotar_error_preloop(
                    errores, f"resolver-pendiente:{path.resolve()}", error
                )
                continue
        if directorio_resueltos.exists():
            try:
                destinos_resueltos = list(directorio_resueltos.glob("*.json"))
            except OSError as error:
                _anotar_error_preloop(
                    errores,
                    f"resolver-listado:{directorio_resueltos.resolve()}",
                    error,
                )
                destinos_resueltos = []
            for destino in destinos_resueltos:
                try:
                    contenido = json.loads(destino.read_text(encoding="utf-8"))
                except (
                    OSError,
                    UnicodeError,
                    json.JSONDecodeError,
                    ValueError,
                ) as error:
                    _anotar_error_preloop(
                        errores, f"resolver-resuelto:{destino.resolve()}", error
                    )
                    continue
                if (
                    contenido.get("operacion") == "cierre_estructurado_faltante"
                    and contenido.get("evento_emitido") is False
                ):
                    resueltos.add(destino)
    return resueltos


def _marcar_resoluciones_emitidas(vault: Path, resueltos: set[Path]) -> None:
    if not resueltos:
        return
    with _bloquear_resolucion_pendientes(vault):
        for path in resueltos:
            contenido = json.loads(_verificar_archivo(path))
            contenido["evento_emitido"] = True
            serializado = json.dumps(contenido, ensure_ascii=False, indent=2) + "\n"
            AlmacenMemoria._escribir_atomico(path, serializado)
            if json.loads(_verificar_archivo(path)).get("evento_emitido") is not True:
                raise OSError(f"No se pudo confirmar el evento resuelto: {path}")


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


@contextmanager
def _bloquear_job(cursor: Path):
    cursor.parent.mkdir(parents=True, exist_ok=True)
    lock = cursor.parent / ".memoria-job.lock"
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
