#!/usr/bin/env python3
"""Lib común de los jobs programados de Ravn (com.ravn.jobs).

Parte 1 (pura, testeada): parse de .env, vencimientos, estado local, payload de eventos.
Parte 2 (red/procesos, Tarea 2): Supabase REST, git del vault, Claude Code headless.
"""
import json
from datetime import date, datetime, timedelta
from pathlib import Path

# ---------- parsing de .env ----------

def parse_env(texto):
    """Parsea KEY=VALOR por línea; ignora comentarios y líneas sin '='. Saca comillas dobles."""
    cfg = {}
    for linea in texto.splitlines():
        linea = linea.strip()
        if "=" in linea and not linea.startswith("#"):
            k, _, v = linea.partition("=")
            cfg[k.strip()] = v.strip().strip('"')
    return cfg

# ---------- vencimientos (catch-up friendly: comparan PERÍODOS, no horarios exactos) ----------

def vencio_diario(ultima_ok, ahora, hora_minima):
    """True si hoy todavía no corrió y ya pasó la hora mínima."""
    if ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return True
    return ultima_ok.date() < ahora.date()


def vencio_semanal(ultima_ok, ahora, hora_minima):
    """True si la última corrida OK fue en una semana ISO anterior."""
    if ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return True
    return ultima_ok.isocalendar()[:2] < ahora.isocalendar()[:2]


def vencio_mensual(ultima_ok, ahora, dia_minimo, hora_minima):
    """True si la última corrida OK fue en un mes anterior y ya es día >= dia_minimo."""
    if ahora.day < dia_minimo or ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return True
    return (ultima_ok.year, ultima_ok.month) < (ahora.year, ahora.month)

# ---------- estado local (~/.ravn-jobs/state.json) ----------

def cargar_estado(path):
    try:
        return json.loads(Path(path).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _guardar_estado(path, estado):
    Path(path).write_text(json.dumps(estado, indent=2, ensure_ascii=False))


def marcar_ok(path, job, ahora):
    estado = cargar_estado(path)
    estado[job] = {"ultima_ok": ahora.isoformat()}
    _guardar_estado(path, estado)


def marcar_error(path, job, ahora):
    estado = cargar_estado(path)
    reg = estado.setdefault(job, {})
    hoy = ahora.date().isoformat()
    if reg.get("fecha_error") == hoy:
        reg["errores"] = reg.get("errores", 0) + 1
    else:
        reg["fecha_error"] = hoy
        reg["errores"] = 1
    _guardar_estado(path, estado)


def ultima_ok(estado, job):
    iso = estado.get(job, {}).get("ultima_ok")
    return datetime.fromisoformat(iso) if iso else None


def errores_hoy(estado, job, ahora):
    reg = estado.get(job, {})
    if reg.get("fecha_error") == ahora.date().isoformat():
        return reg.get("errores", 0)
    return 0

# ---------- payload de eventos (contrato canónico) ----------

def evento_payload(tipo, titulo, contenido, estado="procesado"):
    """Fila para la tabla `eventos` del contrato. origen='daemon' siempre acá."""
    return {
        "origen": "daemon",
        "tipo": tipo,
        "estado": estado,
        "titulo": titulo[:200],
        "contenido": contenido,
    }

# ---------- constantes de runtime ----------

import os
import ssl
import subprocess
import time
import urllib.error
import urllib.request

import certifi

DIR_JOBS = Path.home() / ".ravn-jobs"
STATE = DIR_JOBS / "state.json"
LOCK = DIR_JOBS / "runner.lock"
LOG_RUNNER = DIR_JOBS / "logs" / "runner.log"
ENV_DAEMON = Path.home() / ".ravn-cotizador" / ".env"
TOKEN_CACHE_JOBS = Path.home() / ".ravn-jobs" / ".token-cache.json"
VAULT = "/Users/ezeotero/Obsidian/RAVN"
GIT_VAULT = ["git", "--git-dir", str(Path.home() / ".ravn-vault-git"), "--work-tree", VAULT]
CLAUDE_BIN = str(Path.home() / ".local" / "bin" / "claude")
CTX = ssl.create_default_context(cafile=certifi.where())
AUTH_MARGEN_SEG = 5 * 60  # 5 minutos antes del vencimiento


def log(msg):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] {msg}", flush=True)


