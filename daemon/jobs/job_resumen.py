#!/usr/bin/env python3
"""Job diario (~7h): Resumen mañanero 2.0 por WhatsApp.

Lee del Centro de Mando (Supabase) y compone un resumen determinístico en
formato WhatsApp (negritas *así*, emojis sobrios). Lo envía al OWNER_PHONE vía
el endpoint /send del bot de Railway. Registra la corrida en eventos.

Contrato del endpoint /send (index.js):
  POST https://ravn-bots-production.up.railway.app/send
  { "to": OWNER_PHONE, "message": texto, "token": DASHBOARD_TOKEN }
  → 200 { ok: true, msgId: "..." }  |  401/500 si falla
"""
import sys
import urllib.error
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import (
    ENV_DAEMON,
    log,
    parse_env,
    registrar_evento,
    rest,
)

# Ruta del .env privado de los jobs (no en git).
# Contiene: BOT_URL, BOT_SEND_TOKEN
ENV_JOBS = Path.home() / ".ravn-jobs" / ".env"

COCKPIT_URL = "https://ravn-app-one-five.vercel.app"
MAX_VENCIDAS = 5

DIAS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


# ── helpers ────────────────────────────────────────────────────────────────────

def cargar_cfg_jobs():
    """Lee ~/.ravn-cotizador/.env y ~/.ravn-jobs/.env, fusionados.
    Si ~/.ravn-jobs/.env no existe, solo usa la fuente daemon."""
    cfg = parse_env(ENV_DAEMON.read_text())
    env_jobs = ENV_JOBS
    if env_jobs.exists():
        cfg.update(parse_env(env_jobs.read_text()))
    return cfg


def fecha_legible(d: date) -> str:
    """'viernes 13 de junio'"""
    return f"{DIAS_ES[d.weekday()]} {d.day} de {MESES_ES[d.month - 1]}"


# ── secciones ─────────────────────────────────────────────────────────────────

def seccion_agenda(cfg, token, hoy: date) -> str:
    """📅 HOY: eventos de calendario + tareas de hoy."""
    hoy_iso = hoy.isoformat()
    cal = rest(cfg, token,
               f"calendario_eventos?fecha=eq.{hoy_iso}&select=hora,titulo&order=hora.asc") or []
    tareas_hoy = rest(cfg, token,
                      f"tareas?estado=eq.pendiente&fecha=eq.{hoy_iso}"
                      "&select=texto,hora&order=hora.asc.nullslast") or []

    lineas = []
    for e in cal:
        hora = e.get("hora") or ""
        prefix = hora[:5] + " " if hora else ""
        lineas.append(f"  {prefix}{e['titulo']}")
    for t in tareas_hoy:
        hora = t.get("hora") or ""
        prefix = hora[:5] + " " if hora else ""
        lineas.append(f"  ☑ {prefix}{t['texto']}")

    if lineas:
        return "📅 *HOY:*\n" + "\n".join(lineas)
    return "📅 *HOY:* Sin agenda fija."


def seccion_vencidas(cfg, token, hoy: date) -> str | None:
    """⚠️ VENCIDAS: tareas pendientes con fecha < hoy (máx 5)."""
    hoy_iso = hoy.isoformat()
    rows = rest(cfg, token,
                f"tareas?estado=eq.pendiente&fecha=lt.{hoy_iso}"
                f"&select=texto,fecha&order=fecha.asc&limit={MAX_VENCIDAS + 1}") or []
    if not rows:
        return None

    mostrar = rows[:MAX_VENCIDAS]
    extra = len(rows) - MAX_VENCIDAS
    lineas = [f"  • {r['texto'][:80]} ({r['fecha']})" for r in mostrar]
    if extra > 0:
        lineas.append(f"  +{extra} más")
    return "⚠️ *VENCIDAS:*\n" + "\n".join(lineas)


def seccion_obras(cfg, token) -> str | None:
    """🏗 OBRAS: presupuestos aprobados no finalizados + último avance."""
    # obras activas: presupuesto_aprobado=true, estado != finalizado
    # (la tabla obras tiene finalizada_at; una obra está activa si finalizada_at IS NULL)
    presups = rest(cfg, token,
                   "presupuestos?presupuesto_aprobado=eq.true"
                   "&estado=neq.finalizado"
                   "&select=id,nombre_obra") or []
    if not presups:
        return None

    lineas = []
    for p in presups:
        nombre = p.get("nombre_obra") or "Sin nombre"
        pid = p["id"]
        # último avance
        avances = rest(cfg, token,
                       f"obra_avances?presupuesto_id=eq.{pid}"
                       "&order=creado_at.desc&limit=1"
                       "&select=texto,instancia") or []
        if avances:
            av = avances[0]
            texto_av = (av.get("texto") or "")[:100]
            instancia = av.get("instancia") or ""
            sufijo = f" ({instancia})" if instancia else ""
            lineas.append(f"  *{nombre}*\n    🟢 {texto_av}{sufijo}")
        else:
            lineas.append(f"  *{nombre}*")

    return "🏗 *OBRAS:*\n" + "\n".join(lineas)


