#!/usr/bin/env python3
# Edita render_opcionC_FINAL: cambia SOLO la pared lateral izquierda (rosa pastel)
# por el azulejo biselado terracota/salmon glossy de la referencia. Resto 100% identico.
import os, json, base64, ssl, urllib.request, urllib.error, time

OUT = os.path.dirname(os.path.abspath(__file__))

KEY = None
with open(os.path.expanduser("~/.claude/.env")) as f:
    for line in f:
        if line.startswith("GEMINI_API_KEY"):
            KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
assert KEY, "no GEMINI_API_KEY"

BASE = f"{OUT}/render_opcionC_FINAL.png"
REF  = f"{OUT}/ref_azulejo_terracota.png"

def b64(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode()

PROMPT = (
    "Edit this bathroom interior render. Keep EVERYTHING 100% identical (camera, composition, "
    "framing, the teal/aqua vertical shower tiles, petrol-blue floating vanity, white stone top, "
    "round mirror, black 3-globe fixture, black fittings, glass shower screen, lit niche, white "
    "toilet, beige floor, ceiling, towel, plants, lighting) EXCEPT the LEFT side wall.\n"
    "The LEFT wall is currently covered in pastel pink vertical tiles. RETILE that left wall using "
    "the tile shown in the SECOND reference image: a glazed ceramic subway/brick tile in a warm "
    "TERRACOTTA / SALMON-PINK color with a glossy reflective finish and a subtly mottled, slightly "
    "vintage hand-made look. Keep the SAME tile layout and orientation as the existing left wall "
    "(the same vertical stacked format and grout lines) — only change the color, material and glossy "
    "texture to match the terracotta reference. The new wall must read as the same warm terracotta "
    "salmon tone as the reference swatch, NOT pastel pink.\n"
    "Match perspective, lighting and reflections of the original render so it looks photorealistic and "
    "seamless. Do not alter the shower wall, vanity, fixtures or any other surface. Output the full edited image."
)

def call(model):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}"
    parts = [
        {"text": PROMPT},
        {"inline_data": {"mime_type": "image/png", "data": b64(BASE)}},
        {"inline_data": {"mime_type": "image/png", "data": b64(REF)}},
    ]
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "4:5"}},
    }
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                headers={"Content-Type": "application/json"})
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, timeout=580, context=ctx) as r:
        resp = json.load(r)
    for c in resp.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            d = p.get("inline_data") or p.get("inlineData")
            if d and d.get("data"):
                return base64.b64decode(d["data"])
    raise RuntimeError("sin imagen: " + json.dumps(resp)[:500])

for model in ["gemini-3-pro-image-preview"]:
    try:
        print("probando", model, "...")
        img = call(model)
        out = f"{OUT}/render_opcionC_terracota_v2.png"
        with open(out, "wb") as f:
            f.write(img)
        print("OK ->", out, len(img), "bytes")
        break
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:300])
        time.sleep(3)
    except Exception as e:
        print("err", repr(e)[:300])
