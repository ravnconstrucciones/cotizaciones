#!/usr/bin/env python3
"""Job semanal de salud del sistema (Python puro, SIN Claude headless — cero cuota).

Verifica que la puerta anónima de Supabase siga cerrada y que las webs vivan:
1. /auth/v1/settings → disable_signup debe ser true (registro público cerrado).
   Con las policies actuales (authenticated con USING true), un registro abierto
   equivale a acceso total de cualquiera — por eso este check es el primero.
2. Tablas sensibles consultadas como anon (sin login) → deben rebotar o venir vacías.
3. Listado del bucket gastos-obra como anon → debe rebotar (hardening 2026-07-01).
4. Webs en producción → HTTP 200.

Resultado → fila en `eventos` (Actividad de App RAVN). Si hay problemas, el título
arranca con ⚠️ para que se vea de una en el tablero.
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import CTX, http_json, log, registrar_evento

# OJO: ravnpresupuestos.app NO está registrado (verificado 2026-07-01, whois vacío).
# Si Eze lo recompra, sumarlo acá.
WEBS = [
    "https://ravn-app-one-five.vercel.app",
    "https://ravnconstrucciones.com.ar",
]
TABLAS_SENSIBLES = ["presupuestos", "gastos_personales", "cashflow_items", "obras"]


def _check_signup(cfg, problemas):
    data = http_json(
        f"{cfg['SUPABASE_URL']}/auth/v1/settings",
        headers={"apikey": cfg["SUPABASE_ANON_KEY"]},
    )
    if data.get("disable_signup") is not True:
        problemas.append(
            "REGISTRO PÚBLICO ABIERTO (disable_signup=false): cualquiera puede crearse "
            "un usuario y las policies de authenticated le dan acceso total. "
            "Cerrar en dashboard: Authentication → Sign In / Providers → Allow new users to sign up = OFF."
        )


def _anon_get(cfg, path):
    """GET como anon puro (Authorization = anon key, sin sesión)."""
    return http_json(
        f"{cfg['SUPABASE_URL']}{path}",
        headers={
            "apikey": cfg["SUPABASE_ANON_KEY"],
            "Authorization": f"Bearer {cfg['SUPABASE_ANON_KEY']}",
        },
    )


def _check_tablas_anon(cfg, problemas):
    for tabla in TABLAS_SENSIBLES:
        try:
            filas = _anon_get(cfg, f"/rest/v1/{tabla}?select=id&limit=1")
            if isinstance(filas, list) and filas:
                problemas.append(f"tabla `{tabla}` DEVUELVE DATOS a un anónimo (RLS rota o policy para anon)")
        except urllib.error.HTTPError:
            pass  # 401/403/404 = puerta cerrada, es lo esperado


def _check_storage_anon(cfg, problemas):
    try:
        req = urllib.request.Request(
            f"{cfg['SUPABASE_URL']}/storage/v1/object/list/gastos-obra",
            data=json.dumps({"prefix": "", "limit": 5}).encode(),
            headers={
                "Content-Type": "application/json",
                "apikey": cfg["SUPABASE_ANON_KEY"],
                "Authorization": f"Bearer {cfg['SUPABASE_ANON_KEY']}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
            items = json.loads(r.read().decode())
        if isinstance(items, list) and items:
            problemas.append("bucket `gastos-obra` LISTABLE por un anónimo (policy de storage abierta de nuevo)")
    except urllib.error.HTTPError:
        pass  # rebotó = cerrado, correcto


def _check_webs(problemas):
    for url in WEBS:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ravn-salud/1.0"})
            with urllib.request.urlopen(req, timeout=30, context=CTX) as r:
                if r.status != 200:
                    problemas.append(f"{url} respondió HTTP {r.status}")
        except Exception as e:
            problemas.append(f"{url} caída o inaccesible: {str(e)[:120]}")


def correr(cfg, token):
    problemas = []
    _check_signup(cfg, problemas)
    _check_tablas_anon(cfg, problemas)
    _check_storage_anon(cfg, problemas)
    _check_webs(problemas)

    if problemas:
        titulo = f"⚠️ Salud semanal: {len(problemas)} problema(s) de seguridad/disponibilidad"
    else:
        titulo = "Salud semanal: ✅ puerta anónima cerrada, webs vivas"
    contenido = {
        "problemas": problemas or ["ninguno"],
        "checks": ["signup cerrado", "tablas anon", "bucket gastos-obra anon", "webs 200"],
    }
    registrar_evento(cfg, token, "salud_sistema", titulo, contenido)
    log(f"salud: {titulo}")
    if problemas:
        for p in problemas:
            log(f"  ⚠️ {p}")
