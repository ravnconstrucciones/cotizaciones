#!/usr/bin/env python3
"""Job dominical de auditoría semanal (iteración del informe integral).

Nació del pedido de Eze del 2026-07-01: la auditoría integral profunda se corrió
una vez (Auditorias/2026-07-01-integral.md) y los domingos este job itera sobre
ella — qué se hizo de las acciones, qué cambió en los números, y las acciones de
la semana nueva. Es la versión acotada y determinística del "loop de mejora":
UNA corrida de Claude headless por semana, no un cerebro en loop.

Flujo: snapshot fresco de App RAVN (precedencia sobre el vault) + auditoría
anterior → Claude headless (sonnet) devuelve el markdown → el job lo escribe en
el vault, pushea, registra evento en Actividad y avisa por WhatsApp (el
"recordame el domingo").
"""
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from job_resumen import cargar_cfg_jobs, enviar_whatsapp
from jobslib import correr_claude, log, registrar_evento, snapshot_negocio, transaccion_vault

DIR_AUDITORIAS = Path.home() / "Obsidian" / "RAVN" / "Auditorias"
MAX_PREV_CHARS = 12000


def ultima_auditoria():
    archivos = sorted(DIR_AUDITORIAS.glob("*.md"))
    return archivos[-1] if archivos else None


def componer_prompt(hoy: date, snapshot: str, prev_nombre: str, prev_texto: str) -> str:
    return f"""Sos el auditor semanal de Ezequiel Otero (RAVN Construcciones). Hoy es {hoy.isoformat()} (domingo).
Tu único trabajo: producir la auditoría semanal que itera sobre la anterior. Devolvé SOLO el markdown del archivo (sin cercos de código, sin comentarios alrededor), empezando exactamente con "# Auditoría semanal — {hoy.isoformat()}".

FUENTES, en este orden de precedencia:

1) ESTADO REAL DEL NEGOCIO (fuente de verdad, gana ante cualquier texto viejo):
{snapshot}

2) AUDITORÍA ANTERIOR ({prev_nombre}) — tus acciones a revisar vienen de acá:
{prev_texto}

3) El vault: leé los archivos de los últimos 7 días de /Users/ezeotero/Obsidian/RAVN/Orientación/ (los .md con nombre de fecha en la raíz de esa carpeta) para saber qué pasó en la semana. Si necesitás contexto puntual podés leer también /Users/ezeotero/Obsidian/RAVN/Yo/Patrones.md. No leas el vault entero.

ESTRUCTURA OBLIGATORIA del markdown:
# Auditoría semanal — {hoy.isoformat()}
## Balance de la semana — 3-6 oraciones directas: qué se movió de verdad (obras, plata, venta, cuerpo).
## Acciones de la semana pasada — una línea por acción de la auditoría anterior: ✅ hecha / ⚠️ a medias / ❌ no se tocó, con la evidencia. Si no hay auditoría anterior, decilo y salteá.
## Hallazgos — 2-4 hallazgos NUEVOS de esta semana con evidencia concreta. No recicles hallazgos viejos salvo que hayan empeorado.
## Acciones de la semana
- [ ] tres acciones máximo, chicas y ejecutables esta semana, la más importante primera

REGLAS: castellano rioplatense, tono de socio directo, cero relleno corporativo. Cada afirmación con dato. Las obras firmadas NO necesitan "cerrar la venta" (solo ejecución/cobranza). Nada de referencias a alcohol. No inventes: si un dato no está, decí que no está.
REGLA ANTI-ZOMBIE (lección del 01/07): el vault envejece y guarda fotos viejas. Cualquier documento del vault con más de ~2 semanas es HIPÓTESIS, no estado actual — nunca lo presentes como hallazgo si el snapshot o las Orientaciones recientes no lo confirman. Si la auditoría anterior tiene una sección de "CORRECCIONES DE EZE", esas correcciones PISAN a los hallazgos de ese archivo. Una cuota "vencida" en la app puede ser cronograma desactualizado, no cliente moroso: tratala como "fecha a verificar", no como reclamo."""


def correr(cfg, token):
    hoy = date.today()
    DIR_AUDITORIAS.mkdir(parents=True, exist_ok=True)

    snapshot = snapshot_negocio(cfg, token)
    prev = ultima_auditoria()
    if prev:
        prev_nombre, prev_texto = prev.name, prev.read_text()[:MAX_PREV_CHARS]
    else:
        prev_nombre = "(ninguna)"
        prev_texto = "(no hay auditoría anterior — primera iteración, salteá la sección de acciones pasadas)"

    md = correr_claude(componer_prompt(hoy, snapshot, prev_nombre, prev_texto), timeout=1200)
    md = (md or "").strip()
    if len(md) < 300 or not md.startswith("# Auditoría semanal"):
        raise RuntimeError(f"salida de Claude sospechosa ({len(md)} chars, arranque {md[:60]!r}) — no escribo nada")

    destino = DIR_AUDITORIAS / f"{hoy.isoformat()}.md"
    transaccion_vault(
        lambda: destino.write_text(md + "\n"),
        rutas=lambda _resultado: [destino],
        mensaje=f"Auditoría semanal {hoy.isoformat()} (job dominical)",
    )
    log(f"auditoria: escrita {destino.name} ({len(md)} chars)")

    acciones = re.findall(r"^[-*] \[ \] (.+)$", md, flags=re.M)[:3]
    lineas = "\n".join(f"{i}. {a}" for i, a in enumerate(acciones, 1)) or "(ver el archivo)"
    cfg_full = cargar_cfg_jobs()
    cfg_full.update(cfg)
    enviar_whatsapp(cfg_full, f"📋 Auditoría semanal lista — Auditorias/{destino.name}\n\nAcciones de la semana:\n{lineas}")

    registrar_evento(cfg, token, "auditoria_semanal",
                     f"Auditoría semanal {hoy.isoformat()}: {len(acciones)} acción(es) para la semana",
                     {"archivo": f"Auditorias/{destino.name}", "acciones": acciones})
