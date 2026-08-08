#!/usr/bin/env python3
"""Job mensual: sincroniza la base SISMAT al vault corriendo el sync.py existente.

SISMAT actualiza precios los primeros días del mes → el runner lo dispara
a partir del día 2. La verificación es que meta.json quede con fecha de hoy.
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, registrar_evento, transaccion_vault

SISMAT_DIR = Path(VAULT) / "Conocimiento" / "Precios" / "sismat"
PYTHON = sys.executable  # el mismo 3.13 del framework (tiene certifi)


def meta_es_de_hoy(meta, hoy):
    return meta.get("descargado") == hoy.isoformat()


def correr(cfg, token):
    def persistir():
        resultado = subprocess.run(
            [PYTHON, str(SISMAT_DIR / "sync.py")],
            capture_output=True,
            text=True,
            timeout=300,
        )
        if resultado.returncode != 0:
            raise RuntimeError(
                f"sync.py exit {resultado.returncode}: "
                f"{(resultado.stderr or resultado.stdout)[:500]}"
            )
        meta_local = json.loads((SISMAT_DIR / "meta.json").read_text())
        if not meta_es_de_hoy(meta_local, date.today()):
            raise RuntimeError(
                "meta.json no quedó actualizado: "
                f"descargado={meta_local.get('descargado')}"
            )
        return meta_local

    meta = transaccion_vault(
        persistir,
        rutas=lambda _resultado: [
            SISMAT_DIR / "tasks.json",
            SISMAT_DIR / "materials.json",
            SISMAT_DIR / "meta.json",
        ],
        mensaje="daemon: SISMAT sync mensual",
    )
    registrar_evento(
        cfg, token, "job_sismat",
        f"SISMAT sincronizado — {meta.get('tareas')} tareas MO, {meta.get('materiales')} materiales",
        meta,
    )