def seccion_gastos_ayer(cfg, token, hoy: date) -> str | None:
    """💸 AYER: total de gastos de obra y personales."""
    ayer = (hoy - timedelta(days=1)).isoformat()
    gastos_obra = rest(cfg, token,
                       f"presupuestos_gastos?fecha=eq.{ayer}&select=importe") or []
    gastos_pers = rest(cfg, token,
                       f"gastos_personales?fecha=eq.{ayer}&select=monto") or []

    total_obra = sum(float(g["importe"]) for g in gastos_obra)
    total_pers = sum(float(g["monto"]) for g in gastos_pers)

    if total_obra == 0 and total_pers == 0:
        return None

    partes = []
    if total_obra > 0:
        partes.append(f"Obra: ${total_obra:,.0f}")
    if total_pers > 0:
        partes.append(f"Personal: ${total_pers:,.0f}")
    return "💸 *AYER:* " + " | ".join(partes)


# ── composición principal ──────────────────────────────────────────────────────

def componer_resumen(cfg, token, hoy: date, primera_corrida: bool = False) -> str:
    """Arma el texto completo del resumen (determinístico, sin IA)."""
    dia_str = fecha_legible(hoy)
    lineas = []

    if primera_corrida:
        lineas.append("🚀 Resumen mañanero 2.0 — primera corrida de prueba")
        lineas.append("")

    lineas.append(f"*RAVN — {dia_str}*")
    lineas.append("")

    agenda = seccion_agenda(cfg, token, hoy)
    lineas.append(agenda)

    vencidas = seccion_vencidas(cfg, token, hoy)
    if vencidas:
        lineas.append("")
        lineas.append(vencidas)

    obras = seccion_obras(cfg, token)
    if obras:
        lineas.append("")
        lineas.append(obras)

    gastos = seccion_gastos_ayer(cfg, token, hoy)
    if gastos:
        lineas.append("")
        lineas.append(gastos)

    lineas.append("")
    lineas.append(f"Tu cockpit → {COCKPIT_URL}")

    return "\n".join(lineas)


# ── envío vía bot Railway ──────────────────────────────────────────────────────

def enviar_whatsapp(cfg, texto: str):
    """Envía el texto al OWNER_PHONE vía POST /send del bot de Railway.
    Lanza RuntimeError si falla (el runner reintenta, tope 3)."""
    import json
    import ssl
    import urllib.request

    import certifi

    bot_url = cfg.get("BOT_URL", "").rstrip("/")
    send_token = cfg.get("BOT_SEND_TOKEN", "")
    owner_phone = cfg.get("OWNER_PHONE", "")

    if not bot_url or not send_token or not owner_phone:
        raise RuntimeError(
            "Faltan BOT_URL / BOT_SEND_TOKEN / OWNER_PHONE en ~/.ravn-jobs/.env"
        )

    payload = {"to": owner_phone, "message": texto, "token": send_token}
    ctx = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(
        f"{bot_url}/send",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
            body = r.read().decode()
            resp = json.loads(body) if body.strip() else {}
            if not resp.get("ok"):
                raise RuntimeError(f"/send devolvió ok=false: {body[:200]}")
            log(f"resumen: enviado OK msgId={resp.get('msgId')}")
            return resp.get("msgId")
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode()[:300]
        raise RuntimeError(f"/send HTTP {e.code}: {cuerpo}") from e


# ── entrypoint del runner ──────────────────────────────────────────────────────

def correr(cfg, token, hoy: date | None = None, primera_corrida: bool = False):
    """Punto de entrada llamado por runner.py."""
    if hoy is None:
        hoy = date.today()

    cfg_full = cargar_cfg_jobs()
    # Merge con lo que pasó el runner (contiene Supabase creds)
    cfg_full.update(cfg)

    texto = componer_resumen(cfg_full, token, hoy, primera_corrida=primera_corrida)
    log(f"resumen: texto compuesto ({len(texto)} chars)")

    enviar_whatsapp(cfg_full, texto)

    registrar_evento(
        cfg, token, "job_resumen",
        "Resumen mañanero enviado",
        {"fecha": hoy.isoformat(), "chars": len(texto)},
    )
    return texto