def cargar_cfg():
    return parse_env(ENV_DAEMON.read_text())

# ---------- HTTP / Supabase REST (mismo patrón que daemon.py) ----------

def http_json(url, data=None, headers=None, method=None, timeout=30, user_agent=None):
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    if user_agent:
        hdrs["User-Agent"] = user_agent
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data is not None else None,
        headers=hdrs,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        cuerpo = r.read().decode()
        return json.loads(cuerpo) if cuerpo.strip() else None


def _escribir_cache_jobs(data):
    """Persiste el token cache de jobs en disco con chmod 600."""
    TOKEN_CACHE_JOBS.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_CACHE_JOBS.write_text(json.dumps(data, indent=2))
    TOKEN_CACHE_JOBS.chmod(0o600)


def _leer_cache_jobs():
    """Lee el cache de jobs; devuelve None si no existe o está malformado."""
    try:
        return json.loads(TOKEN_CACHE_JOBS.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _password_grant_jobs(cfg):
    """Login fresco para jobs — crea una sesión nueva."""
    return http_json(
        f"{cfg['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        data={"email": cfg["BOT_EMAIL"], "password": cfg["BOT_PASSWORD"]},
        headers={"apikey": cfg["SUPABASE_ANON_KEY"]},
    )


def _refresh_grant_jobs(cfg, refresh_token):
    """Renueva el token de jobs sin crear sesión nueva."""
    return http_json(
        f"{cfg['SUPABASE_URL']}/auth/v1/token?grant_type=refresh_token",
        data={"refresh_token": refresh_token},
        headers={"apikey": cfg["SUPABASE_ANON_KEY"]},
    )


def supabase_auth(cfg):
    """Devuelve un access_token válido reutilizando la sesión existente.

    Lógica:
    1. Cache en disco con >5 min de vida → devuelve sin red.
    2. Cache presente pero por vencer (≤5 min) → refresh_token (misma sesión).
    3. Sin cache o refresh falló → password grant + persiste.
    """
    ahora = time.time()
    cache = _leer_cache_jobs()
    if cache:
        expires_at = cache.get("expires_at", 0)
        access_token = cache.get("access_token")
        refresh_token = cache.get("refresh_token")
        if access_token and expires_at - ahora > AUTH_MARGEN_SEG:
            return access_token
        if refresh_token:
            try:
                r = _refresh_grant_jobs(cfg, refresh_token)
                nuevo = {
                    "access_token": r["access_token"],
                    "refresh_token": r.get("refresh_token", refresh_token),
                    "expires_at": ahora + r.get("expires_in", 3600),
                }
                _escribir_cache_jobs(nuevo)
                log("jobs auth: token renovado con refresh_token (sin sesión nueva)")
                return nuevo["access_token"]
            except Exception as e:
                log(f"jobs auth: refresh falló ({e}), haciendo password grant")

    # Sin cache válido o refresh fallido → login fresco
    r = _password_grant_jobs(cfg)
    nuevo = {
        "access_token": r["access_token"],
        "refresh_token": r.get("refresh_token", ""),
        "expires_at": ahora + r.get("expires_in", 3600),
    }
    _escribir_cache_jobs(nuevo)
    log("jobs auth: password grant (nueva sesión)")
    return nuevo["access_token"]


def invalidar_cache_jobs():
    """Borra el cache de jobs para forzar un login fresco en el próximo intento."""
    TOKEN_CACHE_JOBS.unlink(missing_ok=True)


def rest(cfg, token, path, data=None, method="GET"):
    try:
        return http_json(
            f"{cfg['SUPABASE_URL']}/rest/v1/{path}",
            data=data,
            headers={"apikey": cfg["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {token}"},
            method=method,
        )
    except urllib.error.HTTPError as e:
        if e.code == 401:
            # Token rechazado: invalidar cache y reintentar UNA sola vez con login fresco
            log("jobs rest: 401 recibido, invalidando cache y reintentando con token fresco")
            invalidar_cache_jobs()
            cfg_actual = cargar_cfg()
            nuevo_token = supabase_auth(cfg_actual)
            return http_json(
                f"{cfg['SUPABASE_URL']}/rest/v1/{path}",
                data=data,
                headers={"apikey": cfg["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {nuevo_token}"},
                method=method,
            )
        raise


def registrar_evento(cfg, token, tipo, titulo, contenido, estado="procesado"):
    """Inserta una fila en `eventos` (origen='daemon'). Cada corrida de job pasa por acá."""
    rest(cfg, token, "eventos", data=evento_payload(tipo, titulo, contenido, estado), method="POST")


# ---------- snapshot del estado real del negocio (fuente de verdad para el cerebro) ----------

def snapshot_negocio(cfg, token):
    """Snapshot FRESCO del estado real del negocio desde App RAVN.

    Razón de ser: los generadores del cerebro (Orientación nocturna y "Tu Día")
    se alimentaban SOLO del texto del vault y se retroalimentaban de su propia
    salida anterior — así nacieron alarmas zombie (Pueyrredón "esperando señal"
    cuando ya estaba firmada; "credenciales expuestas" inventadas de un doc). El
    vault es texto y se desactualiza; ESTO es lo que el sistema sabe HOY. Devuelve
    un bloque de texto autocontenido (con encabezado) que se inyecta a los prompts
    con precedencia sobre el vault. Cada sección degrada sola si su fuente falla:
    nunca tumba al generador, a lo sumo informa que el dato no está disponible.
    """
    hoy = date.today()
    bloques = []

    # --- OBRAS / PIPELINE (presupuestos últimos 90 días + estado de su obra) ---
    try:
        corte = (hoy - timedelta(days=90)).isoformat()
        presus = rest(cfg, token,
            "presupuestos?select=id,nombre_obra,nombre_cliente,estado,presupuesto_aprobado,fecha,moneda"
            f"&fecha=gte.{corte}&order=fecha.desc") or []
        obras = rest(cfg, token,
            "obras?select=presupuesto_id,created_at,finalizada_at,cobranza_cerrada_at") or []
        obra_por_presu = {o.get("presupuesto_id"): o for o in obras if o.get("presupuesto_id")}
        cerradas, en_venta = [], []
        for p in presus:
            nombre = p.get("nombre_obra") or p.get("nombre_cliente") or "(sin nombre)"
            moneda = p.get("moneda") or "ARS"
            estado = p.get("estado") or "?"
            o = obra_por_presu.get(p.get("id"))
            if p.get("presupuesto_aprobado") or o:
                if o:
                    desde = (o.get("created_at") or "")[:10]
                    ejec = "FINALIZADA" if o.get("finalizada_at") else "en ejecución"
                    cob = "cobranza CERRADA" if o.get("cobranza_cerrada_at") else "saldo por cobrar ABIERTO"
                    cerradas.append(f"  - {nombre} [{moneda}]: obra abierta {desde}, {ejec}, {cob}")
                else:
                    cerradas.append(f"  - {nombre} [{moneda}]: presupuesto {estado}, aprobado, sin obra creada aún")
            else:
                en_venta.append(f"  - {nombre} [{moneda}]: presupuesto '{estado}'")
        ob = ["OBRAS YA CERRADAS / EN CURSO (firmadas — PROHIBIDO recomendar pedir señal/anticipo/cierre de venta acá; lo único válido es seguimiento de EJECUCIÓN o COBRANZA del saldo):"]
        ob += cerradas or ["  - (ninguna)"]
        if en_venta:
            ob.append("PRESUPUESTOS EN PIPELINE DE VENTA (no aprobados — acá SÍ vale follow-up comercial):")
            ob += en_venta
        bloques.append("\n".join(ob))
    except Exception as e:
        log(f"snapshot obras no disponible: {e}")
        bloques.append("OBRAS: dato NO disponible esta corrida — NO afirmes nada sobre el pipeline ni inventes el estado de una obra.")

    # --- COTIZACIONES EN MESA DE REVISIÓN (trabajo pendiente de Eze en la app) ---
    try:
        cots = rest(cfg, token,
            "cotizaciones?select=titulo,zona,estado&estado=eq.en_revision&order=creado_at.desc") or []
        if cots:
            lin = ["COTIZACIONES EN MESA DE REVISIÓN (listas, esperan que vos las apruebes/emitas en la app):"]
            lin += [f"  - {c.get('titulo') or '(sin título)'}" + (f" — {c.get('zona')}" if c.get('zona') else "")
                    for c in cots[:10]]
            bloques.append("\n".join(lin))
    except Exception as e:
        log(f"snapshot cotizaciones no disponible: {e}")

    # --- PENDIENTES ABIERTOS (tareas) ---
    try:
        tareas = rest(cfg, token,
            "tareas?select=texto,categoria,fecha&estado=eq.pendiente&order=fecha.asc.nullslast") or []
        if tareas:
            lin = ["PENDIENTES ABIERTOS (ya están registrados — no los recomiendes como si fueran una idea nueva):"]
            for t in tareas[:15]:
                f = (t.get("fecha") or "")[:10]
                cat = t.get("categoria") or "—"
                lin.append(f"  - [{cat}] {t.get('texto')}" + (f" ({f})" if f else ""))
            bloques.append("\n".join(lin))
    except Exception as e:
        log(f"snapshot tareas no disponible: {e}")

    # --- DÓLAR DEL DÍA (último evento job_dolar) ---
    try:
        ev = rest(cfg, token,
            "eventos?select=contenido,creado_at&tipo=eq.job_dolar&order=creado_at.desc&limit=1") or []
        if ev:
            cont = ev[0].get("contenido") or {}
            if isinstance(cont, str):
                cont = json.loads(cont)
            blue = (cont.get("blue") or {}).get("venta")
            fdolar = (ev[0].get("creado_at") or "")[:10]
            if blue:
                bloques.append(f"DÓLAR HOY ({fdolar}): blue venta ${blue:g}. Las obras en USD se valúan a ESTE número, no a uno viejo de hace días.")
    except Exception as e:
        log(f"snapshot dolar no disponible: {e}")

    encabezado = (f"ESTADO REAL DEL NEGOCIO — App RAVN al {hoy.isoformat()} "
                  "(FUENTE DE VERDAD: si algo del vault o de una orientación anterior contradice esto, GANA esto):")
    return encabezado + "\n\n" + "\n\n".join(bloques)

# ---------- git del vault (boveda) ----------

def push_vault(mensaje):
    """add -A + commit + (pull --rebase) + push del vault vía el git externo.
    El vault tiene DOS escritores: el bot (por la API de GitHub, desde Railway) y
    este daemon (por git, desde la Mac). Por eso SIEMPRE traemos el remoto antes de
    pushear — si no, el push rebota con 'fetch first' cuando el bot escribió algo."""
    subprocess.run(GIT_VAULT + ["add", "-A"], check=True, capture_output=True, text=True)
    diff = subprocess.run(GIT_VAULT + ["diff", "--cached", "--quiet"])
    if diff.returncode != 0:
        subprocess.run(GIT_VAULT + ["commit", "-m", mensaje], check=True, capture_output=True, text=True)
    r = None
    for _ in (1, 2):
        pr = subprocess.run(GIT_VAULT + ["pull", "--rebase", "origin", "main"], capture_output=True, text=True)
        if pr.returncode != 0:
            # rebase con conflicto → abortar para no dejar el repo trabado
            subprocess.run(GIT_VAULT + ["rebase", "--abort"], capture_output=True, text=True)
        r = subprocess.run(GIT_VAULT + ["push", "origin", "main"], capture_output=True, text=True)
        if r.returncode == 0:
            return
    raise RuntimeError(f"push del vault falló: {r.stderr[:300] if r else 'sin push'}")

# ---------- Claude Code headless (mismo patrón que daemon.py) ----------

def correr_claude(prompt, timeout=1500, modelo="sonnet"):
    cmd = [CLAUDE_BIN, "-p", "--model", modelo, "--output-format", "json",
           "--dangerously-skip-permissions", prompt]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(Path.home()))
    if r.returncode != 0:
        raise RuntimeError(f"claude exit {r.returncode}: {r.stderr[:500]}")
    salida = json.loads(r.stdout)
    return salida.get("result", "")
