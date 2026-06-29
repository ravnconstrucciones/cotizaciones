#!/usr/bin/env python3
# Sobre el render v2 aprobado (pared terracota): cambia SOLO el aro del espejo a dorado.
import os, json, base64, ssl, urllib.request, urllib.error, time
OUT = os.path.dirname(os.path.abspath(__file__))
KEY = None
with open(os.path.expanduser("~/.claude/.env")) as f:
    for line in f:
        if line.startswith("GEMINI_API_KEY"):
            KEY = line.split("=", 1)[1].strip().strip('"').strip("'"); break
assert KEY
BASE = f"{OUT}/render_opcionC_terracota_v2.png"
def b64(p):
    with open(p, "rb") as f: return base64.b64encode(f.read()).decode()
PROMPT = (
    "Edit this bathroom render. Keep EVERYTHING 100% identical (camera, composition, terracotta left "
    "wall, teal shower tiles, petrol-blue vanity, white basin, fittings, glass screen, lit niche, "
    "toilet, floor, lighting, plants, towel) EXCEPT the ROUND MIRROR FRAME.\n"
    "Change the thin round mirror frame from black to a warm POLISHED GOLD / BRASS metal finish. "
    "Only the mirror's circular rim becomes gold; the mirror glass and reflection stay the same. "
    "Keep the wall-mounted light fixture arm, towel hook and all other black fittings BLACK — do NOT "
    "make them gold. Photorealistic, seamless, match original lighting and reflections. Output the full edited image."
)
def call(model):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={KEY}"
    parts = [{"text": PROMPT}, {"inline_data": {"mime_type": "image/png", "data": b64(BASE)}}]
    body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "4:5"}}}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    try:
        import certifi; ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl._create_unverified_context()
    with urllib.request.urlopen(req, timeout=580, context=ctx) as r:
        resp = json.load(r)
    for c in resp.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            d = p.get("inline_data") or p.get("inlineData")
            if d and d.get("data"): return base64.b64decode(d["data"])
    raise RuntimeError("sin imagen: " + json.dumps(resp)[:500])
for model in ["gemini-3-pro-image-preview"]:
    try:
        print("probando", model, "..."); img = call(model)
        out = f"{OUT}/render_opcionC_terracota_dorado_v1.png"
        with open(out, "wb") as f: f.write(img)
        print("OK ->", out, len(img), "bytes"); break
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:300]); time.sleep(3)
    except Exception as e:
        print("err", repr(e)[:300])
