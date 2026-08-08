"""Orquestación neutral de host para cerrar una sesión de memoria."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path
from typing import Any

from .almacen import AlmacenMemoria, _crudo_a_markdown, claves_indice
from .colectores import leer_sesion
from .graphify_batch import marcar_cierre
from .modelo import Cierre, Mensaje, validar_cierre


class FalloPersistencia(RuntimeError):
    """La escritura ocurrió parcialmente o no pudo comprobarse."""


def cerrar(
    vault: Path,
    datos: dict[str, Any],
    *,
    session_path: Path | None = None,
    host: str | None = None,
    thread_id: str | None = None,
) -> dict[str, object]:
    """Persiste un cierre y devuelve evidencia solo después de reabrirla."""
    mensajes = _leer_mensajes(session_path)
    cierre = validar_cierre(_completar_metadata(datos, mensajes, host, thread_id))
    mensajes = _completar_fechas(mensajes, cierre.fecha_inicio)
    almacen = AlmacenMemoria(vault)

    try:
        crudo = almacen.guardar_crudo(mensajes) if mensajes else None
        if crudo is not None:
            fuente_real = _relativa(almacen.vault, crudo)
            cierre = replace(cierre, fuente_cruda=fuente_real)
            _verificar_crudo(crudo, mensajes)
        else:
            _verificar_fuente_referenciada(almacen, cierre.fuente_cruda)
        ruta_cierre = almacen.guardar_cierre(cierre)
        _verificar_cierre(almacen.vault, ruta_cierre, cierre)
        _verificar_indice(almacen.vault, ruta_cierre, cierre)
        marcar_cierre(almacen.vault)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise FalloPersistencia(str(error)) from error

    return {
        "ok": True,
        "cierre": _relativa(almacen.vault, ruta_cierre),
        "crudo": _relativa(almacen.vault, crudo) if crudo is not None else "",
        "indexado": True,
    }


def _leer_mensajes(session_path: Path | None) -> list[Mensaje]:
    if session_path is None:
        return []
    return leer_sesion(Path(session_path))


def _completar_metadata(
    datos: dict[str, Any], mensajes: list[Mensaje], host: str | None, thread_id: str | None
) -> dict[str, Any]:
    """Completa solo los campos ausentes: stdin mantiene siempre prioridad."""
    if not isinstance(datos, dict):
        return datos

    completo = dict(datos)
    inferido = mensajes[0] if mensajes else None
    for campo, alternativa in (
        ("host", host or (inferido.host if inferido else None)),
        ("thread_id", thread_id or (inferido.thread_id if inferido else None)),
    ):
        if not completo.get(campo) and alternativa:
            completo[campo] = alternativa
    return completo


def _completar_fechas(mensajes: list[Mensaje], fecha_inicio: str) -> list[Mensaje]:
    """Mantiene un crudo archivabile si el transcript omitió timestamps."""
    return [replace(mensaje, timestamp=mensaje.timestamp or fecha_inicio) for mensaje in mensajes]


def _verificar_cierre(vault: Path, ruta: Path, cierre: Cierre) -> None:
    contenido = _reabrir(ruta)
    if f"id: {cierre.id}\n" not in contenido:
        raise ValueError(f"El cierre reabierto no corresponde al id esperado: {ruta}")


def _verificar_indice(vault: Path, ruta_cierre: Path, cierre: Cierre) -> None:
    indice_path = vault / "Sistema" / "Memoria" / "indices" / "entidades.json"
    indice = json.loads(_reabrir(indice_path))
    entidades = indice.get("entidades") if isinstance(indice, dict) else None
    if not isinstance(entidades, dict):
        raise ValueError(f"Índice de entidades inválido: {indice_path}")

    ruta = _relativa(vault, ruta_cierre)
    for clave, origen in claves_indice(cierre):
        entradas = entidades.get(clave)
        if not isinstance(entradas, list) or not any(
            isinstance(entrada, dict)
            and entrada.get("ruta") == ruta
            and entrada.get("origen") == origen
            for entrada in entradas
        ):
            raise ValueError(f"El índice reabierto no contiene el cierre: {ruta}")


def _verificar_crudo(ruta: Path, mensajes: list[Mensaje]) -> None:
    esperado = _crudo_a_markdown(mensajes)
    if _reabrir(ruta) != esperado:
        raise OSError(f"La fuente cruda escrita no coincide con la sesión: {ruta}")


def _verificar_fuente_referenciada(almacen: AlmacenMemoria, referencia: str) -> Path:
    relativa = Path(referencia)
    raiz_relativa = Path("Conversaciones") / "crudo"
    motivo = ""
    if relativa.is_absolute() or relativa.parts[:2] != raiz_relativa.parts:
        motivo = "la referencia debe ser relativa y estar bajo Conversaciones/crudo"
    else:
        candidata = almacen.vault / relativa
        raiz_real = (almacen.vault / raiz_relativa).resolve()
        try:
            destino_real = candidata.resolve(strict=True)
        except OSError:
            motivo = "la referencia no existe"
        else:
            if not destino_real.is_relative_to(raiz_real) or not destino_real.is_file():
                motivo = "la referencia no apunta a un archivo confinado en Conversaciones/crudo"
            else:
                return candidata

    almacen.marcar_pendiente(
        "fuente_cruda_inexistente",
        {"fuente_cruda": referencia, "error": motivo},
    )
    raise OSError(f"Fuente cruda inválida: {referencia}; {motivo}.")


def _reabrir(ruta: Path) -> str:
    return ruta.read_text(encoding="utf-8")


def _relativa(vault: Path, ruta: Path) -> str:
    return ruta.relative_to(vault).as_posix()
