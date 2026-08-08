#!/usr/bin/env python3
"""Job dominical: FODA de NEGOCIO del cerebro — no de grafo.

Cruza tres fuentes que nunca se miran juntas solas:
1. El diagnóstico estructural del grafo (adn.json del ORGANISMO — qué órganos
   no conectan, qué se pudre en el limbo, cuántas ideas quedaron huérfanas).
2. El estado REAL del negocio (snapshot_negocio de App RAVN — fuente de verdad).
3. La última Orientación (el estado mental/estratégico de la semana).

Claude headless (opus: análisis de negocio, una vez por semana) escribe
Ravn/FODA-vivo.md en el vault y devuelve un resumen corto. El resumen se
siembra como la pregunta del domingo en cerebro_preguntas (tipo 'foda') — por
eso este job corre ANTES que job_cerebro en la lista: si ya hay pregunta del
día, job_cerebro no pisa.
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, correr_claude, log, registrar_evento, rest, snapshot_negocio, transaccion_vault

ADN = Path.home() / "Documents" / "organismo" / "adn.json"
FODA = Path(VAULT) / "Ravn" / "FODA-vivo.md"
TIMEOUT = 1200


def ultima_orientacion():
    d = Path(VAULT) / "Orientación"
    archivos = sorted(d.glob("*.md"), reverse=True)
    return str(archivos[0]) if archivos else "(no hay)"


def armar_prompt(fecha, snapshot):
    return f"""Sos el estratega del cerebro de Ezequiel (RAVN Construcciones). Hoy es {fecha}.

Armá el FODA VIVO semanal de RAVN cruzando TRES fuentes (leelas todas):
1. Diagnóstico estructural del grafo del vault: {ADN} (campo "diagnostico" — traducilo a negocio: "Obras sin conexiones" = lo que pasa en obra no se convierte en aprendizaje; "sin órgano comercial" = el cuello de botella de VENDER no tiene ni tejido, etc.)
2. ESTADO REAL DEL NEGOCIO (fuente de verdad, pega sobre todo lo demás):

{snapshot}

3. La última Orientación: {ultima_orientacion()}

Escribí el archivo {FODA} (pisalo entero) con este formato:
# FODA vivo — RAVN
> Generado por el cerebro · {fecha} · se pisa cada domingo

## Fortalezas  (3-5 bullets, concretos, con el dato que lo prueba)
## Oportunidades  (3-5 bullets — acá entran las conexiones que el grafo muestra y Eze no está viendo)
## Debilidades  (3-5 bullets — incluí lo estructural del grafo traducido a negocio)
## Amenazas  (2-4 bullets — reales, sin dramatizar)
## La movida de la semana  (UNA sola cosa: si Eze hace esto esta semana, el FODA mejora más que con cualquier otra)

REGLAS: castellano rioplatense directo, cero espuma, cada bullet con su POR QUÉ en la misma línea. Nada inventado: si un dato no está en las fuentes, no existe. El cuello de botella histórico de RAVN es VENDER — el FODA tiene que hablarle a eso.

Cuando termines de escribir el archivo, respondé SOLO con el mensaje de WhatsApp para Eze (máx 500 caracteres): arrancá con la amenaza o debilidad N°1 y la oportunidad N°1 (una línea cada una), cerrá con "La movida de la semana: ..." y avisá que el FODA completo está en el vault (Ravn/FODA-vivo.md)."""


def correr(cfg, token):
    fecha = date.today().isoformat()
    snapshot = snapshot_negocio(cfg, token)

    def persistir():
        antes = FODA.stat().st_mtime_ns if FODA.exists() else 0
        resumen_local = (
            correr_claude(
                armar_prompt(fecha, snapshot), timeout=TIMEOUT, modelo="opus"
            )
            or ""
        ).strip()
        cambio = FODA.exists() and FODA.stat().st_mtime_ns > antes
        if not cambio:
            raise RuntimeError(
                f"no se escribió {FODA} — resumen de claude: {resumen_local[:300]}"
            )
        return resumen_local

    resumen = transaccion_vault(
        persistir,
        rutas=lambda _resultado: [FODA],
        mensaje="cerebro: FODA vivo semanal (job_foda)",
    )
    # el resumen es la pregunta del domingo (si el día ya tiene una, no se pisa)
    sembrada = False
    if resumen:
        existe = rest(cfg, token, f"cerebro_preguntas?fecha=eq.{fecha}&select=id")
        if not existe:
            rest(cfg, token, "cerebro_preguntas", method="POST", data={
                "fecha": fecha, "tipo": "foda", "objetivo": "Ravn/FODA-vivo.md",
                "pregunta": resumen[:1000],
            })
            sembrada = True

    registrar_evento(cfg, token, "job_foda", "cerebro: FODA vivo semanal generado", {
        "archivo": "Ravn/FODA-vivo.md", "resumen_sembrado": sembrada,
    })
    log(f"job_foda OK — FODA escrito, resumen {'sembrado' if sembrada else 'no sembrado (ya había pregunta)'}")
