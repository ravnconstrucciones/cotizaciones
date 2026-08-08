"""Persistencia atómica de transcripciones, cierres e índices de memoria."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unicodedata
from uuid import uuid4

from .modelo import (
    Cierre,
    Mensaje,
    cierre_a_markdown,
    redactar_secretos,
    validar_timestamp_iso8601,
)


class AlmacenMemoria:
    """Escribe archivos del vault sin publicar estados parcialmente escritos."""

    def __init__(self, vault: Path):
        self.vault = Path(vault)

    def guardar_crudo(self, mensajes: list[Mensaje]) -> Path:
        """Archiva una transcripción normalizada una sola vez por sesión y día."""
        if not mensajes:
            raise ValueError("Se requiere al menos un mensaje para archivar el crudo.")

        primero = mensajes[0]
        if any(
            mensaje.host != primero.host or mensaje.thread_id != primero.thread_id
            for mensaje in mensajes
        ):
            raise ValueError("Los mensajes crudos deben pertenecer a una única sesión.")
        for mensaje in mensajes:
            validar_timestamp_iso8601(mensaje.timestamp, campo="timestamp")

        fecha = _fecha_para_ruta(primero.timestamp)
        destino = (
            self.vault
            / "Conversaciones"
            / "crudo"
            / fecha[:4]
            / fecha[5:7]
            / _nombre_crudo(fecha, primero.host, primero.thread_id)
        )
        contenido = _crudo_a_markdown(mensajes)
        try:
            if not destino.exists() or destino.read_bytes() != contenido.encode("utf-8"):
                self._escribir_atomico(destino, contenido)
        except OSError as error:
            self.marcar_pendiente(
                "guardar_crudo",
                {"ruta": _ruta_relativa(self.vault, destino), "error": str(error)},
            )
            raise
        return destino

    def guardar_cierre(self, cierre: Cierre) -> Path:
        """Publica un cierre y lo deja disponible de inmediato en el índice local."""
        destino = self._ruta_cierre(cierre)
        contenido = cierre_a_markdown(cierre)
        bytes_nuevos = contenido.encode("utf-8")
        try:
            with _bloquear_ruta(destino):
                if destino.exists():
                    bytes_actuales = destino.read_bytes()
                    if bytes_actuales != bytes_nuevos:
                        candidato = self._preservar_conflicto(
                            destino, bytes_actuales, contenido
                        )
                        raise ValueError(
                            f"Conflicto de cierre: la ruta {destino} ya contiene otros bytes; "
                            f"el candidato quedó en {candidato}."
                        )
                else:
                    self._escribir_atomico(destino, contenido)
                self.actualizar_indice(cierre, destino, _marcar_error=False)
        except OSError as error:
            self.marcar_pendiente(
                "guardar_cierre",
                {
                    "ruta": _ruta_relativa(self.vault, destino),
                    "cierre_id": cierre.id,
                    "error": str(error),
                },
            )
            raise
        return destino

    def _preservar_conflicto(
        self, original: Path, bytes_originales: bytes, contenido_candidato: str
    ) -> Path:
        bytes_candidato = contenido_candidato.encode("utf-8")
        hash_original = hashlib.sha256(bytes_originales).hexdigest()
        hash_candidato = hashlib.sha256(bytes_candidato).hexdigest()
        fecha = original.parent.name
        anio = original.parent.parent.name
        candidato = (
            self.vault
            / "Sistema"
            / "Memoria"
            / "conflictos-cierre"
            / anio
            / fecha
            / f"{original.stem}-{hash_candidato[:16]}.conflict"
        )
        if not candidato.exists():
            self._escribir_atomico(candidato, contenido_candidato)
        pendiente = self.marcar_pendiente(
            "conflicto_cierre",
            {
                "original": _ruta_relativa(self.vault, original),
                "candidato": _ruta_relativa(self.vault, candidato),
                "sha256_original": hash_original,
                "sha256_candidato": hash_candidato,
            },
        )
        if candidato.read_bytes() != bytes_candidato or not pendiente.is_file():
            raise OSError(f"No se pudo preservar el conflicto de cierre: {original}")
        return candidato

    def actualizar_indice(
        self, cierre: Cierre, ruta_cierre: Path | None = None, *, _marcar_error: bool = True
    ) -> Path:
        """Agrega las entidades de un cierre al índice de recuperación inmediata."""
        ruta_cierre = ruta_cierre or self._ruta_cierre(cierre)
        destino = self.vault / "Sistema" / "Memoria" / "indices" / "entidades.json"
        try:
            with _bloquear_indice(destino.parent):
                indice = _leer_indice(destino)
                entidades = indice.setdefault("entidades", {})
                ruta_relativa = _texto_indice(_ruta_relativa(self.vault, ruta_cierre))
                for clave_anterior in list(entidades):
                    notas_anteriores = entidades[clave_anterior]
                    if not isinstance(notas_anteriores, list):
                        raise ValueError(f"Entrada inválida en el índice: {clave_anterior}")
                    entidades[clave_anterior] = [
                        nota
                        for nota in notas_anteriores
                        if not isinstance(nota, dict) or nota.get("ruta") != ruta_relativa
                    ]
                    if not entidades[clave_anterior]:
                        del entidades[clave_anterior]
                entrada_base = {
                    "ruta": ruta_relativa,
                    "updated_at": _texto_indice(cierre.fecha_cierre),
                    "host": _texto_indice(cierre.host),
                    "thread_id": _texto_indice(cierre.thread_id),
                    "tema": _texto_indice(cierre.tema),
                    "estado": _texto_indice(cierre.estado),
                }
                for clave, origen in claves_indice(cierre):
                    notas = entidades.setdefault(clave, [])
                    notas.append({**entrada_base, "origen": origen})
                    notas.sort(key=lambda nota: (nota["updated_at"], nota["ruta"]), reverse=True)

                indice["updated_at"] = _texto_indice(cierre.fecha_cierre)
                self._escribir_atomico(
                    destino, json.dumps(indice, ensure_ascii=False, indent=2) + "\n"
                )
        except OSError as error:
            if _marcar_error:
                self.marcar_pendiente(
                    "actualizar_indice",
                    {
                        "ruta": _ruta_relativa(self.vault, destino),
                        "cierre_id": cierre.id,
                        "error": str(error),
                    },
                )
            raise
        return destino

    def marcar_pendiente(self, operacion: str, detalle: dict[str, object] | None = None) -> Path:
        """Deja una señal durable aun cuando el reemplazo atómico esté indisponible."""
        directorio = self.vault / "Sistema" / "Memoria" / "pendientes-escritura"
        directorio.mkdir(parents=True, exist_ok=True)
        pendiente = {
            "operacion": redactar_secretos(operacion),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "detalle": _redactar_dato(detalle or {}),
        }
        destino = directorio / f"{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}-{uuid4().hex}.json"
        # No se usa os.replace: este archivo debe sobrevivir justamente a esa falla.
        with destino.open("x", encoding="utf-8") as archivo:
            json.dump(pendiente, archivo, ensure_ascii=False, indent=2)
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        return destino

    def _ruta_cierre(self, cierre: Cierre) -> Path:
        fecha = _fecha_para_ruta(cierre.fecha_cierre)
        clave = "\0".join((cierre.host, cierre.thread_id, cierre.fecha_cierre))
        identificador = hashlib.sha256(clave.encode("utf-8")).hexdigest()[:24]
        nombre = f"{fecha}-{identificador}"
        return self.vault / "Conversaciones" / "cierres" / fecha[:4] / fecha[5:7] / f"{nombre}.md"

    @staticmethod
    def _escribir_atomico(destino: Path, contenido: str) -> None:
        destino.parent.mkdir(parents=True, exist_ok=True)
        temporal: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", dir=destino.parent, delete=False
            ) as archivo:
                temporal = Path(archivo.name)
                archivo.write(contenido)
                archivo.flush()
                os.fsync(archivo.fileno())
            os.replace(temporal, destino)
            temporal = None
        finally:
            if temporal is not None:
                temporal.unlink(missing_ok=True)


def _leer_indice(path: Path) -> dict[str, object]:
    if not path.exists():
        return {"entidades": {}}
    with path.open(encoding="utf-8") as archivo:
        indice = json.load(archivo)
    if not isinstance(indice, dict) or not isinstance(indice.get("entidades", {}), dict):
        raise ValueError(f"Índice de entidades inválido: {path}")
    return indice


@contextmanager
def _bloquear_indice(directorio: Path):
    """Serializa el ciclo leer-modificar-escribir entre procesos locales."""
    directorio.mkdir(parents=True, exist_ok=True)
    with (directorio / "entidades.lock").open("a+", encoding="utf-8") as archivo:
        fcntl.flock(archivo.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(archivo.fileno(), fcntl.LOCK_UN)


@contextmanager
def _bloquear_ruta(destino: Path):
    """Serializa comparación, publicación e indexado de una ruta de cierre."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    lock = destino.with_name(f".{destino.name}.lock")
    with lock.open("a+", encoding="utf-8") as archivo:
        fcntl.flock(archivo.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(archivo.fileno(), fcntl.LOCK_UN)


def _crudo_a_markdown(mensajes: list[Mensaje]) -> str:
    primero = mensajes[0]
    cuerpo = _cuerpo_crudo(mensajes)
    digest = hashlib.sha256(cuerpo.encode("utf-8")).hexdigest()
    fuente = redactar_secretos(f"session://{primero.host}/{primero.thread_id}")
    frontmatter = [
        "---",
        "sensibilidad: restringida",
        f"host: {redactar_secretos(primero.host)}",
        f"thread_id: {json.dumps(redactar_secretos(primero.thread_id), ensure_ascii=False)}",
        f"fuente: {json.dumps(fuente, ensure_ascii=False)}",
        f"sha256: {digest}",
        "---",
    ]
    return "\n".join(frontmatter) + "\n" + cuerpo


def _cuerpo_crudo(mensajes: list[Mensaje]) -> str:
    lineas = ["# Transcripción normalizada", ""]
    for mensaje in mensajes:
        lineas.extend(
            [
                f"## {_normalizar_lineas(redactar_secretos(mensaje.timestamp))} — "
                f"{_normalizar_lineas(redactar_secretos(mensaje.autor))} "
                f"({_normalizar_lineas(redactar_secretos(mensaje.tipo))})",
                _normalizar_lineas(redactar_secretos(mensaje.texto)),
                "",
            ]
        )
    return "\n".join(lineas).rstrip() + "\n"


def _fecha_para_ruta(timestamp: str) -> str:
    return validar_timestamp_iso8601(timestamp).date().isoformat()


def _normalizar_entidad(entidad: str) -> str:
    sin_acentos = "".join(
        caracter
        for caracter in unicodedata.normalize("NFKD", entidad)
        if not unicodedata.combining(caracter)
    )
    return " ".join(sin_acentos.casefold().split())


def claves_indice(cierre: Cierre) -> set[tuple[str, str]]:
    """Devuelve claves recuperables y el campo que les dio origen."""
    entidades = {
        (_normalizar_entidad(_texto_indice(valor)), tipo)
        for tipo, valores in cierre.entidades.items()
        for valor in valores
        if valor.strip()
    }
    if entidades:
        return entidades
    return {(_normalizar_entidad(_texto_indice(cierre.tema)), "tema")}


def _texto_indice(valor: str) -> str:
    return redactar_secretos(valor)


def _nombre_crudo(fecha: str, host: str, thread_id: str) -> str:
    host_seguro = host if host in {"codex", "claude"} else "host"
    identidad = "\0".join((host, thread_id)).encode("utf-8")
    digest = hashlib.sha256(identidad).hexdigest()
    return f"{fecha}-{host_seguro}-{digest}.md"


def _ruta_relativa(vault: Path, ruta: Path) -> str:
    return ruta.relative_to(vault).as_posix()


def _normalizar_lineas(valor: str) -> str:
    return valor.replace("\r\n", "\n").replace("\r", "\n")


def _redactar_dato(valor: object) -> object:
    if isinstance(valor, str):
        return redactar_secretos(valor)
    if isinstance(valor, dict):
        return {
            redactar_secretos(str(clave)): _redactar_dato(elemento)
            for clave, elemento in valor.items()
        }
    if isinstance(valor, (list, tuple)):
        return [_redactar_dato(elemento) for elemento in valor]
    return valor
