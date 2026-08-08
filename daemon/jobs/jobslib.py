#!/usr/bin/env python3
"""Lib común de los jobs programados de Ravn (com.ravn.jobs).

Parte 1 (pura, testeada): parse de .env, vencimientos, estado local, payload de eventos.
Parte 2 (red/procesos, Tarea 2): Supabase REST, git del vault, Claude Code headless.
"""
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

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


def vencio_dominical(ultima_ok, ahora, hora_minima):
    """True si toca la corrida del domingo (una por semana ISO, anclada al domingo).
    Catch-up: si la Mac estuvo apagada todo el domingo, corre en el primer tick
    de la semana siguiente (>= 8 días desde la última OK) en vez de saltearse."""
    if ahora.hour < hora_minima:
        return False
    if ultima_ok is None:
        return ahora.weekday() == 6
    if ultima_ok.isocalendar()[:2] == ahora.isocalendar()[:2]:
        return False
    if ahora.weekday() == 6:
        return True
    return (ahora.date() - ultima_ok.date()).days >= 8


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

# El runner corre como script suelto desde daemon/jobs (launchd), así que el
# paquete raíz `daemon` no está en sys.path; los tests corren desde la raíz.
import sys

_RAIZ_REPO = str(Path(__file__).resolve().parents[2])
if _RAIZ_REPO not in sys.path:
    sys.path.insert(0, _RAIZ_REPO)

from daemon.memoria.sincronizacion_git import (
    FalloSincronizacion,
    SincronizadorGitVault,
    validar_automatizacion_git_externa,
)

DIR_JOBS = Path.home() / ".ravn-jobs"
STATE = DIR_JOBS / "state.json"
LOCK = DIR_JOBS / "runner.lock"
LOG_RUNNER = DIR_JOBS / "logs" / "runner.log"
ENV_DAEMON = Path.home() / ".ravn-jobs" / ".env"
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


# Último token que reemplazó a uno rechazado en ESTE proceso. El runner saca el
# token una vez al arrancar y lo pasa a todos los jobs; si un job largo (claude,
# Mac dormida) lo deja vencer, cada rest() siguiente llegaría con el token viejo
# → 401 → sesión nueva POR CADA request. Con esto, el primer 401 renueva y el
# resto de la corrida usa el token vivo directo, sin 401 ni sesiones de más.
_TOKEN_VIVO = {"token": None}


def _renovar_token_rechazado(cfg, rechazado):
    """Devuelve un token distinto al rechazado. Primero prueba el cache de disco
    (otro pudo haberlo renovado ya); solo si el cacheado ES el rechazado, lo
    invalida y hace login fresco."""
    nuevo = supabase_auth(cfg)
    if nuevo == rechazado:
        invalidar_cache_jobs()
        nuevo = supabase_auth(cargar_cfg())
    _TOKEN_VIVO["token"] = nuevo
    return nuevo


