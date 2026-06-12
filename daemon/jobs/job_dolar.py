#!/usr/bin/env python3
"""Job diario: cotización del dólar SIN IA (Bluelytics → fallback DolarAPI).

Escribe Conocimiento/Precios/dolar.json (canónico) + bloque arriba de
materiales-construccion.md, pushea el vault y registra el evento.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, http_json, push_vault, registrar_evento

URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/latest"
URL_DOLARAPI = "https://dolarapi.com/v1/dolares"
DOLAR_JSON = Path(VAULT) / "Conocimiento" / "Precios" / "dolar.json"
MD_PRECIOS = Path(VAULT) / "Conocimiento" / "Precios" / "materiales-construccion.md"
PATRON_BLOQUE = re.compile(r"<!-- DOLAR:START -->.*?<!-- DOLAR:END -->", re.DOTALL)


def parsear_bluelytics(datos):
    return {
        "oficial": {"compra": datos["oficial"]["value_buy"], "venta": datos["oficial"]["value_sell"]},
        "blue": {"compra": datos["blue"]["value_buy"], "venta": datos["blue"]["value_sell"]},
        "fuente": "bluelytics",
    }


def parsear_dolarapi(lista):
    out = {"fuente": "dolarapi"}
    for d in lista:
        if d.get("casa") in ("oficial", "blue"):
            out[d["casa"]] = {"compra": d["compra"], "venta": d["venta"]}
    if "oficial" not in out or "blue" not in out:
        raise ValueError("dolarapi no devolvió oficial y blue")
    return out


def formatear_bloque(cotiz, fecha):
    return (
        "<!-- DOLAR:START -->\n"
        f"**Dólar del día — {fecha}** (fuente: {cotiz['fuente']}, actualización automática diaria)\n\n"
        "| Tipo | Compra | Venta |\n|---|---|---|\n"
        f"| Oficial | ${cotiz['oficial']['compra']:,.0f} | ${cotiz['oficial']['venta']:,.0f} |\n"
        f"| Blue | ${cotiz['blue']['compra']:,.0f} | ${cotiz['blue']['venta']:,.0f} |\n"
        "<!-- DOLAR:END -->"
    )


def insertar_bloque(md, bloque):
    """Reemplaza el bloque existente; si no hay, lo inserta después del primer '---'."""
    if PATRON_BLOQUE.search(md):
        return PATRON_BLOQUE.sub(bloque, md)
    partes = md.split("\n---\n", 1)
    if len(partes) == 2:
        return partes[0] + "\n---\n\n" + bloque + "\n" + partes[1]
    return bloque + "\n\n" + md


def correr(cfg, token):
    try:
        cotiz = parsear_bluelytics(http_json(URL_BLUELYTICS))
    except Exception:
        cotiz = parsear_dolarapi(http_json(URL_DOLARAPI))
    fecha = date.today().isoformat()
    DOLAR_JSON.write_text(json.dumps({"fecha": fecha, **cotiz}, ensure_ascii=False, indent=2))
    md = MD_PRECIOS.read_text()
    MD_PRECIOS.write_text(insertar_bloque(md, formatear_bloque(cotiz, fecha)))
    push_vault(f"daemon: dólar diario {fecha}")
    registrar_evento(
        cfg, token, "job_dolar",
        f"Dólar actualizado — blue ${cotiz['blue']['venta']:,.0f} / oficial ${cotiz['oficial']['venta']:,.0f}",
        {"fecha": fecha, **cotiz},
    )
