#!/usr/bin/env python3
"""Job mensual: vincula cada ítem del maestro de precios con su tarea SISMAT más cercana.

Flujo:
  1. Carga tasks.json (SISMAT local), maestro_aliases.json y los ítems de
     maestro_precios_items.
  2. Por cada ítem, primero busca un alias manual (maestro_aliases.json):
     alias → tarea SISMAT exacta; alias null → "sin equivalente SISMAT"
     declarado a mano (no se busca ni se cuenta como falla).
  3. Sin alias, busca la tarea SISMAT cuyo nombre normalizado tenga mayor
     similitud con el nombre del ítem (difflib.SequenceMatcher).
  4. Solo actualiza los campos sismat_* si hay alias o score >= UMBRAL
     (matcheo conservador). NUNCA toca costo_mo_m2 ni costo_materiales_m2
     (campos manuales del maestro).
  5. Escribe sismat_ultima_sync en maestro_precios_gestion.
  6. Registra el evento en la tabla eventos.

Vencimiento: mensual (mismo ritmo que job_sismat, corre después).
Se dispara también si meta.json o maestro_aliases.json son más nuevos que
sismat_ultima_sync.
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
ALIASES_PATH = Path(__file__).resolve().parent / "maestro_aliases.json"
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


# ---------- aliases manuales ----------

# Sentinela: distingue "sin alias" de "alias null = sin equivalente declarado".
SIN_ALIAS = object()


def cargar_aliases() -> dict:
    """Mapa nombre_normalizado → nombre de tarea SISMAT (o None = sin equivalente)."""
    if not ALIASES_PATH.exists():
        return {}
    data = json.loads(ALIASES_PATH.read_text())
    return {normalizar(k): v for k, v in data.get("aliases", {}).items()}


def resolver_alias(nombre_item: str, aliases: dict, tareas: list[dict]):
    """Devuelve la tarea SISMAT del alias, None (sin equivalente declarado),
    o SIN_ALIAS si el ítem no tiene alias."""
    valor = aliases.get(normalizar(nombre_item), SIN_ALIAS)
    if valor is SIN_ALIAS or valor is None:
        return valor
    valor_norm = normalizar(valor)
    candidatas = [t for t in tareas if t["name_norm"] == valor_norm]
    if not candidatas:
        log(f"  ALIAS ROTO: '{nombre_item}' apunta a '{valor}' que no existe en SISMAT")
        return SIN_ALIAS  # cae al fuzzy como antes
    if len(candidatas) > 1:
        log(f"  alias ambiguo: '{valor}' aparece {len(candidatas)} veces en SISMAT, uso la primera")
    return candidatas[0]


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
    # edición de aliases el mismo día de la sync también dispara (>=, no >):
    # re-correr es barato e idempotente, quedarse viejo no.
    aliases_tocados = False
    if ALIASES_PATH.exists():
        mtime = date.fromtimestamp(ALIASES_PATH.stat().st_mtime).isoformat()
        aliases_tocados = ultima_sync is None or mtime >= ultima_sync
    if not sismat_es_mas_nuevo_que_sync(fecha_sismat, ultima_sync) and not aliases_tocados:
        log("job_maestro: SISMAT y aliases sin cambios desde la última sync, no es necesario re-correr")
        return

    tareas = cargar_tareas_sismat()
    aliases = cargar_aliases()
    log(f"job_maestro: {len(tareas)} tareas SISMAT con costo > 0, {len(aliases)} aliases manuales")

    items = rest(cfg, token, "maestro_precios_items?select=id,nombre_trabajo&order=sort_order.asc")
    if not items:
        log("job_maestro: sin ítems en el maestro, nada que hacer")
        return

    hoy = date.today().isoformat()
    matcheados = 0
    sin_match = 0
    sin_equivalente = 0

    for item in items:
        item_id = item["id"]
        nombre = item.get("nombre_trabajo") or ""
        if not nombre.strip():
            continue

        resuelto = resolver_alias(nombre, aliases, tareas)
        via = "alias"
        if resuelto is None:
            # declarado a mano: este laburo no existe en SISMAT
            sin_equivalente += 1
            log(f"  sin equivalente SISMAT (alias manual): '{nombre}'")
            continue
        if resuelto is SIN_ALIAS:
            resuelto, score = mejor_match(nombre, tareas)
            via = f"score: {score:.2f}"
            if resuelto is None:
                sin_match += 1
                log(f"  sin match: '{nombre}' (mejor score: {score:.2f}) — agregable a maestro_aliases.json")
                continue
        tarea = resuelto

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
        log(f"  match: '{nombre}' -> '{tarea['name']}' ({via}, MO: ${tarea['manpower_cost']:,.0f})")

    # actualizar singleton gestión
    rest(
        cfg, token,
        "maestro_precios_gestion?id=eq.1",
        data={"sismat_ultima_sync": hoy},
        method="PATCH",
    )

    resumen = (
        f"Maestro ← SISMAT: {matcheados} ítems matcheados, {sin_match} sin match, "
        f"{sin_equivalente} sin equivalente SISMAT (manual). Base SISMAT del {fecha_sismat}."
    )
    log(f"job_maestro: {resumen}")

    registrar_evento(
        cfg, token, "job_maestro",
        resumen,
        {
            "matcheados": matcheados,
            "sin_match": sin_match,
            "sin_equivalente": sin_equivalente,
            "sismat_descargado": fecha_sismat,
            "sync_fecha": hoy,
        },
    )
