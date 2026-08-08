"""Agrupa cierres de memoria antes de actualizar el grafo derivado."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile


MARCADOR_RELATIVO = Path("Sistema") / "Memoria" / ".graphify-pendiente"
STATE = Path.home() / ".ravn-jobs" / "graphify-memoria.json"
VENTANA = timedelta(minutes=15)


def debe_actualizar(marker: Path, state: Path, ahora: datetime) -> bool:
    """Indica si hay un cierre pendiente y terminó la ventana de agrupación."""
    if not marker.exists():
        return False
    if not state.exists():
        return True

    try:
        datos = json.loads(state.read_text(encoding="utf-8"))
        ultima = datetime.fromisoformat(datos["ultima_actualizacion"])
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return True

    return _normalizar(ahora) - _normalizar(ultima) >= VENTANA


def marcar_cierre(vault: Path) -> None:
    """Deja una marca barata; actualizar Graphify ocurre fuera del cierre."""
    marker = Path(vault) / MARCADOR_RELATIVO
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.touch()


def actualizar_incremental(vault: Path, graphify_bin: Path) -> bool:
    """Actualiza Graphify una vez por lote y conserva fallos para reintento."""
    vault = Path(vault)
    marker = vault / MARCADOR_RELATIVO
    ahora = datetime.now(timezone.utc)
    if not debe_actualizar(marker, STATE, ahora):
        return False

    marca_inicial = marker.stat().st_mtime_ns
    resultado = subprocess.run(
        [str(graphify_bin), "update", str(vault), "--no-viz"],
        capture_output=True,
        text=True,
        timeout=900,
        cwd=vault,
    )
    if resultado.returncode != 0:
        detalle = (resultado.stderr or resultado.stdout).strip()[:300]
        raise RuntimeError(f"graphify update: {detalle or f'exit {resultado.returncode}'}")

    graph = vault / "graphify-out" / "graph.json"
    try:
        with graph.open(encoding="utf-8") as archivo:
            json.load(archivo)
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Graphify no produjo un graph.json válido: {graph}") from error

    _escribir_estado(STATE, {"ultima_actualizacion": datetime.now(timezone.utc).isoformat()})
    if marker.exists() and marker.stat().st_mtime_ns == marca_inicial:
        marker.unlink()
    return True


def _normalizar(instante: datetime) -> datetime:
    if instante.tzinfo is None:
        return instante.replace(tzinfo=timezone.utc)
    return instante.astimezone(timezone.utc)


def _escribir_estado(path: Path, datos: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporal: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, delete=False
        ) as archivo:
            temporal = Path(archivo.name)
            json.dump(datos, archivo, ensure_ascii=False, indent=2, sort_keys=True)
            archivo.write("\n")
            archivo.flush()
            os.fsync(archivo.fileno())
        os.replace(temporal, path)
        temporal = None
    finally:
        if temporal is not None:
            temporal.unlink(missing_ok=True)