def rest(cfg, token, path, data=None, method="GET"):
    tok = _TOKEN_VIVO["token"] or token
    try:
        return http_json(
            f"{cfg['SUPABASE_URL']}/rest/v1/{path}",
            data=data,
            headers={"apikey": cfg["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {tok}"},
            method=method,
        )
    except urllib.error.HTTPError as e:
        if e.code == 401:
            log("jobs rest: 401 recibido, renovando token y reintentando")
            nuevo_token = _renovar_token_rechazado(cfg, tok)
            return http_json(
                f"{cfg['SUPABASE_URL']}/rest/v1/{path}",
                data=data,
                headers={"apikey": cfg["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {nuevo_token}"},
                method=method,
            )
        raise


def registrar_evento(
    cfg, token, tipo, titulo, contenido, estado="procesado", evento_id=None
):
    """Inserta un evento; con identidad estable, un reintento no lo duplica."""
    payload = evento_payload(tipo, titulo, contenido, estado)
    if evento_id is None:
        return rest(cfg, token, "eventos", data=payload, method="POST")

    evento_id = str(UUID(str(evento_id)))
    payload["id"] = evento_id
    filtro = f"eventos?id=eq.{evento_id}&select=id&limit=1"

    existente = rest(cfg, token, filtro)
    if existente:
        return existente[0]

    try:
        return rest(cfg, token, "eventos", data=payload, method="POST")
    except urllib.error.HTTPError as error:
        if error.code != 409:
            raise
        existente = rest(cfg, token, filtro)
        if existente:
            return existente[0]
        raise


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
        vistos = set()
        for p in presus:
            nombre = p.get("nombre_obra") or p.get("nombre_cliente") or "(sin nombre)"
            nl = nombre.strip().lower()
            # La "obra" contenedora de gastos generales no es pipeline, es contabilidad: fuera.
            if "gastos generales" in nl or "empresa (gastos" in nl:
                continue
            # Dedup por nombre: presus viene fecha desc → la 1ª ocurrencia es la más reciente.
            if nl in vistos:
                continue
            vistos.add(nl)
            moneda = p.get("moneda") or "ARS"
            estado = p.get("estado") or "?"
            o = obra_por_presu.get(p.get("id"))
            if p.get("presupuesto_aprobado") or o:
                if o:
                    # Finalizada Y cobrada = historia cerrada: ni ejecución ni cobranza que seguir.
                    if o.get("finalizada_at") and o.get("cobranza_cerrada_at"):
                        continue
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

    # --- SANIDAD DEL LOOP DEL COTIZADOR (vista cotizador_huerfanos, regla 04/08) ---
    # Debe estar SIEMPRE vacía; si trae filas hay una fuga en el circuito
    # (cotización sin receta, aprobada sin obra, u obra finalizada sin contraste).
    try:
        huerf = rest(cfg, token,
            "cotizador_huerfanos?select=motivo,titulo,detalle") or []
        if huerf:
            lin = ["⚠ FUGAS EN EL LOOP DEL COTIZADOR (vista cotizador_huerfanos — debería estar vacía; "
                   "cantale esto a Eze como pendiente concreto, no como idea nueva):"]
            lin += [f"  - [{h.get('motivo')}] {h.get('titulo')}: {h.get('detalle')}" for h in huerf[:10]]
            bloques.append("\n".join(lin))
    except Exception as e:
        log(f"snapshot cotizador_huerfanos no disponible: {e}")

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

def crear_sincronizador_vault():
    return SincronizadorGitVault(
        vault=Path(VAULT),
        git_dir=Path.home() / ".ravn-vault-git",
        lock_path=DIR_JOBS / "vault-git.lock",
    )


def pull_vault():
    """Pull serializado; nunca deja un conflicto de rebase abierto."""
    resultado = crear_sincronizador_vault().pull_solo()
    if not resultado.sincronizado:
        raise RuntimeError(
            f"pull del vault falló en {resultado.paso}: {resultado.detalle or {}}"
        )

def transaccion_vault(
    persistir,
    *,
    rutas=None,
    mensaje,
    exigir_limpio=False,
    validar_rutas=None,
):
    """Ejecuta escritura y Git bajo un lock, con ownership explícito por rutas."""
    validar_automatizacion_git_externa(Path(VAULT))
    sincronizador = crear_sincronizador_vault()

    def persistir_controlado():
        if exigir_limpio:
            existentes = sincronizador.rutas_modificadas(incluir_no_trackeadas=True)
            if existentes:
                raise RuntimeError(
                    "el Vault debe estar limpio antes de una escritura dinámica: "
                    + ", ".join(existentes[:10])
                )
        return persistir()

    def rutas_controladas(resultado):
        candidatas = (
            list(rutas(resultado))
            if rutas is not None
            else [
                Path(VAULT) / ruta
                for ruta in sincronizador.rutas_modificadas(
                    incluir_no_trackeadas=True
                )
            ]
        )
        if validar_rutas is not None:
            try:
                validar_rutas(candidatas)
            except ValueError as error:
                raise FalloSincronizacion(
                    "stage", {"motivo": "rutas_del_job_no_permitidas"}
                ) from error
        return candidatas

    resultado, estado_git = sincronizador.transaccion(
        persistir_controlado,
        rutas=rutas_controladas,
        mensaje=mensaje,
        registrar_pendiente=_registrar_pendiente_vault,
    )
    if not estado_git.sincronizado:
        raise RuntimeError(
            f"sincronización del Vault pendiente en {estado_git.paso}: "
            f"{estado_git.detalle or {}}"
        )
    return resultado


def _registrar_pendiente_vault(operacion, detalle):
    directorio = DIR_JOBS / "pendientes-vault"
    directorio.mkdir(parents=True, exist_ok=True)
    destino = directorio / f"{uuid4()}.json"
    destino.write_text(
        json.dumps(
            {"operacion": operacion, "detalle": detalle},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    destino.chmod(0o600)
    return destino


def push_vault(mensaje, rutas=None):
    """Compatibilidad explícita: sin allowlist se rechaza; nunca usa add -A."""
    if not rutas:
        raise ValueError("push_vault requiere rutas explícitas; use transaccion_vault.")
    return transaccion_vault(
        lambda: None,
        rutas=lambda _resultado: rutas,
        mensaje=mensaje,
    )

# ---------- Claude Code headless (mismo patrón que daemon.py) ----------

def correr_claude(prompt, timeout=1500, modelo="sonnet"):
    cmd = [CLAUDE_BIN, "-p", "--model", modelo, "--output-format", "json",
           "--dangerously-skip-permissions", prompt]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(Path.home()))
    if r.returncode != 0:
        # El CLI suele reportar el motivo (límite de uso, etc.) por stdout, no stderr.
        detalle = (r.stderr or "").strip() or (r.stdout or "").strip() or "sin detalle"
        raise RuntimeError(f"claude exit {r.returncode}: {detalle[:500]}")
    salida = json.loads(r.stdout)
    return salida.get("result", "")
