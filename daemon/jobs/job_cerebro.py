#!/usr/bin/env python3
"""Job diario: el cerebro se digiere solo y cosecha a su autor.

Corre después de job_inbox (que ya procesó el Inbox y escribió la Orientación):
1. Pull del vault (el bot pudo haber escrito por GitHub).
2. `graphify update` — re-extracción determinística, SIN LLM, costo cero.
3. exportar-app.py + subir-a-app.sh → el grafo fresco llega a App RAVN.
4. Copia graph.json al ORGANISMO y corre cerebro.py: recalcula recientes,
   marchitas (ley organos_eternos) y diagnóstico, y elige LA pregunta del día.
5. Inserta la pregunta en `cerebro_preguntas` (Supabase). El bot de Railway la
   manda por WhatsApp a la mañana; la respuesta de Eze entra por el asesor y
   vuelve al vault — el ciclo queda cerrado.
"""
import json
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import GIT_VAULT, VAULT, log, push_vault, registrar_evento, rest

GRAPHIFY = "/Users/ezeotero/.local/bin/graphify"
PYTHON_GRAPHIFY = "/Users/ezeotero/.local/pipx/venvs/graphifyy/bin/python"
GRAPHIFY_OUT = Path(VAULT) / "graphify-out"
ORGANISMO = Path.home() / "Documents" / "organismo"


def _run(cmd, timeout, paso):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{paso}: {(r.stderr or r.stdout)[:300]}")
    return r.stdout


def correr(cfg, token):
    # 1. vault fresco (escritores: bot por GitHub + daemon por git)
    subprocess.run(GIT_VAULT + ["pull", "--rebase", "origin", "main"],
                   capture_output=True, text=True, timeout=120)

    # 2. re-extracción determinística del grafo (sin LLM)
    _run([GRAPHIFY, "update", VAULT], 900, "graphify update")

    # 3. export slim + subida al bucket de App RAVN
    _run([PYTHON_GRAPHIFY, str(GRAPHIFY_OUT / "exportar-app.py")], 300, "exportar-app")
    _run(["bash", str(GRAPHIFY_OUT / "subir-a-app.sh")], 120, "subir-a-app")

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

    # 6. persistir el grafo actualizado (graphify-out vive dentro del vault)
    try:
        push_vault("cerebro: grafo actualizado (job_cerebro)")
    except Exception as e:
        log(f"job_cerebro: push del vault falló (no fatal): {e}")

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
