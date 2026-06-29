#!/usr/bin/env python3
"""Job diario (~7h): Noticias del día para el tablero Tu Día.

Busca en vivo (Claude headless con WebSearch) las 3 noticias MÁS relevantes del
día en cada frente — economía, construcción e inmobiliario (mercado de
propiedades, NO muebles) — con foco Argentina / Zona Norte, y escribe 9 filas
en la tabla `noticias` de Supabase. El tablero las lee server-side y las
muestra arriba de las tareas.

Idempotente: borra las filas de HOY antes de insertar, así un catch-up (Mac
apagada) regenera limpio sin chocar con el índice único (fecha,categoria,orden).
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import correr_claude, log, registrar_evento, rest

CATEGORIAS = ("economia", "construccion", "inmobiliario")

PROMPT = """\
Sos el editor de noticias de Ezequiel Otero: constructor y dueño de Ravn \
(reformas y obra en Zona Norte, Gran Buenos Aires, Argentina) que además vende \
propiedades/sigue el mercado inmobiliario.

Usá la herramienta de búsqueda web (WebSearch) para encontrar las noticias MÁS \
relevantes y MÁS recientes de HOY (o de las últimas 24-48 h) en estos 3 frentes, \
con foco Argentina y, cuando aplique, Zona Norte / AMBA:

1. economia      — economía argentina: dólar, inflación, tasas, salarios, medidas \
del gobierno, mercados. Lo que mueva la aguja del bolsillo y de los costos de obra.
2. construccion  — construcción: costo del m2, precios de materiales, actividad del \
sector, créditos para obra, normativa, paros/insumos.
3. inmobiliario  — MERCADO DE PROPIEDADES (NO muebles): precio del m2, alquileres, \
créditos hipotecarios, compraventa, blanqueo, zonas, desarrollos. \
"inmobiliario" = real estate, jamás mobiliario/muebles.

Para CADA frente elegí exactamente las 3 noticias más importantes del día (las que \
un constructor que arranca el día querría saber sí o sí). Para cada noticia dame:
- "titulo": el titular, claro y corto (máx ~90 caracteres), en español.
- "porque": UNA sola línea explicando por qué le importa a Ezequiel \
(al dólar, a sus costos de obra, al m2 de Zona Norte, a vender una propiedad). \
Concreta y accionable, no genérica.
- "fuente": nombre del medio (ej: "Ámbito", "La Nación", "Infobae").
- "url": link directo a la nota.

Reglas:
- Solo noticias REALES que encontraste en la búsqueda, con su URL verdadera. \
Nada inventado. Si un frente está flojo hoy, igual traé las 3 mejores que existan.
- Priorizá Argentina. Contexto global solo si pega fuerte en lo local (ej: Fed, soja).

Respondé SOLO con un objeto JSON válido, sin texto antes ni después, sin ```:
{
  "economia":      [{"titulo":"","porque":"","fuente":"","url":""}, ... 3 items],
  "construccion":  [{"titulo":"","porque":"","fuente":"","url":""}, ... 3 items],
  "inmobiliario":  [{"titulo":"","porque":"","fuente":"","url":""}, ... 3 items]
}
"""


def extraer_json(texto):
    """Saca el primer objeto JSON del texto (tolera ``` y prosa alrededor)."""
    m = re.search(r"\{.*\}", texto, re.DOTALL)
    if not m:
        raise ValueError(f"la respuesta no traía JSON: {texto[:300]}")
    return json.loads(m.group(0))


def validar(data):
    """Confirma que estén las 3 categorías con items usables; devuelve filas limpias."""
    filas = []
    for cat in CATEGORIAS:
        items = data.get(cat) or []
        if not isinstance(items, list) or not items:
            raise ValueError(f"categoría '{cat}' vino vacía o mal")
        for orden, it in enumerate(items[:3]):
            titulo = (it.get("titulo") or "").strip()
            porque = (it.get("porque") or "").strip()
            if not titulo or not porque:
                continue
            filas.append({
                "categoria": cat,
                "orden": orden,
                "titulo": titulo[:200],
                "porque": porque[:300],
                "fuente": (it.get("fuente") or "").strip()[:80] or None,
                "url": (it.get("url") or "").strip() or None,
            })
    if len(filas) < 6:  # piso de cordura: al menos 2 por frente en promedio
        raise ValueError(f"muy pocas noticias válidas ({len(filas)})")
    return filas


def correr(cfg, token):
    fecha = date.today().isoformat()
    salida = correr_claude(PROMPT, timeout=900, modelo="sonnet")
    filas = validar(extraer_json(salida))
    for f in filas:
        f["fecha"] = fecha

    # idempotente: limpiar lo de hoy y reinsertar
    rest(cfg, token, f"noticias?fecha=eq.{fecha}", method="DELETE")
    rest(cfg, token, "noticias", data=filas, method="POST")

    por_cat = {c: sum(1 for f in filas if f["categoria"] == c) for c in CATEGORIAS}
    log(f"noticias {fecha}: {por_cat}")
    registrar_evento(
        cfg, token, "job_noticias",
        f"Noticias del día cargadas — {len(filas)} ({por_cat['economia']}e/"
        f"{por_cat['construccion']}c/{por_cat['inmobiliario']}i)",
        {"fecha": fecha, "total": len(filas), "por_categoria": por_cat},
    )
