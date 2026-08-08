"""Adaptadores tolerantes para los JSONL de sesiones de Codex y Claude."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
from typing import Any, Literal

from .modelo import Mensaje, redactar_secretos


Host = Literal["codex", "claude"]
_UUID = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
_MAX_TOOL_PAYLOAD = 2_000
_TOOL_PREFIX = 1_500


def leer_codex(path: Path) -> list[Mensaje]:
    """Normaliza una sesión JSONL de Codex al contrato ``Mensaje``."""
    return _leer(path, "codex")


def leer_claude(path: Path) -> list[Mensaje]:
    """Normaliza una sesión JSONL de Claude al contrato ``Mensaje``."""
    return _leer(path, "claude")


def leer_sesion(path: Path) -> list[Mensaje]:
    """Lee y normaliza una sesión con una única pasada sobre el JSONL."""
    registros, errores_parseo = _cargar_registros(path)
    return _normalizar(registros, errores_parseo, _detectar_host(registros, path), path)


def detectar_host(path: Path) -> Host:
    """Identifica el host por las entradas JSONL, sin depender del nombre."""
    return _detectar_host(_registros_validos(path), path)


def _detectar_host(registros: list[dict[str, Any]], path: Path) -> Host:
    for registro in registros:
        tipo = registro.get("type")
        payload = registro.get("payload")
        if tipo in {
            "session_meta",
            "response_item",
            "event_msg",
            "custom_tool_call_output",
            "function_call_output",
            "tool_search_output",
        }:
            return "codex"
        if isinstance(payload, dict) and payload.get("type") == "message":
            return "codex"
        if tipo in {"user", "assistant", "tool_result"}:
            return "claude"
    raise ValueError(f"No se pudo detectar el host de la sesión: {path}")


def descubrir_sesiones() -> list[Path]:
    """Devuelve sesiones JSONL conocidas de ambos hosts, sin leer su contenido."""
    raices = (Path.home() / ".codex" / "sessions", Path.home() / ".claude" / "projects")
    sesiones = {
        archivo
        for raiz in raices
        if raiz.is_dir()
        for archivo in raiz.rglob("*.jsonl")
        if archivo.is_file() and not _es_artefacto_no_sesion(archivo)
    }
    return sorted(sesiones)


def _leer(path: Path, host: Host) -> list[Mensaje]:
    registros, errores_parseo = _cargar_registros(path)
    return _normalizar(registros, errores_parseo, host, path)


def _normalizar(
    registros: list[dict[str, Any]], errores_parseo: int, host: Host, path: Path
) -> list[Mensaje]:
    thread_id = _thread_id(registros, path)
    mensajes: list[Mensaje] = []

    for registro in registros:
        if host == "codex":
            mensaje = _mensaje_codex(registro, thread_id, errores_parseo)
            if mensaje is not None:
                mensajes.append(mensaje)
        else:
            mensajes.extend(_mensajes_claude(registro, thread_id, errores_parseo))
    return mensajes


def _es_artefacto_no_sesion(path: Path) -> bool:
    nombre = path.name.casefold()
    return nombre in {"journal.jsonl", "workflow-journal.jsonl"}


def _cargar_registros(path: Path) -> tuple[list[dict[str, Any]], int]:
    registros: list[dict[str, Any]] = []
    errores_parseo = 0
    with path.open(encoding="utf-8") as archivo:
        for linea in archivo:
            if not linea.strip():
                continue
            try:
                registro = json.loads(linea)
            except json.JSONDecodeError:
                errores_parseo += 1
                continue
            if isinstance(registro, dict):
                registros.append(registro)
            else:
                errores_parseo += 1
    return registros, errores_parseo


def _registros_validos(path: Path) -> list[dict[str, Any]]:
    return _cargar_registros(path)[0]


def _thread_id(registros: list[dict[str, Any]], path: Path) -> str:
    for registro in registros:
        if registro.get("type") != "session_meta":
            continue
        valor = _buscar_id(registro, incluir_ids_genericos=True)
        if valor:
            return valor

    for registro in registros:
        valor = _buscar_id(registro, incluir_ids_genericos=False)
        if valor:
            return valor

    coincidencia = _UUID.search(path.name)
    return coincidencia.group(0) if coincidencia else path.stem


def _buscar_id(registro: dict[str, Any], *, incluir_ids_genericos: bool) -> str | None:
    for origen in (registro, registro.get("payload"), registro.get("message")):
        if not isinstance(origen, dict):
            continue
        claves = ("thread_id", "threadId", "session_id", "sessionId")
        if incluir_ids_genericos:
            claves += ("id", "uuid")
        for clave in claves:
            valor = origen.get(clave)
            if isinstance(valor, str) and valor:
                return valor
    return None


def _mensaje_codex(registro: dict[str, Any], thread_id: str, errores: int) -> Mensaje | None:
    payload = registro.get("payload")
    cuerpo = payload if isinstance(payload, dict) else registro
    tipo = cuerpo.get("type", registro.get("type"))
    if tipo == "message":
        autor = cuerpo.get("role")
        if autor not in {"user", "assistant"}:
            return None
        texto = _texto(cuerpo.get("content"))
        return _crear_mensaje("codex", thread_id, registro, autor, "message", texto, errores)
    if tipo in {
        "custom_tool_call_output",
        "function_call_output",
        "tool_search_output",
        "tool_result",
    }:
        texto = _texto(cuerpo.get("output", cuerpo.get("content", cuerpo.get("result"))))
        return _crear_mensaje("codex", thread_id, registro, "tool", "tool_output", texto, errores)
    return None


def _mensajes_claude(registro: dict[str, Any], thread_id: str, errores: int) -> list[Mensaje]:
    tipo = registro.get("type")
    if tipo in {"user", "assistant"}:
        message = registro.get("message")
        contenido = message.get("content") if isinstance(message, dict) else registro.get("content")
        bloques = contenido if isinstance(contenido, list) else [contenido]
        textos = [_texto(bloque) for bloque in bloques if _es_bloque_texto(bloque)]
        mensajes = [
            _crear_mensaje(
                "claude", thread_id, registro, tipo, "message", "\n".join(filter(None, textos)), errores
            )
        ] if any(textos) else []
        mensajes.extend(
            _mensaje_tool_use("claude", thread_id, registro, bloque, errores)
            for bloque in bloques
            if isinstance(bloque, dict) and bloque.get("type") == "tool_use"
        )
        mensajes.extend(
            _crear_mensaje(
                "claude", thread_id, registro, "tool", "tool_output", _texto(bloque.get("content")), errores
            )
            for bloque in bloques
            if isinstance(bloque, dict) and bloque.get("type") == "tool_result"
        )
        return mensajes
    if tipo == "tool_result":
        return [
            _crear_mensaje(
                "claude", thread_id, registro, "tool", "tool_output", _texto(registro.get("content")), errores
            )
        ]
    return []


def _es_bloque_texto(bloque: Any) -> bool:
    return isinstance(bloque, str) or (
        isinstance(bloque, dict) and bloque.get("type") == "text"
    )


def _mensaje_tool_use(
    host: Host,
    thread_id: str,
    registro: dict[str, Any],
    bloque: dict[str, Any],
    errores: int,
) -> Mensaje:
    nombre = _nombre_tool_seguro(bloque.get("name"))
    entrada = json.dumps(
        bloque.get("input"), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    digest = hashlib.sha256(entrada.encode("utf-8")).hexdigest()
    return _crear_mensaje(
        host,
        thread_id,
        registro,
        "tool",
        "tool_use",
        f"{nombre} sha256={digest}",
        errores,
        metadata={"tool_name": nombre, "sha256": digest},
    )


def _nombre_tool_seguro(valor: Any) -> str:
    nombre = redactar_secretos(valor if isinstance(valor, str) else "<sin-nombre>")
    return re.sub(r"[\r\n\t]+", " ", nombre)[:128]


def _crear_mensaje(
    host: Host,
    thread_id: str,
    registro: dict[str, Any],
    autor: str,
    tipo: str,
    texto: str,
    errores_parseo: int,
    metadata: dict[str, Any] | None = None,
) -> Mensaje:
    texto = redactar_secretos(texto)
    if autor == "tool":
        texto = _resumir_tool(texto)
    return Mensaje(
        host=host,
        thread_id=thread_id,
        timestamp=_timestamp(registro),
        autor=autor,
        tipo=tipo,
        texto=texto,
        metadata={"errores_parseo": errores_parseo, **(metadata or {})},
    )


def _timestamp(registro: dict[str, Any]) -> str:
    for origen in (registro, registro.get("payload"), registro.get("message")):
        if isinstance(origen, dict) and origen.get("timestamp") is not None:
            return str(origen["timestamp"])
    return ""


def _texto(valor: Any) -> str:
    if isinstance(valor, str):
        return valor
    if isinstance(valor, list):
        return "\n".join(texto for item in valor if (texto := _texto(item)))
    if isinstance(valor, dict):
        for clave in ("text", "output", "content", "result"):
            if clave in valor:
                return _texto(valor[clave])
        return json.dumps(valor, ensure_ascii=False, sort_keys=True)
    if valor is None:
        return ""
    return str(valor)


def _resumir_tool(texto: str) -> str:
    if len(texto) <= _MAX_TOOL_PAYLOAD:
        return texto
    digest = hashlib.sha256(texto.encode("utf-8")).hexdigest()
    return f"{texto[:_TOOL_PREFIX]}[TRUNCADO sha256={digest}]"
