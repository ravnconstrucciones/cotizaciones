"""Agrupa cierres de memoria antes de actualizar el grafo derivado."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile
from typing import Callable


MARCADOR_RELATIVO = Path("Sistema") / "Memoria" / ".graphify-pendiente"
SNAPSHOT_RELATIVO = Path("Sistema") / "Memoria" / ".graphify-en-proceso"
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

    def actualizar() -> None:
        resultado = subprocess.run(
            [str(graphify_bin), "update", str(vault)],
            capture_output=True,
            text=True,
            timeout=900,
            cwd=vault,
        )
        if resultado.returncode != 0:
            detalle = (resultado.stderr or resultado.stdout).strip()[:300]
            raise RuntimeError(
                f"graphify update: {detalle or f'exit {resultado.returncode}'}"
            )

        validar_graph_json(vault)

    return ejecutar_actualizacion(vault, actualizar, solo_si_pendiente=True)


def ejecutar_actualizacion(
    vault: Path,
    operacion: Callable[[], None],
    *,
    solo_si_pendiente: bool,
) -> bool:
    """Serializa Graphify y consume únicamente el lote tomado por este proceso."""
    vault = Path(vault)
    marker = vault / MARCADOR_RELATIVO
    snapshot = vault / SNAPSHOT_RELATIVO
    state = STATE
    lock_path = state.with_suffix(".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    with lock_path.open("a+b") as lock:
        _tomar_lock(lock)
        _recuperar_snapshot(marker, snapshot)
        if solo_si_pendiente and not debe_actualizar(
            marker, state, datetime.now(timezone.utc)
        ):
            return False

        consumio = _consumir_marcador(marker, snapshot)
        if solo_si_pendiente and not consumio:
            return False

        try:
            operacion()
            _escribir_estado(
                state,
                {"ultima_actualizacion": datetime.now(timezone.utc).isoformat()},
            )
            snapshot.unlink(missing_ok=True)
        except BaseException:
            _restaurar_snapshot(marker, snapshot)
            raise
    return True


def validar_graph_json(vault: Path) -> None:
    """Confirma que la salida publicada por Graphify existe y es JSON válido."""
    graph = Path(vault) / "graphify-out" / "graph.json"
    try:
        with graph.open(encoding="utf-8") as archivo:
            json.load(archivo)
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(
            f"Graphify no produjo un graph.json válido: {graph}"
        ) from error


def _tomar_lock(lock) -> None:
    fcntl.flock(lock.fileno(), fcntl.LOCK_EX)


def _consumir_marcador(marker: Path, snapshot: Path) -> bool:
    try:
        os.replace(marker, snapshot)
    except FileNotFoundError:
        return False
    return True


def _recuperar_snapshot(marker: Path, snapshot: Path) -> None:
    if not snapshot.exists():
        return
    if marker.exists():
        snapshot.unlink()
    else:
        os.replace(snapshot, marker)


def _restaurar_snapshot(marker: Path, snapshot: Path) -> None:
    if not snapshot.exists():
        marcar_cierre(marker.parents[2])
    elif marker.exists():
        snapshot.unlink()
    else:
        os.replace(snapshot, marker)


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
