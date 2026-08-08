#!/usr/bin/env python3
"""Job diario: el cerebro se digiere solo y cosecha a su autor.

Corre después de job_inbox (que ya procesó el Inbox y escribió la Orientación):
1. Pull del vault (el bot pudo haber escrito por GitHub).
2. `graphify update` — re-extracción determinística, SIN LLM, costo cero.
   El grafo se mira en Obsidian y se consulta con `graphify query` — la vista
   del grafo en App RAVN se borró el 28/07 (no servía).
3. Copia graph.json al ORGANISMO y corre cerebro.py: recalcula recientes,
   marchitas (ley organos_eternos) y diagnóstico, y elige LA pregunta del día.
4. Inserta la pregunta en `cerebro_preguntas` (Supabase). El bot de Railway la
   manda por WhatsApp a la mañana; la respuesta de Eze entra por el asesor y
   vuelve al vault — el ciclo queda cerrado.
"""
import json
import os
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
RAIZ_REPO = Path(__file__).resolve().parents[2]
if str(RAIZ_REPO) not in sys.path:
    sys.path.insert(0, str(RAIZ_REPO))

from daemon.memoria.graphify_batch import (
    MARCADOR_RELATIVO,
    SNAPSHOT_RELATIVO,
    actualizar_incremental,
    ejecutar_actualizacion,
    validar_graph_json,
)
from jobslib import VAULT, log, registrar_evento, rest, transaccion_vault

GRAPHIFY = "/Users/ezeotero/.local/bin/graphify"
GRAPHIFY_OUT = Path(VAULT) / "graphify-out"
ORGANISMO = Path.home() / "Documents" / "organismo"


def _run(cmd, timeout, paso, env=None):
    # cwd=VAULT: graphify escribe artefactos (manifest) relativo al cwd
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=VAULT,
                       env={**os.environ, **env} if env else None)
    if r.returncode != 0:
        raise RuntimeError(f"{paso}: {(r.stderr or r.stdout)[:300]}")
    return r.stdout


def correr(cfg, token):
    # 1-3. pull, re-extracción/export y push son una única transacción del Vault.
    def actualizar_grafo_completo():
        _run([GRAPHIFY, "update", VAULT], 900, "graphify update")
        validar_graph_json(Path(VAULT))
        _run(
            [GRAPHIFY, "export", "html", "--node-limit", "20000"],
            600,
            "export html",
            env={"GRAPHIFY_MAX_GRAPH_BYTES": "200000000"},
        )

    transaccion_vault(
        lambda: ejecutar_actualizacion(
            Path(VAULT), actualizar_grafo_completo, solo_si_pendiente=False
        ),
        rutas=lambda _resultado: [GRAPHIFY_OUT],
        mensaje="cerebro: grafo actualizado (job_cerebro)",
    )

    # 4. el ORGANISMO come el grafo nuevo y se autodiagnostica
    shutil.copy2(GRAPHIFY_OUT / "graph.json", ORGANISMO / "graph.json")
    out = _run(["python3", str(ORGANISMO / "cerebro.py")], 300, "cerebro.py")
    resultado = json.loads(out.strip().splitlines()[-1])

    # 5. la pregunta del día → Supabase (una por fecha; si ya existe, no pisa)
    pregunta = resultado.get("pregunta")
    insertada = False
    if pregunta:
        hoy = date.today().isoformat()
        existe = rest(cfg, token, f"cerebro_preguntas?fecha=eq.{hoy}&select=id")
        if not existe:
            rest(cfg, token, "cerebro_preguntas", method="POST", data={
                "fecha": hoy,
                "tipo": pregunta["tipo"],
                "objetivo": pregunta.get("objetivo"),
                "pregunta": pregunta["pregunta"],
            })
            insertada = True

    registrar_evento(cfg, token, "job_cerebro",
                     "cerebro digerido: grafo + diagnóstico + pregunta del día", {
                         "recientes": resultado.get("recientes"),
                         "marchitas": resultado.get("marchitas"),
                         "huerfanas": resultado.get("huerfanas"),
                         "hallazgos": resultado.get("hallazgos"),
                         "pregunta": (pregunta or {}).get("pregunta"),
                         "pregunta_insertada": insertada,
                     })
    log(f"job_cerebro OK — pregunta {'insertada' if insertada else 'ya existía / no hubo'}")


def correr_incremental(cfg, token):
    """Adaptador de runner; no toca red ni Supabase si no hay lote vencido."""
    vault = Path(VAULT)
    if not any(
        (vault / relativa).exists()
        for relativa in (MARCADOR_RELATIVO, SNAPSHOT_RELATIVO)
    ):
        return False
    return transaccion_vault(
        lambda: actualizar_incremental(vault, Path(GRAPHIFY)),
        rutas=lambda _resultado: [GRAPHIFY_OUT],
        mensaje="cerebro: grafo incremental",
    )
