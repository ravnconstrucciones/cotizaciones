#!/usr/bin/env python3
"""Job mensual: vincula cada ítem del maestro de precios con su tarea SISMAT más cercana.

Flujo:
  1. Carga tasks.json (SISMAT local) y los ítems de maestro_precios_items.
  2. Por cada ítem, busca la tarea SISMAT cuyo nombre normalizado tenga mayor
     similitud con el nombre del ítem (difflib.SequenceMatcher).
  3. Solo actualiza los campos sismat_* si el score >= UMBRAL (matcheo conservador).
     NUNCA toca costo_mo_m2 ni costo_materiales_m2 (campos manuales del maestro).
  4. Escribe sismat_ultima_sync en maestro_precios_gestion.
  5. Registra el evento en la tabla eventos.

Vencimiento: mensual (mismo ritmo que job_sismat, corre después).
Se dispara también si meta.json es más nuevo que sismat_ultima_sync.
"""
import json
import sys
import unicodedata
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, log, registrar_evento, rest

SISMAT_DIR = Path(VAULT) / "Conocimiento" / "Precios" / "sismat"
UMBRAL = 0.70  # score mínimo para considerar matcheo inequívoco


# ---------- normalización ----------

def normalizar(texto: str) -> str:
    """Minúsculas, sin acentos, sin signos de puntuación relevantes."""
    sin_tilde = unicodedata.normalize("NFD", texto.lower())
    sin_tilde = "".join(c for c in sin_tilde if unicodedata.category(c) != "Mn")
    return " ".join(sin_tilde.split())


# ---------- carga del SISMAT local ----------

def cargar_tareas_sismat() -> list[dict]:
    """Devuelve lista plana de todas las tareas con id, nombre, manpower_cost."""
    data = json.loads((SISMAT_DIR / "tasks.json").read_text())
    tareas = []
    for etapa in data:
        for t in etapa.get("tasks", []):
            costo = float(t.get("manpower_cost") or 0)
            if costo > 0:  # las tareas con costo 0 no aportan referencia útil
                tareas.append({
                    "id": t["id"],
                    "name": t["name"],
                    "name_norm": normalizar(t["name"]),
                    "manpower_cost": costo,
                })
    return tareas


# ---------- matcheo ----------

def mejor_match(nombre_item: str, tareas: list[dict]) -> tuple[dict | None, float]:
    """Devuelve (tarea, score) del mejor match; (None, 0) si no supera el umbral."""
    nombre_norm = normalizar(nombre_item)
    mejor: dict | None = None
    mejor_score = 0.0
    for t in tareas:
        s = SequenceMatcher(None, nombre_norm, t["name_norm"]).ratio()
        if s > mejor_score:
            mejor_score = s
            mejor = t
    if mejor_score >= UMBRAL:
        return mejor, mejor_score
    return None, mejor_score


# ---------- decisión de correr ----------

def sismat_es_mas_nuevo_que_sync(meta_fecha: str, ultima_sync: str | None) -> bool:
    """True si la descarga SISMAT es posterior a la última sync del maestro."""
    if ultima_sync is None:
        return True
    try:
        return date.fromisoformat(meta_fecha) > date.fromisoformat(ultima_sync)
    except ValueError:
        return True


# ---------- job principal ----------

def correr(cfg: dict, token: str) -> None:
    meta = json.loads((SISMAT_DIR / "meta.json").read_text())
    fecha_sismat = meta.get("descargado", "")

    # verificar si hay algo que actualizar
    gest = rest(cfg, token, "maestro_precios_gestion?id=eq.1&select=sismat_ultima_sync")
    ultima_sync = None
    if gest:
        ultima_sync = (gest[0] or {}).get("sismat_ultima_sync")
    if not sismat_es_mas_nuevo_que_sync(fecha_sismat, ultima_sync):
        log("job_maestro: SISMAT sin cambios desde la última sync, no es necesario re-correr")
        return

    tareas = cargar_tareas_sismat()
    log(f"job_maestro: {len(tareas)} tareas SISMAT con costo > 0")

    items = rest(cfg, token, "maestro_precios_items?select=id,nombre_trabajo&order=sort_order.asc")
    if not items:
        log("job_maestro: sin ítems en el maestro, nada que hacer")
        return

    hoy = date.today().isoformat()
    matcheados = 0
    sin_match = 0

    for item in items:
        item_id = item["id"]
        nombre = item.get("nombre_trabajo") or ""
        if not nombre.strip():
            continue

        tarea, score = mejor_match(nombre, tareas)
        if tarea is None:
            sin_match += 1
            log(f"  sin match: '{nombre}' (mejor score: {score:.2f})")
            continue

        patch = {
            "sismat_costo_mo": round(tarea["manpower_cost"], 2),
            "sismat_match": tarea["name"],
            "sismat_actualizado": hoy,
        }
        rest(
            cfg, token,
            f"maestro_precios_items?id=eq.{item_id}",
            data=patch,
            method="PATCH",
        )
        matcheados += 1
        log(f"  match: '{nombre}' -> '{tarea['name']}' (score: {score:.2f}, MO: ${tarea['manpower_cost']:,.0f})")

    # actualizar singleton gestión
    rest(
        cfg, token,
        "maestro_precios_gestion?id=eq.1",
        data={"sismat_ultima_sync": hoy},
        method="PATCH",
    )

    resumen = (
        f"Maestro ← SISMAT: {matcheados} ítems matcheados, {sin_match} sin match. "
        f"Base SISMAT del {fecha_sismat}."
    )
    log(f"job_maestro: {resumen}")

    registrar_evento(
        cfg, token, "job_maestro",
        resumen,
        {
            "matcheados": matcheados,
            "sin_match": sin_match,
            "sismat_descargado": fecha_sismat,
            "sync_fecha": hoy,
        },
    )
