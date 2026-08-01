"""Genera los iconos del atajo /gasto a partir de los iconos maestros de la app.

Los maestros son la R con textura de cemento sobre negro puro (gen-iconos.py).
Aca se remapea el tono: negro -> verde ingles, blanco -> blanco cemento #f2efe8.
La textura de la R se conserva porque el mapeo es lineal sobre la luminancia.
"""
from PIL import Image

PUBLIC = "/Users/ezeotero/Documents/ravn/public"

VERDE = (0, 66, 37)        # verde ingles (British racing green)
CEMENTO = (242, 239, 232)  # blanco calido de marca #f2efe8

PARES = [
    ("apple-touch-icon.png", "apple-touch-icon-gasto.png"),
    ("icon-192.png", "icon-gasto-192.png"),
    ("icon-512.png", "icon-gasto-512.png"),
    ("icon-maskable-512.png", "icon-gasto-maskable-512.png"),
]

# Duotono: cada canal interpola verde -> cemento segun la luminancia original.
tablas = [
    [round(VERDE[c] + v / 255 * (CEMENTO[c] - VERDE[c])) for v in range(256)]
    for c in range(3)
]

for origen, destino in PARES:
    gris = Image.open(f"{PUBLIC}/{origen}").convert("L")
    rgb = Image.merge("RGB", [gris.point(t) for t in tablas])
    rgb.save(f"{PUBLIC}/{destino}", optimize=True)
    print(f"{destino}  {rgb.size[0]}x{rgb.size[1]}")
