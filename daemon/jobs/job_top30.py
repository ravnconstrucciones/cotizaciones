#!/usr/bin/env python3
"""Job semanal: refresca los precios de materiales-construccion.md con Claude headless.

La IA busca precios en internet (WebSearch) usando la "Query de actualización"
de cada fila. El código verifica después que la columna Fecha de las filas de
materiales quedó con la fecha del día (la fecha en el bloque DOLAR no cuenta).
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, correr_claude, push_vault, registrar_evento

MD_PRECIOS = Path(VAULT) / "Conocimiento" / "Precios" / "materiales-construccion.md"
MAX_FILAS = 30
TIMEOUT = 1500  # 25 min — busca ~20-30 precios


def filas_materiales(md):
    """Filas de datos de las tablas (excluye encabezados y separadores)."""
    filas = []
    for linea in md.splitlines():
        l = linea.strip()
        if l.startswith("|") and not l.startswith("|--") and not l.startswith("| Material"):
            filas.append(l)
    return filas


def filas_con_fecha(md, fecha):
    """Cuántas filas de datos tienen `fecha` en su columna Fecha (4ª celda).

    Es la verificación post-Claude: job_dolar escribe la fecha de hoy en el MISMO
    archivo (bloque <!-- DOLAR -->), así que buscar la fecha en el texto entero
    daría falso OK. Acá solo cuenta la celda Fecha de cada fila de material.
    """
    n = 0
    for fila in filas_materiales(md):
        celdas = [c.strip() for c in fila.split("|")]
        # fila = "| Material | Unidad | Último precio | Fecha | Fuente | Query |"
        # split("|") → ["", Material, Unidad, Último precio, Fecha, Fuente, Query, ""]
        if len(celdas) > 4 and celdas[4] == fecha:
            n += 1
    return n


def armar_prompt(fecha, ruta_md, n_filas):
    return f"""Sos el actualizador semanal de precios de materiales de Ravn, corriendo headless en la Mac de Ezequiel.

ARCHIVO A ACTUALIZAR: {ruta_md}
(tiene {n_filas} filas de materiales; máximo a procesar: {MAX_FILAS})

1. Leé el archivo. Cada tabla tiene columnas: Material | Unidad | Último precio | Fecha | Fuente | Query de actualización.
2. Para CADA fila, buscá el precio actual en internet (WebSearch) usando la "Query de actualización" de esa fila. Anotá el precio más representativo (no el más barato ni el más caro); si hay mucha dispersión, registrá el rango.
3. Editá la fila actualizando SOLO: "Último precio", "Fecha" (poné {fecha}) y "Fuente" (link o sitio real de donde salió). NO toques Material, Unidad ni Query de actualización. NO agregues ni borres filas ni secciones. NO toques el bloque <!-- DOLAR:START --> ... <!-- DOLAR:END -->.
4. Si para una fila no encontrás precio confiable, dejala EXACTAMENTE como está (precio y fecha viejos) — nunca inventes un valor.
5. Al final respondé SOLO con una línea de resumen: "actualizadas X de {n_filas} filas" y, si quedaron sin actualizar, cuáles.
"""


def correr(cfg, token):
    fecha = date.today().isoformat()
    md_antes = MD_PRECIOS.read_text()
    n = len(filas_materiales(md_antes))
    if n == 0:
        raise RuntimeError(f"no encontré filas de materiales en {MD_PRECIOS}")
    resumen = correr_claude(armar_prompt(fecha, str(MD_PRECIOS), n), timeout=TIMEOUT)
    md_despues = MD_PRECIOS.read_text()
    actualizadas = filas_con_fecha(md_despues, fecha)
    if actualizadas == 0:
        # OJO: no buscar `fecha in md_despues` — el bloque DOLAR (job_dolar, mismo
        # archivo, corre antes en el mismo tick) ya tiene la fecha de hoy y daría
        # falso OK. Solo cuenta la columna Fecha de las filas de materiales.
        raise RuntimeError(f"ninguna fila quedó con Fecha {fecha} — Claude no actualizó nada. Resumen: {resumen[:300]}")
    push_vault(f"daemon: refresh semanal top-30 materiales {fecha}")
    registrar_evento(
        cfg, token, "job_top30",
        f"Materiales refrescados — {resumen[:120]}",
        {"fecha": fecha, "filas_totales": n, "filas_actualizadas": actualizadas, "resumen": resumen[:1000]},
    )
