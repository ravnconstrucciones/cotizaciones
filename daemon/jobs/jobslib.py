#!/usr/bin/env python3
"""Lib común de los jobs programados de Ravn (com.ravn.jobs).

Parte 1 (pura, testeada): parse de .env, vencimientos, estado local, payload de eventos.
Parte 2 (red/procesos, Tarea 2): Supabase REST, git del vault, Claude Code headless.
"""
import json
from datetime import datetime
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
