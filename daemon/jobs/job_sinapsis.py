#!/usr/bin/env python3
"""Job diario: el cerebro propone conexiones nuevas — y Eze aprueba.

Corre después de job_cerebro (mismo tick, el grafo ya está fresco):
1. Lee graph.json y encuentra células huérfanas (grado 0), las más tibias primero.
2. Claude headless (Sonnet) lee esas notas, explora el vault y propone hasta
   MAX_PROPUESTAS conexiones REALES con una nota existente + la razón.
3. Valida que ambas notas existan en disco y que el par no se haya propuesto
   antes (ni rechazado — un descarte de Eze no se vuelve a preguntar).
4. Inserta en `cerebro_sinapsis` (Supabase). El bot las manda por WhatsApp a la
   mañana (UNIR <id> / DESCARTAR <id>); al aprobar, el bot escribe el [[link]]
   en la nota origen y la noche siguiente el grafo come la conexión.

Ley de la cotizadora aplicada al cerebro: NUNCA inventar — propone, Eze decide.
"""
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, correr_claude, log, registrar_evento, rest

GRAPH = Path(VAULT) / "graphify-out" / "graph.json"
MAX_HUERFANAS = 10   # cuántas huérfanas le damos a mirar por noche
MAX_PROPUESTAS = 3   # cuántas conexiones como mucho por noche (freno de WhatsApp)
TIMEOUT = 900


def huerfanas_tibias(g, ya_propuestas, n=MAX_HUERFANAS):
    """Células con grado 0, de nota NO propuesta antes, las más recientes primero."""
    import os
    grado = {}
    for l in g.get("links", []):
        grado[l.get("source")] = grado.get(l.get("source"), 0) + 1
        grado[l.get("target")] = grado.get(l.get("target"), 0) + 1
    vistas, out = set(), []
    for nodo in g["nodes"]:
        sf = nodo.get("source_file")
        if not sf or grado.get(nodo["id"], 0) > 0 or sf in vistas or sf in ya_propuestas:
            continue
        vistas.add(sf)
        try:
            mt = os.path.getmtime(Path(VAULT) / sf)
        except OSError:
            continue
        out.append((mt, sf, nodo.get("norm_label") or nodo.get("label") or nodo["id"]))
    out.sort(reverse=True)
    return out[:n]


def armar_prompt(candidatas):
    lista = "\n".join(f"- {sf} («{label}»)" for _, sf, label in candidatas)
    return f"""Sos el cerebro de conocimiento de Ezequiel (RAVN Construcciones). Su vault Obsidian está en {VAULT}.

Estas notas quedaron HUÉRFANAS en el grafo del vault — no conectan con ninguna otra:

{lista}

Tarea: encontrá las {MAX_PROPUESTAS} conexiones MÁS VALIOSAS entre una de estas huérfanas y OTRA nota que YA EXISTE en el vault. Leé las huérfanas, buscá en el vault (Grep/Glob) notas que hablen del mismo tema, obra, cliente, decisión o aprendizaje. Una conexión vale si ata análisis con acción, obra con aprendizaje, o conocimiento con un laburo real — no por parecido superficial de palabras.

REGLAS DURAS:
- nota_b tiene que ser un archivo .md que EXISTE en el vault (verificalo leyéndolo). Nada inventado.
- Máximo {MAX_PROPUESTAS} propuestas. Si solo hay 1 conexión buena, devolvé 1. Si no hay ninguna que valga, devolvé [].
- La razón: UNA frase concreta en castellano rioplatense, que Eze entienda en 3 segundos.

Respondé SOLO con un array JSON (sin markdown, sin explicación):
[{{"nota_a": "<path relativo de la huérfana>", "nota_b": "<path relativo de la nota existente>", "razon": "<por qué conectan>"}}]"""


def parsear(salida):
    t = (salida or "").strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        t = t[4:] if t.startswith("json") else t
    i, j = t.find("["), t.rfind("]")
    if i < 0 or j < 0:
        return []
    try:
        data = json.loads(t[i:j + 1])
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def par(a, b):
    """Clave de par SIN dirección: (A,B) y (B,A) son la misma conexión.
    18/07 salieron las dos direcciones de un mismo par en batches distintos."""
    return tuple(sorted((a, b)))


def ya_linkeadas(na, nb):
    """True si alguna de las dos notas ya linkea a la otra — una conexión que
    ya existe en tinta no se propone (caso Entrenamiento↔Patrones, 18/07).
    Los wikilinks del vault vienen en dos formas: [[Yo/Patrones]] (path) y
    [[Patrones]] (solo nombre); el prefijo cubre también alias con pipe."""
    def formas(p):
        return {f"[[{str(Path(p).with_suffix(''))}", f"[[{Path(p).stem}"}
    def contiene_link(archivo, destino):
        try:
            texto = (Path(VAULT) / archivo).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return False
        return any(f in texto for f in formas(destino))
    return contiene_link(na, nb) or contiene_link(nb, na)


def correr(cfg, token):
    g = json.load(open(GRAPH))

    # pares ya propuestos alguna vez (cualquier estado: lo descartado no se repregunta)
    previas = rest(cfg, token, "cerebro_sinapsis?select=nota_a,nota_b,estado") or []
    pares_previos = {par(p["nota_a"], p["nota_b"]) for p in previas}
    notas_previas = {p["nota_a"] for p in previas}

    candidatas = huerfanas_tibias(g, notas_previas)
    if not candidatas:
        log("job_sinapsis: no hay huérfanas nuevas para proponer")
        return

    propuestas = parsear(correr_claude(armar_prompt(candidatas), timeout=TIMEOUT))

    validas = []
    for p in propuestas[:MAX_PROPUESTAS]:
        na, nb, razon = p.get("nota_a"), p.get("nota_b"), (p.get("razon") or "").strip()
        if not (na and nb and razon) or na == nb or par(na, nb) in pares_previos:
            continue
        if not (Path(VAULT) / na).is_file() or not (Path(VAULT) / nb).is_file():
            log(f"job_sinapsis: propuesta descartada, nota inexistente ({na} → {nb})")
            continue
        if ya_linkeadas(na, nb):
            log(f"job_sinapsis: propuesta descartada, ya se linkean ({na} ↔ {nb})")
            continue
        pares_previos.add(par(na, nb))  # dedup también dentro del mismo batch
        validas.append({"fecha": date.today().isoformat(), "nota_a": na, "nota_b": nb,
                        "razon": razon[:300]})

    for v in validas:
        rest(cfg, token, "cerebro_sinapsis", method="POST", data=v)

    registrar_evento(cfg, token, "job_sinapsis",
                     f"cerebro: {len(validas)} conexiones propuestas para aprobar", {
                         "huerfanas_miradas": len(candidatas),
                         "propuestas": [f"{v['nota_a']} → {v['nota_b']}" for v in validas],
                     })
    log(f"job_sinapsis OK — {len(validas)} propuestas insertadas")
