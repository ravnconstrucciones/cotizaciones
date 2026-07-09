"""Job diario: refresca el cache fechado de precios retail (tabla precios_items).

Corre el script TS del repo (la lógica VTEX vive en src/lib/cotizador/retail.ts
— acá NO se duplica) con npx tsx. Si el script sale != 0, se levanta excepción
para que el runner lo reintente (política estándar de jobs).
"""
import subprocess

REPO = "/Users/ezeotero/Documents/ravn"
TIMEOUT = 600  # decenas de fetches VTEX secuenciales con timeout de 6 s c/u


def correr(cfg, token):
    r = subprocess.run(
        ["npx", "tsx", "scripts/cotizador/refrescar-precios.ts"],
        cwd=REPO, capture_output=True, text=True, timeout=TIMEOUT,
    )
    if r.returncode != 0:
        raise RuntimeError(f"refrescar-precios salió {r.returncode}: {r.stderr[-500:]}")
