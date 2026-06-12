# Frente E — Cerebro + limpieza — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir los jobs programados del daemon Mac (inbox nocturno con catch-up, SISMAT mensual, top-30 materiales semanal, dólar diario) registrando cada corrida en `eventos`, migrar el latido de la Mac a la tabla singleton `sistema_estado` (y recién entonces dropear `cotizaciones_cola`), y ejecutar la baja ordenada de las piezas viejas (§8 del spec) con gate de verificación previa a cada borrado.

**Architecture:** El código de los jobs vive versionado en el repo (`~/Documents/ravn/daemon/jobs/`, path sin espacios) y se ejecuta vía un único LaunchAgent nuevo `com.ravn.jobs` que copia el patrón probado de `com.ravn.cotizador` (StartInterval + RunAtLoad + logs a archivo). Un `runner.py` corre cada 30 minutos, decide qué jobs vencieron según un estado local (`~/.ravn-jobs/state.json`) y los ejecuta en orden — eso da catch-up automático si la Mac estuvo apagada (al primer tick después del boot, todo lo vencido corre) y reintentos con tope de 3 por día. La aritmética de vencimientos es código puro testeado con `unittest` (stdlib, sin dependencias). Las bajas son tareas operativas: cada una arranca con un GATE verificable ("el reemplazo funciona") y archiva (no borra) en `Sistema/_archivo-2026-06/`. El latido de la Mac migra en tres pasos seguros: migración `sistema_estado` (singleton) → el daemon escribe doble (tabla nueva + fila vieja) → el bot lee la nueva → se corta la escritura vieja y se dropea `cotizaciones_cola`.

**Tech Stack:** Python 3.13 (`/Library/Frameworks/Python.framework/Versions/3.13/bin/python3`, ya tiene `certifi`), `unittest` stdlib, launchd (LaunchAgents), Claude Code headless (`~/.local/bin/claude -p`, suscripción), Supabase REST (usuario bot `BOT_EMAIL`/`BOT_PASSWORD` de `~/.ravn-cotizador/.env`), git del vault (`--git-dir ~/.ravn-vault-git --work-tree /Users/ezeotero/Obsidian/RAVN`, remoto `boveda`), Vercel CLI, APIs Bluelytics/DolarAPI.

---

## Contexto que el ejecutor necesita saber (leelo antes de la Tarea 1)

- **Repo de trabajo:** `/Users/ezeotero/Documents/ravn` (git, remoto `ravnconstrucciones/cotizaciones`). Todos los commits de código van acá.
- **Vault:** `/Users/ezeotero/Obsidian/RAVN` es un SYMLINK a iCloud. Su `.git` vive AFUERA, en `/Users/ezeotero/.ravn-vault-git` (remoto `ravnconstrucciones/boveda`, branch `main`). Operar SIEMPRE por la ruta del symlink. NUNCA meter un `.git` dentro del vault.
- **Por qué falló el viejo `com.ravn.tudia`:** su wrapper `~/ravn-morning.sh` hacía `exec` a un script DENTRO de iCloud (`/Users/ezeotero/Library/Mobile Documents/iCloud~md~obsidian/...` — path con espacios). El nuevo diseño no ejecuta NADA desde iCloud: el código vive en `~/Documents/ravn/daemon/` y el wrapper en `~/.ravn-jobs/` (ambos sin espacios).
- **Patrón launchd que SÍ funciona** (copiado de `~/Library/LaunchAgents/com.ravn.cotizador.plist`): `ProgramArguments` con paths absolutos, `StartInterval` + `RunAtLoad`, `StandardOutPath`/`StandardErrorPath` a archivos, `EnvironmentVariables` con `PATH` y `HOME`.
- **Credenciales:** `~/.ravn-cotizador/.env` tiene `BOT_EMAIL`, `BOT_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WHATSAPP_*`, `OWNER_PHONE`. No imprimir valores en logs.
- **Tablas del contrato que este frente USA (las crea el Frente A):** `eventos` (origen `daemon`, estados `procesado|pendiente_pregunta|archivado|resuelto`) y `referencias` (tipo `filosofia|estetica`, `etiquetas text[]`). Si `referencias` aún no existe, el job de inbox degrada con gracia; si `eventos` no existe, el registro de corridas falla (correr este frente en vivo DESPUÉS del Frente A).
- **Gotcha mortal:** NUNCA `pkill -f server.py` ni `pkill python` — mata otros tools (memoria `ravn-selector-color`). Matar procesos SOLO por puerto: `lsof -ti:PUERTO | xargs kill`.
- **Tests:** `unittest` de la stdlib (no agregamos pytest a la Mac). Comando base:
  `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v`
- **Timestamps de migraciones:** Frente A usa `20260612100000`–`20260612112000`, Frente D `20260612200000`, Frente B `20260613100000`. Las DOS migraciones de este frente usan `20260614*` para ordenar DESPUÉS de todas. No cambiar.
- **Aviso de gasto (memoria feedback-aviso-de-gasto):** los jobs `inbox` y `top30` corren Claude Code headless con la suscripción. En las verificaciones en vivo de este plan cada uno se corre UNA sola vez, avisándole a Eze antes. Nada de loops de prueba.
- **Dependencias de otros frentes:** Tareas 1-9 solo necesitan el Frente A ejecutado (tabla `eventos` + usuario bot). Tarea 10 necesita A (usa `set_actualizado_at()`). **Tarea 11 necesita el Frente D YA ejecutado** (su Task 18 REEMPLAZA `~/.ravn-cotizador/daemon.py` completo; si la Tarea 11 corre antes, ese reemplazo PISA el latido doble y `macViva` vería la Mac muerta — el gate de orden está en la propia Tarea 11). Tarea 12 se hace sobre la rama `frente-c-bot-2` del Frente C. Tarea 13 (drop) necesita además el daemon del Frente D procesando `trabajos_cola`. Tareas 14-16 necesitan el Centro de Mando (Frente B) deployado. Si un gate falla porque otro frente no corrió, FRENAR esa tarea y seguir con las que no dependan.
- **Frontera con el Frente B (spec §12):** el ítem "lecturas del vault en el tablero" que el spec lista bajo el Frente E NO tiene tarea acá A PROPÓSITO: lo cubre el Frente B con su lib de lectura del vault vía GitHub (`boveda`) y el módulo "El cerebro" del home. Este plan solo ESCRIBE el vault (jobs) y registra eventos; nadie busque ese requisito en este documento.

### Mapa de archivos del frente

```
~/Documents/ravn/daemon/
├── README.md                      # runbook de operación (Tarea 17)
├── install.sh                     # instala wrapper + plist + bootstrap launchd (Tarea 8)
├── launchd/
│   └── com.ravn.jobs.plist        # el ÚNICO plist nuevo (Tarea 8)
└── jobs/
    ├── run-jobs.sh                # wrapper (se copia a ~/.ravn-jobs/) (Tarea 8)
    ├── jobslib.py                 # lib común: env, vencimientos, estado, REST, eventos, git vault, claude (Tareas 1-2)
    ├── chequear_evento.py         # CLI de gates: imprime el último evento de un tipo (Tarea 2)
    ├── job_dolar.py               # dólar diario sin IA (Tarea 3)
    ├── job_sismat.py              # SISMAT mensual (corre sync.py existente) (Tarea 4)
    ├── job_top30.py               # refresh semanal de materiales con Claude headless (Tarea 5)
    ├── job_inbox.py               # inbox nocturno + patrones ADN con Claude headless (Tarea 6)
    ├── runner.py                  # orquestador: decide vencidos, corre, marca estado (Tarea 7)
    └── tests/
        ├── test_jobslib.py
        ├── test_job_dolar.py
        ├── test_job_sismat.py
        ├── test_job_top30.py
        ├── test_job_inbox.py
        └── test_runner.py

~/.ravn-jobs/                      # runtime local (lo crea install.sh — NO va al repo)
├── run-jobs.sh                    # copia instalada del wrapper
├── state.json                     # última corrida OK / errores por job
├── runner.lock
└── logs/{launchd.log, launchd.err.log, runner.log}

Fuera del árbol daemon/ (Tareas 10-16):
- supabase/migrations/20260614100000_sistema_estado.sql          (Tarea 10)
- supabase/migrations/20260614110000_drop_cotizaciones_cola.sql  (Tarea 13)
- ~/.ravn-cotizador/daemon.py — FUERA de git, backup .bak        (Tareas 11 y 13)
- ~/Documents/ravn-bots: src/supabaseService.js +
  test/supabase-macviva.test.js — rama frente-c-bot-2            (Tarea 12)
- Bajas operativas (launchd, servers, panel, ravn-tu-dia)        (Tareas 14-16)
```

### Cronograma de jobs (decidido en este plan)

| Job | Frecuencia | Condición de vencimiento (hora local) | Motor |
|---|---|---|---|
| `dolar` | diario | última OK < hoy y hora ≥ 8 | API Bluelytics → fallback DolarAPI (sin IA) |
| `sismat` | mensual | último OK en mes anterior, día ≥ 2 y hora ≥ 8 | `sync.py` existente del vault |
| `top30` | semanal | última OK en semana ISO anterior y hora ≥ 8 | Claude Code headless (sonnet) |
| `inbox` | diario (nocturno) | última OK < hoy y hora ≥ 2 | Claude Code headless (sonnet) |

El runner corre cada 30 min (`StartInterval 1800`) + `RunAtLoad`. **Catch-up:** si la Mac estuvo apagada a la hora del job, el primer tick tras el arranque lo encuentra vencido y lo corre. **Reintentos:** un job que falla no marca `ultima_ok`, así que el tick siguiente lo reintenta; tope de 3 errores por día (después espera al día siguiente). Cada corrida (OK o error) registra una fila en `eventos` con `origen='daemon'`.

---

### Tarea 1: jobslib — parsing de env, vencimientos y estado (lógica pura, TDD)

**Files:**
- Create: `daemon/jobs/jobslib.py`
- Test: `daemon/jobs/tests/test_jobslib.py`

- [ ] **Step 1: Crear la estructura de carpetas**

```bash
mkdir -p /Users/ezeotero/Documents/ravn/daemon/jobs/tests /Users/ezeotero/Documents/ravn/daemon/launchd
```

- [ ] **Step 2: Escribir los tests que fallan**

Crear `daemon/jobs/tests/test_jobslib.py`:

```python
import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import jobslib


class TestParseEnv(unittest.TestCase):
    def test_parsea_claves_y_valores(self):
        texto = 'A=1\nB="dos"\n# comentario\n\nC = tres '
        cfg = jobslib.parse_env(texto)
        self.assertEqual(cfg, {"A": "1", "B": "dos", "C": "tres"})

    def test_ignora_lineas_sin_igual(self):
        self.assertEqual(jobslib.parse_env("solo texto\n"), {})


class TestVencimientos(unittest.TestCase):
    def test_diario_nunca_corrio_despues_de_hora(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        self.assertTrue(jobslib.vencio_diario(None, ahora, hora_minima=8))

    def test_diario_antes_de_hora_minima_no_vence(self):
        ahora = datetime(2026, 6, 12, 7, 59)
        self.assertFalse(jobslib.vencio_diario(None, ahora, hora_minima=8))

    def test_diario_ya_corrio_hoy_no_vence(self):
        ultima = datetime(2026, 6, 12, 2, 10)
        ahora = datetime(2026, 6, 12, 14, 0)
        self.assertFalse(jobslib.vencio_diario(ultima, ahora, hora_minima=2))

    def test_diario_corrio_ayer_vence(self):
        ultima = datetime(2026, 6, 11, 2, 10)
        ahora = datetime(2026, 6, 12, 2, 30)
        self.assertTrue(jobslib.vencio_diario(ultima, ahora, hora_minima=2))

    def test_semanal_misma_semana_iso_no_vence(self):
        # 2026-06-08 (lunes) y 2026-06-12 (viernes) son la misma semana ISO
        ultima = datetime(2026, 6, 8, 9, 0)
        ahora = datetime(2026, 6, 12, 9, 0)
        self.assertFalse(jobslib.vencio_semanal(ultima, ahora, hora_minima=8))

    def test_semanal_semana_anterior_vence(self):
        ultima = datetime(2026, 6, 5, 9, 0)   # semana ISO anterior
        ahora = datetime(2026, 6, 8, 9, 0)    # lunes siguiente
        self.assertTrue(jobslib.vencio_semanal(ultima, ahora, hora_minima=8))

    def test_semanal_cruce_de_anio_misma_semana(self):
        # 2025-12-29 (lunes) pertenece a la semana ISO 1 de 2026
        ultima = datetime(2025, 12, 29, 9, 0)
        ahora = datetime(2026, 1, 2, 9, 0)
        self.assertFalse(jobslib.vencio_semanal(ultima, ahora, hora_minima=8))

    def test_mensual_mismo_mes_no_vence(self):
        ultima = datetime(2026, 6, 2, 9, 0)
        ahora = datetime(2026, 6, 20, 9, 0)
        self.assertFalse(jobslib.vencio_mensual(ultima, ahora, dia_minimo=2, hora_minima=8))

    def test_mensual_mes_anterior_pero_dia_1_no_vence(self):
        ultima = datetime(2026, 5, 2, 9, 0)
        ahora = datetime(2026, 6, 1, 9, 0)
        self.assertFalse(jobslib.vencio_mensual(ultima, ahora, dia_minimo=2, hora_minima=8))

    def test_mensual_mes_anterior_dia_2_vence(self):
        ultima = datetime(2026, 5, 2, 9, 0)
        ahora = datetime(2026, 6, 2, 9, 0)
        self.assertTrue(jobslib.vencio_mensual(ultima, ahora, dia_minimo=2, hora_minima=8))

    def test_mensual_nunca_corrio_vence(self):
        ahora = datetime(2026, 6, 2, 9, 0)
        self.assertTrue(jobslib.vencio_mensual(None, ahora, dia_minimo=2, hora_minima=8))


class TestEstado(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "state.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_cargar_inexistente_devuelve_vacio(self):
        self.assertEqual(jobslib.cargar_estado(self.path), {})

    def test_marcar_ok_y_leer_ultima_ok(self):
        ahora = datetime(2026, 6, 12, 2, 30)
        jobslib.marcar_ok(self.path, "inbox", ahora)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.ultima_ok(estado, "inbox"), ahora)
        self.assertEqual(jobslib.errores_hoy(estado, "inbox", ahora), 0)

    def test_marcar_error_acumula_en_el_dia(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        jobslib.marcar_error(self.path, "dolar", ahora)
        jobslib.marcar_error(self.path, "dolar", ahora)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.errores_hoy(estado, "dolar", ahora), 2)

    def test_errores_de_ayer_no_cuentan_hoy(self):
        ayer = datetime(2026, 6, 11, 9, 0)
        hoy = datetime(2026, 6, 12, 9, 0)
        jobslib.marcar_error(self.path, "dolar", ayer)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.errores_hoy(estado, "dolar", hoy), 0)

    def test_marcar_ok_resetea_errores(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        jobslib.marcar_error(self.path, "dolar", ahora)
        jobslib.marcar_ok(self.path, "dolar", ahora)
        estado = jobslib.cargar_estado(self.path)
        self.assertEqual(jobslib.errores_hoy(estado, "dolar", ahora), 0)


class TestEventoPayload(unittest.TestCase):
    def test_forma_canonica(self):
        p = jobslib.evento_payload("job_dolar", "Dólar actualizado", {"blue": 1450})
        self.assertEqual(p["origen"], "daemon")
        self.assertEqual(p["tipo"], "job_dolar")
        self.assertEqual(p["estado"], "procesado")
        self.assertEqual(p["titulo"], "Dólar actualizado")
        self.assertEqual(p["contenido"], {"blue": 1450})

    def test_estado_archivado_y_titulo_truncado(self):
        p = jobslib.evento_payload("job_inbox", "x" * 300, {}, estado="archivado")
        self.assertEqual(p["estado"], "archivado")
        self.assertEqual(len(p["titulo"]), 200)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: ERROR en el import — `ModuleNotFoundError: No module named 'jobslib'`.

- [ ] **Step 4: Implementar la parte pura de jobslib**

Crear `daemon/jobs/jobslib.py`:

```python
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
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` con 20 tests pasando.

- [ ] **Step 6: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/jobslib.py daemon/jobs/tests/test_jobslib.py && git commit -m "feat(daemon): jobslib — vencimientos, estado y payload de eventos (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Tarea 2: jobslib — Supabase REST, eventos, git del vault y Claude headless

**Files:**
- Modify: `daemon/jobs/jobslib.py` (agregar al final)
- Create: `daemon/jobs/chequear_evento.py`

Esta parte es integración (red y subprocesos): no lleva tests unitarios, lleva verificación en vivo (smoke de auth). Los patrones están copiados de `~/.ravn-cotizador/daemon.py`, que funciona en producción hoy.

- [ ] **Step 1: Agregar la parte de red/procesos a jobslib.py**

Agregar al FINAL de `daemon/jobs/jobslib.py`:

```python
# ---------- constantes de runtime ----------

import os
import ssl
import subprocess
import urllib.request

import certifi

DIR_JOBS = Path.home() / ".ravn-jobs"
STATE = DIR_JOBS / "state.json"
LOCK = DIR_JOBS / "runner.lock"
LOG_RUNNER = DIR_JOBS / "logs" / "runner.log"
ENV_DAEMON = Path.home() / ".ravn-cotizador" / ".env"
VAULT = "/Users/ezeotero/Obsidian/RAVN"
GIT_VAULT = ["git", "--git-dir", str(Path.home() / ".ravn-vault-git"), "--work-tree", VAULT]
CLAUDE_BIN = str(Path.home() / ".local" / "bin" / "claude")
CTX = ssl.create_default_context(cafile=certifi.where())


def log(msg):
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{stamp}] {msg}", flush=True)


def cargar_cfg():
    return parse_env(ENV_DAEMON.read_text())

# ---------- HTTP / Supabase REST (mismo patrón que daemon.py) ----------

def http_json(url, data=None, headers=None, method=None, timeout=30):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        cuerpo = r.read().decode()
        return json.loads(cuerpo) if cuerpo.strip() else None


def supabase_auth(cfg):
    r = http_json(
        f"{cfg['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        data={"email": cfg["BOT_EMAIL"], "password": cfg["BOT_PASSWORD"]},
        headers={"apikey": cfg["SUPABASE_ANON_KEY"]},
    )
    return r["access_token"]


def rest(cfg, token, path, data=None, method="GET"):
    return http_json(
        f"{cfg['SUPABASE_URL']}/rest/v1/{path}",
        data=data,
        headers={"apikey": cfg["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {token}"},
        method=method,
    )


def registrar_evento(cfg, token, tipo, titulo, contenido, estado="procesado"):
    """Inserta una fila en `eventos` (origen='daemon'). Cada corrida de job pasa por acá."""
    rest(cfg, token, "eventos", data=evento_payload(tipo, titulo, contenido, estado), method="POST")

# ---------- git del vault (boveda) ----------

def push_vault(mensaje):
    """add -A + commit + push del vault vía el git externo (~/.ravn-vault-git).
    Si no hay cambios, igual intenta push (por si quedó un commit local sin pushear)."""
    subprocess.run(GIT_VAULT + ["add", "-A"], check=True, capture_output=True, text=True)
    diff = subprocess.run(GIT_VAULT + ["diff", "--cached", "--quiet"])
    if diff.returncode != 0:
        subprocess.run(GIT_VAULT + ["commit", "-m", mensaje], check=True, capture_output=True, text=True)
    r = subprocess.run(GIT_VAULT + ["push", "origin", "main"], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"push del vault falló: {r.stderr[:300]}")

# ---------- Claude Code headless (mismo patrón que daemon.py) ----------

def correr_claude(prompt, timeout=1500, modelo="sonnet"):
    cmd = [CLAUDE_BIN, "-p", "--model", modelo, "--output-format", "json",
           "--dangerously-skip-permissions", prompt]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=str(Path.home()))
    if r.returncode != 0:
        raise RuntimeError(f"claude exit {r.returncode}: {r.stderr[:500]}")
    salida = json.loads(r.stdout)
    return salida.get("result", "")
```

- [ ] **Step 2: Crear el CLI de gates `chequear_evento.py`**

Crear `daemon/jobs/chequear_evento.py` (las tareas de baja lo usan como GATE):

```python
#!/usr/bin/env python3
"""Gate de verificación: imprime el último evento de un tipo dado.

Uso: python3 chequear_evento.py job_inbox
Sale con código 1 (y mensaje GATE FALLÓ) si no hay ningún evento de ese tipo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import cargar_cfg, supabase_auth, rest

if len(sys.argv) != 2:
    sys.exit("Uso: chequear_evento.py <tipo>  (ej: job_inbox)")

tipo = sys.argv[1]
cfg = cargar_cfg()
token = supabase_auth(cfg)
filas = rest(cfg, token, f"eventos?tipo=eq.{tipo}&order=creado_at.desc&limit=1")
if not filas:
    sys.exit(f"GATE FALLÓ: no hay eventos tipo {tipo} en la tabla eventos")
f = filas[0]
print(f"OK — último evento {tipo}: {f['creado_at']} · estado={f['estado']} · {f['titulo']}")
```

- [ ] **Step 3: Verificar que los tests de la Tarea 1 siguen pasando (no rompimos imports)**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` (20 tests).

- [ ] **Step 4: Smoke test de auth contra Supabase (en vivo)**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/ezeotero/Documents/ravn/daemon/jobs')
from jobslib import cargar_cfg, supabase_auth
token = supabase_auth(cargar_cfg())
print('auth OK, token de', len(token), 'chars')
"
```

Expected: `auth OK, token de <N> chars` (N > 100). Si falla con 400: revisar que el usuario bot exista en Supabase Auth (lo crea el Frente A) — anotar y seguir, pero NO correr las tareas en vivo (9 en adelante) hasta resolverlo.

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/jobslib.py daemon/jobs/chequear_evento.py && git commit -m "feat(daemon): jobslib REST/eventos/git-vault/claude headless + CLI de gates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 3: job_dolar — dólar diario sin IA (TDD en parsing y bloque md)

**Files:**
- Create: `daemon/jobs/job_dolar.py`
- Test: `daemon/jobs/tests/test_job_dolar.py`

Escribe `Conocimiento/Precios/dolar.json` (fuente canónica para el motor del Frente D) y mantiene un bloque entre marcadores `<!-- DOLAR:START/END -->` arriba de `materiales-construccion.md`. Después pushea el vault y registra el evento.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `daemon/jobs/tests/test_job_dolar.py`:

```python
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_dolar

BLUELYTICS = {
    "oficial": {"value_buy": 1010.0, "value_sell": 1050.0},
    "blue": {"value_buy": 1400.0, "value_sell": 1450.0},
    "last_update": "2026-06-12T09:00:00-03:00",
}

DOLARAPI = [
    {"casa": "oficial", "compra": 1010.0, "venta": 1050.0},
    {"casa": "blue", "compra": 1400.0, "venta": 1450.0},
    {"casa": "bolsa", "compra": 1300.0, "venta": 1320.0},
]

MD_EJEMPLO = """# Base de Precios — Materiales de Construcción

> **REGLA:** Los valores de precio son siempre del día.

---

## Adhesivos y pegamentos

| Material | Unidad | Último precio | Fecha | Fuente | Query de actualización |
|---|---|---|---|---|---|
| Weber Superflex | bolsa 25kg | $24.990 | 2026-06-08 | Store409 | `query` |
"""


class TestParseo(unittest.TestCase):
    def test_parsear_bluelytics(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        self.assertEqual(c["fuente"], "bluelytics")
        self.assertEqual(c["oficial"], {"compra": 1010.0, "venta": 1050.0})
        self.assertEqual(c["blue"], {"compra": 1400.0, "venta": 1450.0})

    def test_parsear_dolarapi(self):
        c = job_dolar.parsear_dolarapi(DOLARAPI)
        self.assertEqual(c["fuente"], "dolarapi")
        self.assertEqual(c["blue"], {"compra": 1400.0, "venta": 1450.0})
        self.assertNotIn("bolsa", c)


class TestBloqueMd(unittest.TestCase):
    def test_formatear_bloque_tiene_marcadores_y_valores(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        b = job_dolar.formatear_bloque(c, "2026-06-12")
        self.assertIn("<!-- DOLAR:START -->", b)
        self.assertIn("<!-- DOLAR:END -->", b)
        self.assertIn("2026-06-12", b)
        self.assertIn("1,450", b)

    def test_insertar_primera_vez_despues_del_header(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        bloque = job_dolar.formatear_bloque(c, "2026-06-12")
        nuevo = job_dolar.insertar_bloque(MD_EJEMPLO, bloque)
        self.assertEqual(nuevo.count("<!-- DOLAR:START -->"), 1)
        # el bloque queda antes de la primera sección de materiales
        self.assertLess(nuevo.index("DOLAR:START"), nuevo.index("## Adhesivos"))
        # no rompe el contenido existente
        self.assertIn("Weber Superflex", nuevo)

    def test_insertar_segunda_vez_reemplaza_no_duplica(self):
        c = job_dolar.parsear_bluelytics(BLUELYTICS)
        b1 = job_dolar.formatear_bloque(c, "2026-06-12")
        b2 = job_dolar.formatear_bloque(c, "2026-06-13")
        md1 = job_dolar.insertar_bloque(MD_EJEMPLO, b1)
        md2 = job_dolar.insertar_bloque(md1, b2)
        self.assertEqual(md2.count("<!-- DOLAR:START -->"), 1)
        self.assertIn("2026-06-13", md2)
        self.assertNotIn("2026-06-12**", md2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `ModuleNotFoundError: No module named 'job_dolar'`.

- [ ] **Step 3: Implementar job_dolar.py**

Crear `daemon/jobs/job_dolar.py`:

```python
#!/usr/bin/env python3
"""Job diario: cotización del dólar SIN IA (Bluelytics → fallback DolarAPI).

Escribe Conocimiento/Precios/dolar.json (canónico) + bloque arriba de
materiales-construccion.md, pushea el vault y registra el evento.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, http_json, push_vault, registrar_evento

URL_BLUELYTICS = "https://api.bluelytics.com.ar/v2/latest"
URL_DOLARAPI = "https://dolarapi.com/v1/dolares"
DOLAR_JSON = Path(VAULT) / "Conocimiento" / "Precios" / "dolar.json"
MD_PRECIOS = Path(VAULT) / "Conocimiento" / "Precios" / "materiales-construccion.md"
PATRON_BLOQUE = re.compile(r"<!-- DOLAR:START -->.*?<!-- DOLAR:END -->", re.DOTALL)


def parsear_bluelytics(datos):
    return {
        "oficial": {"compra": datos["oficial"]["value_buy"], "venta": datos["oficial"]["value_sell"]},
        "blue": {"compra": datos["blue"]["value_buy"], "venta": datos["blue"]["value_sell"]},
        "fuente": "bluelytics",
    }


def parsear_dolarapi(lista):
    out = {"fuente": "dolarapi"}
    for d in lista:
        if d.get("casa") in ("oficial", "blue"):
            out[d["casa"]] = {"compra": d["compra"], "venta": d["venta"]}
    if "oficial" not in out or "blue" not in out:
        raise ValueError("dolarapi no devolvió oficial y blue")
    return out


def formatear_bloque(cotiz, fecha):
    return (
        "<!-- DOLAR:START -->\n"
        f"**Dólar del día — {fecha}** (fuente: {cotiz['fuente']}, actualización automática diaria)\n\n"
        "| Tipo | Compra | Venta |\n|---|---|---|\n"
        f"| Oficial | ${cotiz['oficial']['compra']:,.0f} | ${cotiz['oficial']['venta']:,.0f} |\n"
        f"| Blue | ${cotiz['blue']['compra']:,.0f} | ${cotiz['blue']['venta']:,.0f} |\n"
        "<!-- DOLAR:END -->"
    )


def insertar_bloque(md, bloque):
    """Reemplaza el bloque existente; si no hay, lo inserta después del primer '---'."""
    if PATRON_BLOQUE.search(md):
        return PATRON_BLOQUE.sub(bloque, md)
    partes = md.split("\n---\n", 1)
    if len(partes) == 2:
        return partes[0] + "\n---\n\n" + bloque + "\n" + partes[1]
    return bloque + "\n\n" + md


def correr(cfg, token):
    try:
        cotiz = parsear_bluelytics(http_json(URL_BLUELYTICS))
    except Exception:
        cotiz = parsear_dolarapi(http_json(URL_DOLARAPI))
    fecha = date.today().isoformat()
    DOLAR_JSON.write_text(json.dumps({"fecha": fecha, **cotiz}, ensure_ascii=False, indent=2))
    md = MD_PRECIOS.read_text()
    MD_PRECIOS.write_text(insertar_bloque(md, formatear_bloque(cotiz, fecha)))
    push_vault(f"daemon: dólar diario {fecha}")
    registrar_evento(
        cfg, token, "job_dolar",
        f"Dólar actualizado — blue ${cotiz['blue']['venta']:,.0f} / oficial ${cotiz['oficial']['venta']:,.0f}",
        {"fecha": fecha, **cotiz},
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` (25 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/job_dolar.py daemon/jobs/tests/test_job_dolar.py && git commit -m "feat(daemon): job dólar diario sin IA (Bluelytics/DolarAPI) con TDD

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Tarea 4: job_sismat — sync mensual del tarifario (TDD en la verificación de meta)

**Files:**
- Create: `daemon/jobs/job_sismat.py`
- Test: `daemon/jobs/tests/test_job_sismat.py`

El script de sync YA existe y funciona: `/Users/ezeotero/Obsidian/RAVN/Conocimiento/Precios/sismat/sync.py` (login Laravel Sanctum, credenciales `SISMAT_EMAIL`/`SISMAT_PASSWORD` en `~/.claude/.env`, escribe `tasks.json`, `materials.json` y `meta.json` con `"descargado": "YYYY-MM-DD"`). Este job solo lo agenda: lo corre, verifica que `meta.json` quedó con fecha de hoy, pushea y registra el evento.

- [ ] **Step 1: Escribir el test que falla**

Crear `daemon/jobs/tests/test_job_sismat.py`:

```python
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_sismat


class TestMetaEsDeHoy(unittest.TestCase):
    def test_meta_con_fecha_de_hoy(self):
        meta = {"descargado": "2026-06-12", "tareas": 472, "materiales": 1384}
        self.assertTrue(job_sismat.meta_es_de_hoy(meta, date(2026, 6, 12)))

    def test_meta_vieja_no_pasa(self):
        meta = {"descargado": "2026-05-02"}
        self.assertFalse(job_sismat.meta_es_de_hoy(meta, date(2026, 6, 12)))

    def test_meta_sin_fecha_no_pasa(self):
        self.assertFalse(job_sismat.meta_es_de_hoy({}, date(2026, 6, 12)))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `ModuleNotFoundError: No module named 'job_sismat'`.

- [ ] **Step 3: Implementar job_sismat.py**

Crear `daemon/jobs/job_sismat.py`:

```python
#!/usr/bin/env python3
"""Job mensual: sincroniza la base SISMAT al vault corriendo el sync.py existente.

SISMAT actualiza precios los primeros días del mes → el runner lo dispara
a partir del día 2. La verificación es que meta.json quede con fecha de hoy.
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, push_vault, registrar_evento

SISMAT_DIR = Path(VAULT) / "Conocimiento" / "Precios" / "sismat"
PYTHON = sys.executable  # el mismo 3.13 del framework (tiene certifi)


def meta_es_de_hoy(meta, hoy):
    return meta.get("descargado") == hoy.isoformat()


def correr(cfg, token):
    r = subprocess.run(
        [PYTHON, str(SISMAT_DIR / "sync.py")],
        capture_output=True, text=True, timeout=300,
    )
    if r.returncode != 0:
        raise RuntimeError(f"sync.py exit {r.returncode}: {(r.stderr or r.stdout)[:500]}")
    meta = json.loads((SISMAT_DIR / "meta.json").read_text())
    if not meta_es_de_hoy(meta, date.today()):
        raise RuntimeError(f"meta.json no quedó actualizado: descargado={meta.get('descargado')}")
    push_vault(f"daemon: SISMAT sync mensual {meta['descargado']}")
    registrar_evento(
        cfg, token, "job_sismat",
        f"SISMAT sincronizado — {meta.get('tareas')} tareas MO, {meta.get('materiales')} materiales",
        meta,
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` (28 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/job_sismat.py daemon/jobs/tests/test_job_sismat.py && git commit -m "feat(daemon): job SISMAT mensual — agenda el sync.py existente del vault

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 5: job_top30 — refresh semanal de materiales con Claude headless

**Files:**
- Create: `daemon/jobs/job_top30.py`
- Test: `daemon/jobs/tests/test_job_top30.py`

Claude Code headless lee `materiales-construccion.md` (tablas con columnas `Material | Unidad | Último precio | Fecha | Fuente | Query de actualización`), busca cada precio en internet con la query de la fila y actualiza precio/fecha/fuente. El job verifica después que al menos UNA fila de material quedó con la fecha del día en su columna Fecha (`filas_con_fecha`) — no alcanza con que la fecha aparezca en el archivo, porque `job_dolar` escribe la fecha de hoy en el mismo archivo (bloque DOLAR) y corre antes en el mismo tick. Tope 30 filas (hoy hay ~20).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `daemon/jobs/tests/test_job_top30.py`:

```python
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_top30

MD = """# Base de Precios

---

## Adhesivos y pegamentos

| Material | Unidad | Último precio | Fecha | Fuente | Query de actualización |
|---|---|---|---|---|---|
| Weber Superflex | bolsa 25kg | $24.990 | 2026-06-08 | Store409 | `query 1` |

## Pinturas

| Material | Unidad | Último precio | Fecha | Fuente | Query de actualización |
|---|---|---|---|---|---|
| Fijador Alba | 1 litro | $11.874 | 2026-06-08 | Sagitario | `query 2` |
| Látex interior | 4 litros | $19.999 | 2026-06-08 | ML | `query 3` |
"""


class TestFilasMateriales(unittest.TestCase):
    def test_cuenta_solo_filas_de_datos(self):
        filas = job_top30.filas_materiales(MD)
        self.assertEqual(len(filas), 3)
        self.assertTrue(filas[0].startswith("| Weber Superflex"))

    def test_md_sin_tablas_da_cero(self):
        self.assertEqual(job_top30.filas_materiales("# Nada\ntexto"), [])


class TestFilasConFecha(unittest.TestCase):
    def test_cuenta_filas_con_la_fecha_en_la_columna_fecha(self):
        md = MD.replace(
            "| Fijador Alba | 1 litro | $11.874 | 2026-06-08 | Sagitario | `query 2` |",
            "| Fijador Alba | 1 litro | $12.500 | 2026-06-12 | Sagitario | `query 2` |",
        )
        self.assertEqual(job_top30.filas_con_fecha(md, "2026-06-12"), 1)
        self.assertEqual(job_top30.filas_con_fecha(MD, "2026-06-12"), 0)

    def test_fecha_fuera_de_la_columna_no_cuenta(self):
        # job_dolar escribe la fecha de hoy en el MISMO archivo (bloque DOLAR);
        # eso NO debe contar como "fila de material actualizada".
        md = (
            "<!-- DOLAR:START -->\n**Dólar del día — 2026-06-12** (fuente: bluelytics)\n\n"
            "| Tipo | Compra | Venta |\n|---|---|---|\n"
            "| Blue | $1,400 | $1,450 |\n<!-- DOLAR:END -->\n" + MD
        )
        self.assertEqual(job_top30.filas_con_fecha(md, "2026-06-12"), 0)


class TestPrompt(unittest.TestCase):
    def test_prompt_contiene_fecha_ruta_y_reglas(self):
        p = job_top30.armar_prompt("2026-06-12", "/ruta/al/archivo.md", 3)
        self.assertIn("2026-06-12", p)
        self.assertIn("/ruta/al/archivo.md", p)
        self.assertIn("3 filas", p)
        self.assertIn("nunca inventes", p)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `ModuleNotFoundError: No module named 'job_top30'`.

- [ ] **Step 3: Implementar job_top30.py**

Crear `daemon/jobs/job_top30.py`:

```python
#!/usr/bin/env python3
"""Job semanal: refresca los precios de materiales-construccion.md con Claude headless.

La IA busca precios en internet (WebSearch) usando la "Query de actualización"
de cada fila. El código verifica después que la columna Fecha de las filas de
materiales quedó con la fecha del día (la fecha en el bloque DOLAR no cuenta).
"""
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, correr_claude, push_vault, registrar_evento

MD_PRECIOS = Path(VAULT) / "Conocimiento" / "Precios" / "materiales-construccion.md"
MAX_FILAS = 30
TIMEOUT = 1500  # 25 min — busca ~20-30 precios


def filas_materiales(md):
    """Filas de datos de las tablas (excluye encabezados y separadores)."""
    filas = []
    for linea in md.splitlines():
        l = linea.strip()
        if l.startswith("|") and not l.startswith("|--") and not l.startswith("| Material"):
            filas.append(l)
    return filas


def filas_con_fecha(md, fecha):
    """Cuántas filas de datos tienen `fecha` en su columna Fecha (4ª celda).

    Es la verificación post-Claude: job_dolar escribe la fecha de hoy en el MISMO
    archivo (bloque <!-- DOLAR -->), así que buscar la fecha en el texto entero
    daría falso OK. Acá solo cuenta la celda Fecha de cada fila de material.
    """
    n = 0
    for fila in filas_materiales(md):
        celdas = [c.strip() for c in fila.split("|")]
        # fila = "| Material | Unidad | Último precio | Fecha | Fuente | Query |"
        # split("|") → ["", Material, Unidad, Último precio, Fecha, Fuente, Query, ""]
        if len(celdas) > 4 and celdas[4] == fecha:
            n += 1
    return n


def armar_prompt(fecha, ruta_md, n_filas):
    return f"""Sos el actualizador semanal de precios de materiales de Ravn, corriendo headless en la Mac de Ezequiel.

ARCHIVO A ACTUALIZAR: {ruta_md}
(tiene {n_filas} filas de materiales; máximo a procesar: {MAX_FILAS})

1. Leé el archivo. Cada tabla tiene columnas: Material | Unidad | Último precio | Fecha | Fuente | Query de actualización.
2. Para CADA fila, buscá el precio actual en internet (WebSearch) usando la "Query de actualización" de esa fila. Anotá el precio más representativo (no el más barato ni el más caro); si hay mucha dispersión, registrá el rango.
3. Editá la fila actualizando SOLO: "Último precio", "Fecha" (poné {fecha}) y "Fuente" (link o sitio real de donde salió). NO toques Material, Unidad ni Query de actualización. NO agregues ni borres filas ni secciones. NO toques el bloque <!-- DOLAR:START --> ... <!-- DOLAR:END -->.
4. Si para una fila no encontrás precio confiable, dejala EXACTAMENTE como está (precio y fecha viejos) — nunca inventes un valor.
5. Al final respondé SOLO con una línea de resumen: "actualizadas X de {n_filas} filas" y, si quedaron sin actualizar, cuáles.
"""


def correr(cfg, token):
    fecha = date.today().isoformat()
    md_antes = MD_PRECIOS.read_text()
    n = len(filas_materiales(md_antes))
    if n == 0:
        raise RuntimeError(f"no encontré filas de materiales en {MD_PRECIOS}")
    resumen = correr_claude(armar_prompt(fecha, str(MD_PRECIOS), n), timeout=TIMEOUT)
    md_despues = MD_PRECIOS.read_text()
    actualizadas = filas_con_fecha(md_despues, fecha)
    if actualizadas == 0:
        # OJO: no buscar `fecha in md_despues` — el bloque DOLAR (job_dolar, mismo
        # archivo, corre antes en el mismo tick) ya tiene la fecha de hoy y daría
        # falso OK. Solo cuenta la columna Fecha de las filas de materiales.
        raise RuntimeError(f"ninguna fila quedó con Fecha {fecha} — Claude no actualizó nada. Resumen: {resumen[:300]}")
    push_vault(f"daemon: refresh semanal top-30 materiales {fecha}")
    registrar_evento(
        cfg, token, "job_top30",
        f"Materiales refrescados — {resumen[:120]}",
        {"fecha": fecha, "filas_totales": n, "filas_actualizadas": actualizadas, "resumen": resumen[:1000]},
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` (33 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/job_top30.py daemon/jobs/tests/test_job_top30.py && git commit -m "feat(daemon): job semanal top-30 materiales con Claude headless

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 6: job_inbox — inbox nocturno + patrones ADN con Claude headless

**Files:**
- Create: `daemon/jobs/job_inbox.py`
- Test: `daemon/jobs/tests/test_job_inbox.py`

El corazón del cerebro vivo (spec §7.1): Claude Code headless corre el flujo "procesá mi inbox" del CLAUDE.md del vault (rutea Inbox → nodos, actualiza FODA/Patrones, genera `Orientación/AAAA-MM-DD.md`). ADEMÁS (spec §7.2): el código consulta las `referencias` de la última semana en Supabase y detecta patrones por etiqueta de forma DETERMINÍSTICA (la IA solo los redacta como observación). El catch-up lo da el runner (Tarea 7): si la Mac estuvo apagada a la noche, corre al primer tick después del arranque.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `daemon/jobs/tests/test_job_inbox.py`:

```python
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import job_inbox

REFS = [
    {"tipo": "estetica", "etiquetas": ["tipografia", "serifa"], "texto": "cartel art deco", "creado_at": "2026-06-10"},
    {"tipo": "estetica", "etiquetas": ["tipografia"], "texto": "menú restaurante", "creado_at": "2026-06-09"},
    {"tipo": "estetica", "etiquetas": ["tipografia", "material"], "texto": "placa bronce", "creado_at": "2026-06-08"},
    {"tipo": "filosofia", "etiquetas": [], "texto": "la disciplina es libertad", "creado_at": "2026-06-08"},
]


class TestDetectarPatrones(unittest.TestCase):
    def test_etiqueta_repetida_3_veces_es_patron(self):
        self.assertEqual(job_inbox.detectar_patrones(REFS, umbral=3), ["tipografia: 3 capturas"])

    def test_bajo_el_umbral_no_hay_patron(self):
        self.assertEqual(job_inbox.detectar_patrones(REFS[:2], umbral=3), [])

    def test_filosofia_no_cuenta_para_etiquetas(self):
        filas = [{"tipo": "filosofia", "etiquetas": ["x"], "texto": "a", "creado_at": "1"}] * 5
        self.assertEqual(job_inbox.detectar_patrones(filas, umbral=3), [])


class TestResumenReferencias(unittest.TestCase):
    def test_formatea_una_linea_por_referencia(self):
        r = job_inbox.resumen_referencias(REFS)
        self.assertEqual(len(r.splitlines()), 4)
        self.assertIn("[estetica] cartel art deco (etiquetas: tipografia, serifa)", r)
        self.assertIn("[filosofia] la disciplina es libertad", r)

    def test_vacio_devuelve_marcador(self):
        self.assertEqual(job_inbox.resumen_referencias([]), "(sin referencias nuevas esta semana)")


class TestPrompt(unittest.TestCase):
    def test_prompt_contiene_flujo_fecha_refs_y_patrones(self):
        p = job_inbox.armar_prompt("2026-06-12", "- [estetica] cartel", ["tipografia: 3 capturas"])
        self.assertIn("procesá mi inbox", p)
        self.assertIn("/Users/ezeotero/Obsidian/RAVN/CLAUDE.md", p)
        self.assertIn("Orientación/2026-06-12.md", p)
        self.assertIn("EXACTO", p)  # refuerzo: nombre canónico sin título agregado
        self.assertIn("- [estetica] cartel", p)
        self.assertIn("tipografia: 3 capturas", p)
        self.assertIn("NO hagas git", p)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `ModuleNotFoundError: No module named 'job_inbox'`.

- [ ] **Step 3: Implementar job_inbox.py**

Crear `daemon/jobs/job_inbox.py`:

```python
#!/usr/bin/env python3
"""Job nocturno: "procesá mi inbox" con Claude Code headless + patrones ADN.

Flujo del vault CLAUDE.md (rutear Inbox, FODA, Patrones, Orientación) + detección
determinística de patrones en las referencias de la semana (spec §7.2). El código
verifica que la Orientación del día exista, pushea el vault y registra el evento.
"""
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import VAULT, correr_claude, log, push_vault, registrar_evento, rest

TIMEOUT = 1800  # 30 min: lee el vault entero y rutea


def detectar_patrones(filas, umbral=3):
    """Etiquetas de referencias ESTÉTICAS repetidas >= umbral en la semana."""
    conteo = {}
    for f in filas:
        if f.get("tipo") != "estetica":
            continue
        for e in f.get("etiquetas") or []:
            conteo[e] = conteo.get(e, 0) + 1
    return [f"{e}: {n} capturas" for e, n in sorted(conteo.items(), key=lambda x: (-x[1], x[0])) if n >= umbral]


def resumen_referencias(filas):
    if not filas:
        return "(sin referencias nuevas esta semana)"
    lineas = []
    for f in filas[:30]:
        etiquetas = ", ".join(f.get("etiquetas") or [])
        texto = (f.get("texto") or "(sin texto)")[:120]
        sufijo = f" (etiquetas: {etiquetas})" if etiquetas else ""
        lineas.append(f"- [{f.get('tipo')}] {texto}{sufijo}")
    return "\n".join(lineas)


def armar_prompt(fecha, refs, patrones):
    if patrones:
        bloque_patrones = (
            "PATRONES ADN DETECTADOS POR CÓDIGO (incluilos como observación en la sección "
            "'Patrones detectados esta sesión' de la Orientación — son señal para Ravn/Posicionamiento.md):\n"
            + "\n".join(f"- {p}" for p in patrones)
        )
    else:
        bloque_patrones = "(sin patrón ADN nuevo esta semana — no inventes uno)"
    return f"""Sos el segundo cerebro de Ezequiel corriendo headless en su Mac (job nocturno del Centro de Mando).

INSTRUCCIONES MAESTRAS: leé /Users/ezeotero/Obsidian/RAVN/CLAUDE.md y ejecutá el comando "procesá mi inbox" siguiendo su flujo EXACTO:
1. Leé el contexto completo (Yo/, FODA/, Ravn/, última Orientación/).
2. Procesá cada entrada nueva de Inbox/ (ruteo a nodos, links [[]]).
3. Actualizá los archivos de FODA/ si corresponde.
4. Detectá patrones en todo el vault.
5. Generá /Users/ezeotero/Obsidian/RAVN/Orientación/{fecha}.md con el formato exacto que define ese CLAUDE.md. OJO: el nombre del archivo es EXACTO — "{fecha}.md", sin título agregado. Vas a ver Orientaciones viejas llamadas "AAAA-MM-DD - Título.md": NO copies esa convención, el nombre canónico es solo la fecha.

ADN DE RAVN — referencias capturadas esta semana por el bot (vienen de la base, NO del vault):
{refs}

{bloque_patrones}

REGLAS:
- Si el Inbox no tiene entradas nuevas, igual generá la Orientación del día anotando "0 entradas procesadas" (las secciones de patrones y siguiente paso siguen valiendo).
- NO hagas git (ni add ni commit ni push): el commit del vault lo hace el job después de tu corrida.
- No toques nada fuera del vault.
- Tu última línea de respuesta: un resumen de UNA línea (entradas procesadas, cambios FODA, si hubo observación ADN)."""


def referencias_semana(cfg, token):
    corte = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00")
    try:
        filas = rest(cfg, token, f"referencias?select=tipo,etiquetas,texto,creado_at&creado_at=gte.{corte}&order=creado_at.desc")
        return filas or []
    except Exception as e:  # tabla aún no creada (Frente A sin correr) → degradar
        log(f"referencias no disponibles, sigo sin ADN: {e}")
        return []


def correr(cfg, token):
    fecha = date.today().isoformat()
    filas = referencias_semana(cfg, token)
    patrones = detectar_patrones(filas)
    resumen = correr_claude(armar_prompt(fecha, resumen_referencias(filas), patrones), timeout=TIMEOUT)
    # Gate tolerante: el nombre canónico es {fecha}.md (el prompt lo exige EXACTO),
    # pero las Orientaciones históricas se llaman "AAAA-MM-DD - Título.md" y un
    # Claude que copie esa convención NO debe quemar los 3 reintentos del día.
    dir_orientacion = Path(VAULT) / "Orientación"
    candidatas = sorted(dir_orientacion.glob(f"{fecha}*.md"))
    if not candidatas:
        raise RuntimeError(f"no se generó la Orientación de {fecha} en {dir_orientacion} — resumen de claude: {resumen[:300]}")
    push_vault(f"daemon: inbox nocturno {fecha}")
    registrar_evento(
        cfg, token, "job_inbox",
        f"Inbox procesado — {resumen.strip().splitlines()[-1][:150] if resumen.strip() else fecha}",
        {"fecha": fecha, "orientacion": candidatas[0].name, "referencias_semana": len(filas),
         "patrones_adn": patrones, "resumen": resumen[:1000]},
    )
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` (39 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/job_inbox.py daemon/jobs/tests/test_job_inbox.py && git commit -m "feat(daemon): job inbox nocturno — procesá mi inbox headless + patrones ADN deterministas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 7: runner.py — orquestador con catch-up y tope de reintentos (TDD)

**Files:**
- Create: `daemon/jobs/runner.py`
- Test: `daemon/jobs/tests/test_runner.py`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `daemon/jobs/tests/test_runner.py`:

```python
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import jobslib
import runner

SIEMPRE = lambda u, a: True
NUNCA = lambda u, a: False


class TestJobsVencidos(unittest.TestCase):
    def test_devuelve_los_vencidos_en_orden(self):
        jobs = [("a", None, SIEMPRE), ("b", None, NUNCA), ("c", None, SIEMPRE)]
        self.assertEqual(runner.jobs_vencidos({}, datetime(2026, 6, 12, 9, 0), jobs), ["a", "c"])

    def test_respeta_ultima_ok_del_estado(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        estado = {"a": {"ultima_ok": "2026-06-12T08:00:00"}}
        jobs = [("a", None, lambda u, a: u is None)]
        self.assertEqual(runner.jobs_vencidos(estado, ahora, jobs), [])

    def test_tope_de_errores_diarios_excluye(self):
        ahora = datetime(2026, 6, 12, 9, 0)
        estado = {"a": {"fecha_error": "2026-06-12", "errores": 3}}
        jobs = [("a", None, SIEMPRE)]
        self.assertEqual(runner.jobs_vencidos(estado, ahora, jobs), [])


class TestCorrerVencidos(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.state = Path(self.tmp.name) / "state.json"
        self.eventos = []
        runner.registrar_evento = lambda cfg, token, tipo, titulo, contenido, estado="procesado": \
            self.eventos.append((tipo, estado))

    def tearDown(self):
        self.tmp.cleanup()

    def test_corre_y_marca_ok(self):
        corridos = []
        jobs = [("a", lambda cfg, token: corridos.append("a"), SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        self.assertEqual(corridos, ["a"])
        estado = jobslib.cargar_estado(self.state)
        self.assertIsNotNone(jobslib.ultima_ok(estado, "a"))

    def test_error_marca_error_y_registra_evento_archivado(self):
        def explota(cfg, token):
            raise RuntimeError("se rompió")
        jobs = [("a", explota, SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        estado = jobslib.cargar_estado(self.state)
        self.assertIsNone(jobslib.ultima_ok(estado, "a"))
        self.assertEqual(jobslib.errores_hoy(estado, "a", datetime(2026, 6, 12, 9, 0)), 1)
        self.assertEqual(self.eventos, [("job_a", "archivado")])

    def test_un_error_no_frena_a_los_demas(self):
        corridos = []
        def explota(cfg, token):
            raise RuntimeError("x")
        jobs = [("a", explota, SIEMPRE), ("b", lambda cfg, token: corridos.append("b"), SIEMPRE)]
        runner.correr_vencidos({}, "tok", datetime(2026, 6, 12, 9, 0), jobs, self.state)
        self.assertEqual(corridos, ["b"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `ModuleNotFoundError: No module named 'runner'`.

- [ ] **Step 3: Implementar runner.py**

Crear `daemon/jobs/runner.py`:

```python
#!/usr/bin/env python3
"""Runner de los jobs programados de Ravn (com.ravn.jobs, cada 30 min).

Catch-up: los vencimientos comparan PERÍODOS (día/semana ISO/mes), no horarios
exactos — si la Mac estuvo apagada, el primer tick después del arranque corre
todo lo vencido. Reintentos: un job que falla no marca ultima_ok (el próximo
tick lo reintenta), con tope de 3 errores por día.
"""
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from jobslib import (DIR_JOBS, LOCK, STATE, cargar_cfg, cargar_estado, errores_hoy,
                     log, marcar_error, marcar_ok, registrar_evento, supabase_auth,
                     ultima_ok, vencio_diario, vencio_mensual, vencio_semanal)
import job_dolar
import job_inbox
import job_sismat
import job_top30

MAX_ERRORES_DIA = 3
# Peor caso real de UN tick que corre todo lo vencido: inbox (1800s) + top30 (1500s)
# + sismat (300s) + dolar ≈ 62 min. 90 min deja margen antes de declarar muerta
# una corrida viva (un lock "vivo" robado = doble Claude headless + doble push).
LOCK_VIEJO = 5400

JOBS = [
    ("dolar",  job_dolar.correr,  lambda u, a: vencio_diario(u, a, hora_minima=8)),
    ("sismat", job_sismat.correr, lambda u, a: vencio_mensual(u, a, dia_minimo=2, hora_minima=8)),
    ("top30",  job_top30.correr,  lambda u, a: vencio_semanal(u, a, hora_minima=8)),
    ("inbox",  job_inbox.correr,  lambda u, a: vencio_diario(u, a, hora_minima=2)),
]


def jobs_vencidos(estado, ahora, jobs=JOBS):
    out = []
    for nombre, _, vencio in jobs:
        if errores_hoy(estado, nombre, ahora) >= MAX_ERRORES_DIA:
            continue
        if vencio(ultima_ok(estado, nombre), ahora):
            out.append(nombre)
    return out


def correr_vencidos(cfg, token, ahora, jobs=JOBS, state_path=STATE):
    estado = cargar_estado(state_path)
    pendientes = jobs_vencidos(estado, ahora, jobs)
    por_nombre = {n: fn for n, fn, _ in jobs}
    for nombre in pendientes:
        log(f"corriendo job {nombre}…")
        try:
            por_nombre[nombre](cfg, token)
            marcar_ok(state_path, nombre, datetime.now())
            log(f"job {nombre} OK")
        except Exception as e:
            marcar_error(state_path, nombre, datetime.now())
            log(f"job {nombre} ERROR: {e}")
            try:
                registrar_evento(cfg, token, f"job_{nombre}",
                                 f"ERROR job {nombre}: {str(e)[:150]}",
                                 {"error": str(e)[:1000]}, estado="archivado")
            except Exception as e2:
                log(f"no pude registrar el evento de error: {e2}")
    return pendientes


def main():
    DIR_JOBS.mkdir(exist_ok=True)
    (DIR_JOBS / "logs").mkdir(exist_ok=True)
    if LOCK.exists() and (datetime.now().timestamp() - LOCK.stat().st_mtime) > LOCK_VIEJO:
        LOCK.unlink(missing_ok=True)
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
    except FileExistsError:
        return
    try:
        cfg = cargar_cfg()
        token = supabase_auth(cfg)
        if not correr_vencidos(cfg, token, datetime.now()):
            log("sin jobs vencidos")
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
```

Expected: `OK` (45 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/runner.py daemon/jobs/tests/test_runner.py && git commit -m "feat(daemon): runner de jobs con catch-up por períodos y tope de reintentos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 8: wrapper + plist `com.ravn.jobs` + install.sh (sin bootstrapear todavía)

**Files:**
- Create: `daemon/jobs/run-jobs.sh`
- Create: `daemon/launchd/com.ravn.jobs.plist`
- Create: `daemon/install.sh`

Copia el patrón de `com.ravn.cotizador.plist` (el que SÍ funciona). El wrapper vive en `~/.ravn-jobs/` (path sin espacios, fuera de iCloud) — la lección del `com.ravn.tudia` roto. **En esta tarea NO se carga en launchd**: la primera corrida es controlada (Tarea 9), para no quemar cuota sin aviso.

- [ ] **Step 1: Crear el wrapper `daemon/jobs/run-jobs.sh`**

```zsh
#!/bin/zsh
# Wrapper de com.ravn.jobs — paths absolutos SIN espacios (lección de com.ravn.tudia,
# que moría con exit 127 por exec a un script dentro de iCloud).
export PATH="/Users/ezeotero/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export HOME="/Users/ezeotero"
exec /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  "/Users/ezeotero/Documents/ravn/daemon/jobs/runner.py" \
  >> "/Users/ezeotero/.ravn-jobs/logs/runner.log" 2>&1
```

- [ ] **Step 2: Crear el plist `daemon/launchd/com.ravn.jobs.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ravn.jobs</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>/Users/ezeotero/.ravn-jobs/run-jobs.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/ezeotero/.ravn-jobs/logs/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/ezeotero/.ravn-jobs/logs/launchd.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/Users/ezeotero/.local/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/ezeotero</string>
    </dict>
</dict>
</plist>
```

- [ ] **Step 3: Crear `daemon/install.sh`**

```zsh
#!/bin/zsh
# Instala (o reinstala) com.ravn.jobs: wrapper en ~/.ravn-jobs + plist + bootstrap.
set -euo pipefail
mkdir -p /Users/ezeotero/.ravn-jobs/logs
cp /Users/ezeotero/Documents/ravn/daemon/jobs/run-jobs.sh /Users/ezeotero/.ravn-jobs/run-jobs.sh
chmod +x /Users/ezeotero/.ravn-jobs/run-jobs.sh
cp /Users/ezeotero/Documents/ravn/daemon/launchd/com.ravn.jobs.plist /Users/ezeotero/Library/LaunchAgents/com.ravn.jobs.plist
launchctl bootout "gui/$(id -u)/com.ravn.jobs" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" /Users/ezeotero/Library/LaunchAgents/com.ravn.jobs.plist
launchctl list | grep com.ravn.jobs
echo "OK com.ravn.jobs instalado"
```

- [ ] **Step 4: Verificar sintaxis y permisos**

```bash
zsh -n /Users/ezeotero/Documents/ravn/daemon/jobs/run-jobs.sh && \
zsh -n /Users/ezeotero/Documents/ravn/daemon/install.sh && \
plutil -lint /Users/ezeotero/Documents/ravn/daemon/launchd/com.ravn.jobs.plist && \
chmod +x /Users/ezeotero/Documents/ravn/daemon/jobs/run-jobs.sh /Users/ezeotero/Documents/ravn/daemon/install.sh && echo OK
```

Expected: `... com.ravn.jobs.plist: OK` y `OK` final.

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/jobs/run-jobs.sh daemon/launchd/com.ravn.jobs.plist daemon/install.sh && git commit -m "feat(daemon): wrapper + plist com.ravn.jobs + install.sh (patrón com.ravn.cotizador)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 9: Primera corrida en vivo + carga en launchd

**Files:** ninguno nuevo (verificación operativa; escribe `~/.ravn-jobs/state.json` y el vault).

⚠️ **AVISO DE GASTO obligatorio antes de empezar:** esta tarea corre `inbox` y `top30` con Claude headless UNA vez cada uno (suscripción). Avisarle a Eze y esperar su OK antes del Step 2.

- [ ] **Step 1: Corrida aislada del job sin IA (dolar)**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -c "
import sys; sys.path.insert(0, '/Users/ezeotero/Documents/ravn/daemon/jobs')
from jobslib import cargar_cfg, supabase_auth
import job_dolar
cfg = cargar_cfg(); token = supabase_auth(cfg)
job_dolar.correr(cfg, token)
print('dolar OK')
"
cat /Users/ezeotero/Obsidian/RAVN/Conocimiento/Precios/dolar.json
```

Expected: `dolar OK` y un JSON con `fecha` de hoy, `oficial`, `blue` y `fuente`. Verificar también que `materiales-construccion.md` tiene el bloque `<!-- DOLAR:START -->` y que el push del vault no falló (`git --git-dir /Users/ezeotero/.ravn-vault-git --work-tree /Users/ezeotero/Obsidian/RAVN log origin/main --oneline -1` muestra el commit `daemon: dólar diario`).

- [ ] **Step 2: Corrida completa del runner (CON OK de Eze — corre inbox y top30 de verdad)**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 /Users/ezeotero/Documents/ravn/daemon/jobs/runner.py
```

Expected (en stdout, puede tardar 30-50 min por inbox + top30): líneas `corriendo job …` y `job … OK` para cada vencido. `dolar` corre DE NUEVO acá: el Step 1 lo ejecutó directo, sin pasar por el runner, así que no marcó `ultima_ok` en `state.json` — es idempotente (reescribe `dolar.json` y el bloque del día, no duplica nada), no es un error. `sismat` solo corre si hoy es día ≥ 2 y no corrió este mes.

- [ ] **Step 3: Verificar los eventos en la base (el gate de los jobs)**

```bash
cd /Users/ezeotero/Documents/ravn/daemon/jobs
for t in job_dolar job_inbox job_top30; do
  /Library/Frameworks/Python.framework/Versions/3.13/bin/python3 chequear_evento.py "$t"
done
```

Expected: tres líneas `OK — último evento job_…` con fecha de hoy. Si `job_sismat` no corrió por calendario, no es error.

- [ ] **Step 4: Verificar la Orientación generada**

```bash
ls -la /Users/ezeotero/Obsidian/RAVN/Orientación/$(date +%Y-%m-%d)*.md
head -20 /Users/ezeotero/Obsidian/RAVN/Orientación/$(date +%Y-%m-%d)*.md
```

Expected: existe UN archivo que arranca con la fecha de hoy (canónico: `YYYY-MM-DD.md` a secas; el gate del job acepta también `YYYY-MM-DD - Título.md` por si Claude copió la convención vieja del vault) y arranca con `# Orientación — …` con las secciones del formato del vault. **Mostrarle el archivo a Eze** (regla de sparring: no cerrar la verificación en silencio).

- [ ] **Step 5: Instalar en launchd**

```bash
/Users/ezeotero/Documents/ravn/daemon/install.sh
```

Expected: línea de `launchctl list` con `com.ravn.jobs` y `OK com.ravn.jobs instalado`. El `RunAtLoad` dispara el runner al toque, pero como todo marcó `ultima_ok` hoy, loguea `sin jobs vencidos` (verificarlo en `~/.ravn-jobs/logs/runner.log`).

- [ ] **Step 6: Verificación final del tick**

```bash
sleep 60 && tail -5 /Users/ezeotero/.ravn-jobs/logs/runner.log && cat /Users/ezeotero/.ravn-jobs/state.json
```

Expected: `sin jobs vencidos` en el log; `state.json` con `ultima_ok` de hoy para los jobs corridos. No hay commit (tarea operativa).

---

### Tarea 10: Migración `sistema_estado` (el latido canónico)

**Files:**
- Create: `supabase/migrations/20260614100000_sistema_estado.sql`

Contrato del frente: singleton `id int pk default 1 check(id=1)`, `ultimo_latido timestamptz`, `daemon_version text`, `actualizado_at`. Usa `set_actualizado_at()` de la migración base del Frente A (`20260612100000`). El daemon post-D entra como DAEMON_EMAIL (daemon@ravn.local, Task 17 del plan D) con fallback al usuario bot — las policies de sistema_estado son `to authenticated` y cubren a ambos (no es dato sensible: solo un timestamp).

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- sistema_estado: latido del daemon de la Mac (Frente E, Centro de Mando).
-- Reemplaza la fila estado='latido' de cotizaciones_cola (que se dropea en
-- 20260614110000 una vez migrados daemon y bot). Singleton id=1.
-- El daemon (usuario bot) upsertea cada ~45s; el bot lee ultimo_latido para
-- saber si la Mac está prendida (macViva).

create table if not exists public.sistema_estado (
  id int primary key default 1 check (id = 1),
  ultimo_latido timestamptz,
  daemon_version text,
  actualizado_at timestamptz not null default now()
);

insert into public.sistema_estado (id) values (1) on conflict (id) do nothing;

comment on table public.sistema_estado is
  'Singleton (id=1) con el latido del daemon Mac. ultimo_latido fresco (<3 min) = Mac viva. daemon_version para diagnosticar qué versión late.';

drop trigger if exists sistema_estado_actualizado_at on public.sistema_estado;
create trigger sistema_estado_actualizado_at
  before update on public.sistema_estado
  for each row execute function public.set_actualizado_at();

alter table public.sistema_estado enable row level security;
revoke all on public.sistema_estado from anon;

drop policy if exists "sistema_estado_select_auth" on public.sistema_estado;
create policy "sistema_estado_select_auth" on public.sistema_estado
  for select to authenticated using (true);

drop policy if exists "sistema_estado_insert_auth" on public.sistema_estado;
create policy "sistema_estado_insert_auth" on public.sistema_estado
  for insert to authenticated with check (true);

drop policy if exists "sistema_estado_update_auth" on public.sistema_estado;
create policy "sistema_estado_update_auth" on public.sistema_estado
  for update to authenticated using (true) with check (true);
```

- [ ] **Step 2: Verificar el archivo**

Run: `grep -c "create policy" /Users/ezeotero/Documents/ravn/supabase/migrations/20260614100000_sistema_estado.sql`
Expected: `3`

- [ ] **Step 3: Aplicar a producción**

```bash
cd /Users/ezeotero/Documents/ravn
supabase db push --dry-run
```

Expected: lista `20260614100000_sistema_estado.sql`. Si lista TAMBIÉN migraciones de otros frentes (`20260612200000` de D o `20260613100000` de B), significa que esos frentes commitearon pero no pushearon: FRENAR y coordinar antes de aplicar (no aplicar migraciones ajenas por accidente).

```bash
supabase db push
```

Expected: `Applying migration 20260614100000_sistema_estado.sql... Finished supabase db push.`

- [ ] **Step 4: Verificar por REST como el bot**

```bash
ENVF=/Users/ezeotero/.ravn-cotizador/.env
SUPABASE_URL=$(grep '^SUPABASE_URL=' $ENVF | cut -d= -f2-)
ANON=$(grep '^SUPABASE_ANON_KEY=' $ENVF | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$(grep '^BOT_EMAIL=' $ENVF | cut -d= -f2-)\",\"password\":\"$(grep '^BOT_PASSWORD=' $ENVF | cut -d= -f2-)\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "$SUPABASE_URL/rest/v1/sistema_estado?id=eq.1" -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: `[{"id":1,"ultimo_latido":null,"daemon_version":null,...}]` (el bot LEE la fila sembrada).

- [ ] **Step 5: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add supabase/migrations/20260614100000_sistema_estado.sql && git commit -m "feat(db): tabla sistema_estado — latido del daemon (singleton) + RLS

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 11: Daemon — latir doble (sistema_estado + fila vieja) durante la transición

**Files:**
- Modify: `/Users/ezeotero/.ravn-cotizador/daemon.py` (función `latir` — buscarla por NOMBRE, no por línea. FUERA de git: backup `.bak` + verificación manual, mismo patrón que el Frente D usa con este archivo)

⚠️ **ORDEN OBLIGATORIO — esta tarea se ejecuta DESPUÉS del Frente D.** La Task 18 del plan D (`2026-06-11-frente-d-cotizador-2.md`) REEMPLAZA `daemon.py` COMPLETO (constante `TABLA_LEGACY`, cola nueva `trabajos_cola` + camino legacy). Si esta tarea corriera ANTES, el reemplazo completo de D PISARÍA el latido doble (el `latir()` de D solo escribe `cotizaciones_cola`, sin `sistema_estado`) — y si la Tarea 12 ya se mergeó, `macViva` vería la Mac muerta para siempre. Los bloques antes/después de esta tarea están escritos contra el daemon POST-D.

- [ ] **Step 1: GATE de orden — verificar que el daemon ya es el del Frente D**

```bash
grep -n "TABLA_LEGACY" /Users/ezeotero/.ravn-cotizador/daemon.py | head -2
grep -n "TABLA_TRABAJOS" /Users/ezeotero/.ravn-cotizador/daemon.py | head -2
```

Expected: ambas salidas con líneas (`TABLA_LEGACY = "cotizaciones_cola"` y `TABLA_TRABAJOS = "trabajos_cola"`). Si en cambio el archivo tiene `TABLA = "cotizaciones_cola"` (sin sufijo) y nada de `trabajos_cola`, es el daemon viejo: el Frente D NO ejecutó su Task 18 todavía → **FRENAR esta tarea** (y la 12, que depende de esta) hasta que D corra.

- [ ] **Step 2: Backup**

```bash
cp /Users/ezeotero/.ravn-cotizador/daemon.py /Users/ezeotero/.ravn-cotizador/daemon.py.bak-frente-e
```

- [ ] **Step 3: Reemplazar `latir()` y agregar la versión**

En `/Users/ezeotero/.ravn-cotizador/daemon.py` (el del Frente D), agregar debajo de la línea `CTX = ssl.create_default_context(cafile=certifi.where())`:

```python
DAEMON_VERSION = "frente-e-1"
```

y reemplazar la función `latir` completa. Hoy (post-D) es:

```python
def latir(token):
    # Fila "latido": el bot la mira para saber si la Mac está prendida.
    # SIGUE en cotizaciones_cola hasta que el Frente E la migre a sistema_estado.
    ahora = datetime.now(timezone.utc).isoformat()
    filas = rest(token, f"{TABLA_LEGACY}?estado=eq.latido&select=id&limit=1")
    if filas:
        rest(token, f"{TABLA_LEGACY}?id=eq.{filas[0]['id']}", data={"updated_at": ahora}, method="PATCH")
    else:
        rest(token, TABLA_LEGACY, data={"pedido": "[latido daemon]", "estado": "latido"}, method="POST")
```

Queda así (el `rest()` del daemon post-D ya acepta el kwarg `prefer`):

```python
def latir(token):
    ahora = datetime.now(timezone.utc).isoformat()
    # NUEVO latido canónico: singleton sistema_estado (Frente E).
    try:
        rest(
            token,
            "sistema_estado?on_conflict=id",
            data={"id": 1, "ultimo_latido": ahora, "daemon_version": DAEMON_VERSION},
            method="POST",
            prefer="resolution=merge-duplicates",
        )
    except Exception as e:
        log(f"latido sistema_estado falló: {e}")
    # VIEJO (transición): el bot deployado en Railway todavía lee cotizaciones_cola.
    # Este bloque se BORRA en la Tarea 13, después del switch del bot (Tarea 12).
    filas = rest(token, f"{TABLA_LEGACY}?estado=eq.latido&select=id&limit=1")
    if filas:
        rest(token, f"{TABLA_LEGACY}?id=eq.{filas[0]['id']}", data={"updated_at": ahora}, method="PATCH")
    else:
        rest(token, TABLA_LEGACY, data={"pedido": "[latido daemon]", "estado": "latido"}, method="POST")
```

- [ ] **Step 4: Verificar sintaxis y correr una pasada manual**

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m py_compile /Users/ezeotero/.ravn-cotizador/daemon.py && \
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 /Users/ezeotero/.ravn-cotizador/daemon.py && echo "pasada OK"
```

Expected: `pasada OK` (sin traceback; si hay un trabajo pendiente en la cola lo va a procesar — normal).

- [ ] **Step 5: Verificar el latido nuevo por REST**

Derivar credenciales y token frescos (el `access_token` de Supabase expira ~1 hora — NUNCA reusar uno de otra tarea):

```bash
ENVF=/Users/ezeotero/.ravn-cotizador/.env
SUPABASE_URL=$(grep '^SUPABASE_URL=' $ENVF | cut -d= -f2-)
ANON=$(grep '^SUPABASE_ANON_KEY=' $ENVF | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$(grep '^BOT_EMAIL=' $ENVF | cut -d= -f2-)\",\"password\":\"$(grep '^BOT_PASSWORD=' $ENVF | cut -d= -f2-)\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "$SUPABASE_URL/rest/v1/sistema_estado?id=eq.1&select=ultimo_latido,daemon_version" \
  -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: `ultimo_latido` con timestamp de hace segundos y `daemon_version: "frente-e-1"`. Repetir tras ~1 min (launchd corre el daemon cada 45s) y confirmar que `ultimo_latido` avanza solo. No hay commit (archivo fuera de git): el backup `.bak-frente-e` queda como respaldo.

---

### Tarea 12: Bot — switch de `macViva()` a `sistema_estado` (rama `frente-c-bot-2`)

**Files (repo `/Users/ezeotero/Documents/ravn-bots`, rama `frente-c-bot-2`):**
- Modify: `src/supabaseService.js` (función `macViva`, hoy lee `cotizaciones_cola` con `estado='latido'`)
- Test: `test/supabase-macviva.test.js`

Requiere el Frente C ejecutado en esa rama (harness `node:test` + fakes + `__setTestClient` existen por sus Tareas 2-3) y la Tarea 11 viva (el daemon ya late en `sistema_estado` — si no, el bot diría "Mac apagada" siempre).

- [ ] **Step 1: Pararse en la rama del bot**

```bash
cd /Users/ezeotero/Documents/ravn-bots
git checkout frente-c-bot-2
```

Expected: `Switched to branch 'frente-c-bot-2'` (o `Already on …`).

- [ ] **Step 2: Escribir los tests que fallan**

Crear `test/supabase-macviva.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const sb = require('../src/supabaseService');
const { crearFakeSupabaseClient, paso } = require('./helpers/fakes');

test('macViva lee sistema_estado id=1 y da true con latido fresco', async () => {
  const { client, llamadas } = crearFakeSupabaseClient(() => ({
    data: { ultimo_latido: new Date().toISOString() }, error: null,
  }));
  sb.__setTestClient(client);
  assert.equal(await sb.macViva(), true);
  assert.equal(llamadas[0].tabla, 'sistema_estado');
  assert.deepEqual(paso(llamadas[0], 'eq').args, ['id', 1]);
});

test('macViva false con latido viejo (>3 min)', async () => {
  const { client } = crearFakeSupabaseClient(() => ({
    data: { ultimo_latido: new Date(Date.now() - 10 * 60 * 1000).toISOString() }, error: null,
  }));
  sb.__setTestClient(client);
  assert.equal(await sb.macViva(), false);
});

test('macViva false si no hay fila, hay error o ultimo_latido es null', async () => {
  const { client } = crearFakeSupabaseClient(() => ({ data: null, error: { message: 'x' } }));
  sb.__setTestClient(client);
  assert.equal(await sb.macViva(), false);
  const { client: c2 } = crearFakeSupabaseClient(() => ({ data: { ultimo_latido: null }, error: null }));
  sb.__setTestClient(c2);
  assert.equal(await sb.macViva(), false);
});
```

- [ ] **Step 3: Correr y verificar que falla el test 1**

```bash
npm test
```

Expected: FAIL SOLO en el test 1 (`macViva lee sistema_estado id=1…`): el `macViva` actual consulta `cotizaciones_cola` (el assert de tabla falla) y con ese fake devuelve `false` (el assert de `true` también). Los tests 2 y 3 PASAN de entrada — esperan `false` y el `macViva` actual ya devuelve `false` con esos fakes (lee `data?.length` sobre un objeto → `undefined` → falsy). No es un error de TDD: el comportamiento nuevo que se especifica vive en el test 1; con ese rojo alcanza, seguir al Step 4.

- [ ] **Step 4: Reemplazar `macViva` en `src/supabaseService.js`**

Reemplazar la función `macViva` completa (hoy lee `cotizaciones_cola?estado=eq.latido`):

```js
// El daemon de la Mac upsertea sistema_estado.ultimo_latido en cada pasada (~45s).
// Mac viva = latido más fresco que 3 minutos. (Antes: fila estado='latido' en
// cotizaciones_cola — migrado por el Frente E, tabla dropeada.)
async function macViva() {
  try {
    const ok = await ensureAuth();
    if (!ok) return false;
    const { data, error } = await client()
      .from('sistema_estado')
      .select('ultimo_latido')
      .eq('id', 1)
      .limit(1)
      .single();
    if (error || !data?.ultimo_latido) return false;
    return Date.now() - new Date(data.ultimo_latido).getTime() < 3 * 60 * 1000;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Correr y verificar que pasan**

```bash
npm test
```

Expected: `# fail 0` (la suite completa del Frente C + estos 3).

- [ ] **Step 6: Commit en la rama**

```bash
git add src/supabaseService.js test/supabase-macviva.test.js
git commit -m "feat: macViva lee el latido de sistema_estado (migración Frente E)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

> **Deploy:** este cambio llega a producción cuando `frente-c-bot-2` se mergea a `main` (Railway redeploya solo). NO mergear desde este plan: el merge lo coordina el cierre del Frente C. La Tarea 13 tiene gate explícito de esto.

---

### Tarea 13: Baja de `cotizaciones_cola` — gates duros, corte del latido viejo, extirpación legacy y drop

**Files:**
- Modify: `/Users/ezeotero/.ravn-cotizador/daemon.py` (sacar el bloque viejo de `latir` Y extirpar el camino legacy completo del daemon post-D: `procesar_legacy`, `correr_claude_legacy`, `desempaquetar`, `PROMPTS`, `TABLA_LEGACY` y sus call sites)
- Create: `supabase/migrations/20260614110000_drop_cotizaciones_cola.sql`

**Regla del spec §8: nada se borra hasta que el reemplazo esté funcionando verificado.** Si CUALQUIER gate falla, FRENAR esta tarea entera (no hay drop parcial). Después del drop, el daemon NO puede conservar NINGÚN código que toque `cotizaciones_cola`: si quedara `procesar_legacy()` viva, consultaría una tabla inexistente (404) en CADA tick sin trabajos.

- [ ] **Step 1: GATE 1 — el bot en producción ya NO toca `cotizaciones_cola`**

```bash
cd /Users/ezeotero/Documents/ravn-bots
git fetch origin
git grep -n "cotizaciones_cola" origin/main -- src/ || echo "GATE 1 OK"
```

Expected: `GATE 1 OK` (cero referencias en el `main` deployado — implica que `frente-c-bot-2`, con las Tareas 4/12 de C y la 12 de este plan, ya se mergeó y Railway lo corrió).

- [ ] **Step 2: GATE 2 — el daemon ya procesa `trabajos_cola` (Frente D ejecutado + Tarea 11 viva)**

```bash
grep -n "trabajos_cola" /Users/ezeotero/.ravn-cotizador/daemon.py | head -3
grep -n "sistema_estado" /Users/ezeotero/.ravn-cotizador/daemon.py | head -2
grep -nE "cotizaciones_cola|TABLA_LEGACY" /Users/ezeotero/.ravn-cotizador/daemon.py
```

Expected contra el daemon post-D + Tarea 11:
- la primera salida tiene líneas (`TABLA_TRABAJOS = "trabajos_cola"` y la docstring) — el daemon usa la cola nueva;
- la segunda tiene líneas (el `latir()` doble de la Tarea 11 ya upsertea `sistema_estado`);
- la tercera muestra los restos legacy CONOCIDOS y nada más: la constante `TABLA_LEGACY = "cotizaciones_cola"`, las menciones en la docstring del módulo, el bloque "VIEJO (transición)" dentro de `latir()` (Tarea 11), el comentario de sección `# ── cola LEGACY (cotizaciones_cola) …` y los usos de `TABLA_LEGACY` dentro de `procesar_legacy()`. TODO eso se extirpa en los Steps 4-5 de esta tarea.

FRENAR si: no aparece `trabajos_cola` (Frente D sin ejecutar), no aparece `sistema_estado` (Tarea 11 sin ejecutar), o aparece algún uso de `cotizaciones_cola` FUERA de los restos listados (daemon distinto al esperado → revisar a mano antes de cortar nada).

- [ ] **Step 3: GATE 3 — no quedan trabajos vivos en la cola vieja**

Derivar credenciales y token frescos (el `access_token` de Supabase expira ~1 hora — NUNCA reusar uno de otra tarea):

```bash
ENVF=/Users/ezeotero/.ravn-cotizador/.env
SUPABASE_URL=$(grep '^SUPABASE_URL=' $ENVF | cut -d= -f2-)
ANON=$(grep '^SUPABASE_ANON_KEY=' $ENVF | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$(grep '^BOT_EMAIL=' $ENVF | cut -d= -f2-)\",\"password\":\"$(grep '^BOT_PASSWORD=' $ENVF | cut -d= -f2-)\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "$SUPABASE_URL/rest/v1/cotizaciones_cola?estado=in.(pendiente,procesando,esperando)&select=id,estado" \
  -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: `[]`. Si hay filas, esperar a que terminen o cancelarlas con Eze.

- [ ] **Step 4: Cortar el latido viejo en el daemon**

```bash
cp /Users/ezeotero/.ravn-cotizador/daemon.py /Users/ezeotero/.ravn-cotizador/daemon.py.bak-drop
```

En `/Users/ezeotero/.ravn-cotizador/daemon.py`, dejar `latir()` así (borrar el bloque "VIEJO (transición)" completo que dejó la Tarea 11):

```python
def latir(token):
    ahora = datetime.now(timezone.utc).isoformat()
    # Latido canónico: singleton sistema_estado (el bot lo lee en macViva).
    rest(
        token,
        "sistema_estado?on_conflict=id",
        data={"id": 1, "ultimo_latido": ahora, "daemon_version": DAEMON_VERSION},
        method="POST",
        prefer="resolution=merge-duplicates",
    )
```

- [ ] **Step 5: Extirpar el camino legacy completo del daemon post-D**

El daemon del Frente D conserva una rama entera que lee/escribe `cotizaciones_cola` ("si no había trabajos, atiende la cola vieja"). Con el drop aplicado, esa rama daría 404 en cada tick sin trabajos. Sacar TODO esto de `/Users/ezeotero/.ravn-cotizador/daemon.py`:

**(a)** En la docstring del módulo (arranca `"""Daemon del Centro de Mando — Mac de Eze…`), reemplazar la lista numerada que menciona `cotizaciones_cola` por:

```python
"""Daemon del Centro de Mando — Mac de Eze (launchd com.ravn.cotizador, ~45s).

Cada corrida:
1. late (upsert del singleton sistema_estado — el bot lo lee en macViva),
2. toma UN trabajo 'pendiente' de trabajos_cola (cotizar/redactar/consulta/orden)
   y corre Claude Code headless con la suscripción.

trabajos_cola: pendiente → procesando → esperando_datos | en_revision (cotizar)
| completado | error.  Una cotización NUNCA se emite sola: queda en_revision
para la mesa de Eze (spec §6.4).
"""
```

**(b)** Borrar la línea de la constante legacy (en el bloque de constantes, junto a `TABLA_TRABAJOS`):

```python
TABLA_LEGACY = "cotizaciones_cola"
```

**(c)** Borrar el bloque legacy ENTERO: desde la línea de comentario

```python
# ── cola LEGACY (cotizaciones_cola) — se mantiene hasta que el Frente C deploye ──
```

hasta la línea anterior a `def main():`. El bloque contiene exactamente cuatro definiciones, todas legacy-only (verificado contra el plan D): el dict `PROMPTS = {…}` (prompts WhatsApp viejos "cotizacion"/"media"/"general"), `def desempaquetar(fila):`, `def correr_claude_legacy(fila):` y `def procesar_legacy(token):`. NO tocar `PROMPTS_TRABAJO`, `reglas_para`, `correr_claude_prompt` ni `procesar_trabajo` — esos son del camino nuevo.

**(d)** En `main()`, reemplazar el call site legacy:

```python
        if not procesar_trabajo(token):
            procesar_legacy(token)
```

por:

```python
        procesar_trabajo(token)
```

**(e)** Verificar compilación y cero referencias:

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m py_compile /Users/ezeotero/.ravn-cotizador/daemon.py && echo "compila OK"
grep -nE "cotizaciones_cola|TABLA_LEGACY|procesar_legacy|correr_claude_legacy|desempaquetar" /Users/ezeotero/.ravn-cotizador/daemon.py || echo "0 referencias legacy — OK"
```

Expected: `compila OK` y `0 referencias legacy — OK` (el grep no devuelve NINGUNA línea). Si aparece algo, NO seguir al drop hasta extirparlo.

- [ ] **Step 6: Verificar que el latido nuevo sigue vivo y el bot ve la Mac**

Con `$SUPABASE_URL`, `$ANON` y `$BOT_TOKEN` del Step 3 de ESTA tarea (si pasó más de ~1 hora desde el Step 3, re-correr su bloque de auth — el token expira):

```bash
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 /Users/ezeotero/.ravn-cotizador/daemon.py
curl -s "$SUPABASE_URL/rest/v1/sistema_estado?id=eq.1&select=ultimo_latido" \
  -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: `ultimo_latido` de hace segundos. Prueba funcional con Eze: mandar al bot de WhatsApp un pedido que requiera la Mac (p. ej. "cotizame una mano de látex en un ambiente de 3x3") y confirmar que NO responde "la Mac está apagada".

- [ ] **Step 7: Crear y aplicar la migración del drop**

Crear `supabase/migrations/20260614110000_drop_cotizaciones_cola.sql`:

```sql
-- Baja final de cotizaciones_cola (spec §8 — Frente E, Tarea 13).
-- Reemplazos verificados con gates ANTES de aplicar esto:
--   latido  → sistema_estado (daemon upsertea, bot macViva lee)
--   cola    → trabajos_cola (bot inserta, daemon procesa)
--   gates   → bot main sin referencias · daemon sin referencias · cola vacía
drop table if exists public.cotizaciones_cola;
```

```bash
cd /Users/ezeotero/Documents/ravn
supabase db push --dry-run   # Expected: SOLO 20260614110000_drop_cotizaciones_cola.sql
supabase db push
# Vars de auth del Step 3 de ESTA tarea (re-correr su bloque si pasó >1h — el token expira):
curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/cotizaciones_cola?select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: `db push` aplica la migración; el curl final devuelve `404` (la tabla ya no existe).

- [ ] **Step 8: Commit**

```bash
cd /Users/ezeotero/Documents/ravn && git add supabase/migrations/20260614110000_drop_cotizaciones_cola.sql && git commit -m "feat(db): drop cotizaciones_cola — latido en sistema_estado, cola en trabajos_cola (§8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Tarea 14: Baja de `com.ravn.tudia` (y su satélite `com.ravn.dia-whatsapp`)

**Files:** ninguno en repos — se archivan: `~/Library/LaunchAgents/com.ravn.tudia.plist`, `~/Library/LaunchAgents/com.ravn.dia-whatsapp.plist`, `~/ravn-morning.sh`, `~/.ravn-cotizador/enviar_dia.py` → `vault Sistema/_archivo-2026-06/`.

Contexto: `com.ravn.tudia` está ROTO desde 2026-06-07 (`launchctl list` lo muestra con exit 127: su wrapper hace `exec` a un script dentro de iCloud). Su reemplazo es el job nocturno (Tareas 6-9). `com.ravn.dia-whatsapp` (7:10am) manda por WhatsApp el `dia.json` que generaba tudia — sin tudia queda mandando datos viejos, así que cae junto con él. **No está en la tabla §8 del spec: confirmar con Eze antes del Step 3** (si quiere conservar un resumen mañanero, se reimplementa después leyendo el Centro de Mando — anotado en dudas).

- [ ] **Step 1: GATE — el reemplazo funciona**

```bash
cd /Users/ezeotero/Documents/ravn/daemon/jobs
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 chequear_evento.py job_inbox
launchctl list | grep com.ravn.jobs
ls "/Users/ezeotero/Obsidian/RAVN/Orientación/" | tail -2
```

Expected: `OK — último evento job_inbox: …` con fecha de hoy o ayer; `com.ravn.jobs` cargado; una Orientación fresca. Si algo falla → FRENAR.

- [ ] **Step 2: Crear el archivo de archivo del frente**

```bash
mkdir -p "/Users/ezeotero/Obsidian/RAVN/Sistema/_archivo-2026-06/launchd"
```

- [ ] **Step 3: Bootout + archivar (CON OK de Eze por dia-whatsapp)**

```bash
launchctl bootout "gui/$(id -u)/com.ravn.tudia" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.ravn.dia-whatsapp" 2>/dev/null || true
mv /Users/ezeotero/Library/LaunchAgents/com.ravn.tudia.plist "/Users/ezeotero/Obsidian/RAVN/Sistema/_archivo-2026-06/launchd/"
mv /Users/ezeotero/Library/LaunchAgents/com.ravn.dia-whatsapp.plist "/Users/ezeotero/Obsidian/RAVN/Sistema/_archivo-2026-06/launchd/"
mv /Users/ezeotero/ravn-morning.sh "/Users/ezeotero/Obsidian/RAVN/Sistema/_archivo-2026-06/"
mv /Users/ezeotero/.ravn-cotizador/enviar_dia.py "/Users/ezeotero/Obsidian/RAVN/Sistema/_archivo-2026-06/"
```

- [ ] **Step 4: Verificar la baja**

```bash
launchctl list | grep -E "com.ravn.(tudia|dia-whatsapp)" || echo "BAJA OK"
ls "/Users/ezeotero/Obsidian/RAVN/Sistema/_archivo-2026-06/launchd/"
```

Expected: `BAJA OK` y los dos plists listados en el archivo.

- [ ] **Step 5: Commit del vault**

```bash
GIT="git --git-dir /Users/ezeotero/.ravn-vault-git --work-tree /Users/ezeotero/Obsidian/RAVN"
eval $GIT add -A && eval $GIT commit -m "baja §8: com.ravn.tudia + dia-whatsapp archivados (reemplazo: job nocturno com.ravn.jobs)" && eval $GIT push origin main
```

Expected: commit y push sin error.

---

### Tarea 15: Baja de los servers locales 4317/4319 + archivo de `Sistema/panel/` y `oficina*`

**Files (todo dentro del vault, se MUEVE no se borra):**
- `Sistema/panel/` (entera: `panel.html`, `app.html`, `panel-server.py`, `build_panel.py`, `apply_dia.py`, `apply_news.py`, `morning.sh`, jsons y logs) → `Sistema/_archivo-2026-06/panel/`
- `Sistema/oficina.html`, `oficina-server.py`, `oficina-activity.json`, `oficina-log.py`, `Oficina.md` → `Sistema/_archivo-2026-06/`

Reemplazos (§8): panel/app → Home cockpit (Frente B); oficina 4317 → feed Actividad sobre `eventos`.

- [ ] **Step 1: GATE — el Centro de Mando reemplaza a los dos**

Derivar credenciales y token frescos (el `access_token` de Supabase expira ~1 hora — NUNCA reusar uno de otra tarea):

```bash
ENVF=/Users/ezeotero/.ravn-cotizador/.env
SUPABASE_URL=$(grep '^SUPABASE_URL=' $ENVF | cut -d= -f2-)
ANON=$(grep '^SUPABASE_ANON_KEY=' $ENVF | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$(grep '^BOT_EMAIL=' $ENVF | cut -d= -f2-)\",\"password\":\"$(grep '^BOT_PASSWORD=' $ENVF | cut -d= -f2-)\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
# Hay eventos reales para el feed Actividad:
curl -s "$SUPABASE_URL/rest/v1/eventos?select=id,origen,titulo&order=creado_at.desc&limit=3" \
  -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: 3 filas JSON (del bot/daemon). Después, verificación manual CON Eze en la URL de producción del proyecto Vercel `ravn-app-one`: el home cockpit carga, el módulo **Actividad** muestra estos eventos y el módulo **Pendientes** lista tareas. Sin su OK explícito → FRENAR (regla §8).

- [ ] **Step 2: Matar los servers SOLO por puerto (gotcha: jamás pkill)**

```bash
lsof -ti:4317 | xargs kill 2>/dev/null; lsof -ti:4319 | xargs kill 2>/dev/null
sleep 1; lsof -nP -iTCP:4317 -iTCP:4319 -sTCP:LISTEN || echo "PUERTOS LIBRES"
```

Expected: `PUERTOS LIBRES`. (El 4318 — selector de color — NO se toca.)

- [ ] **Step 3: Archivar los archivos**

```bash
SYS="/Users/ezeotero/Obsidian/RAVN/Sistema"
mkdir -p "$SYS/_archivo-2026-06"   # lo crea la Tarea 14, pero esa puede haberse frenado por su gate
mv "$SYS/panel" "$SYS/_archivo-2026-06/panel"
mv "$SYS/oficina.html" "$SYS/oficina-server.py" "$SYS/oficina-activity.json" "$SYS/oficina-log.py" "$SYS/Oficina.md" "$SYS/_archivo-2026-06/"
ls "$SYS" | grep -iE "panel|oficina" || echo "SISTEMA LIMPIO"
```

Expected: `SISTEMA LIMPIO`.

- [ ] **Step 4: Verificar que nada los extraña**

```bash
launchctl list | grep -i ravn
grep -rn "4317\|4319\|oficina-server\|panel-server" /Users/ezeotero/Documents/ravn/daemon/ 2>/dev/null || echo "SIN REFERENCIAS"
```

Expected: solo `com.ravn.cotizador`, `com.ravn.jobs` (y `com.ravn.reminders-bridge`, ver dudas) en launchd; `SIN REFERENCIAS` en el código nuevo.

- [ ] **Step 5: Commit del vault**

```bash
GIT="git --git-dir /Users/ezeotero/.ravn-vault-git --work-tree /Users/ezeotero/Obsidian/RAVN"
eval $GIT add -A && eval $GIT commit -m "baja §8: panel 4319 + oficina 4317 archivados (reemplazo: Centro de Mando)" && eval $GIT push origin main
```

Expected: commit y push sin error.

---

### Tarea 16: Baja del proyecto `ravn-tu-dia` (Vercel + repo local)

**Files:** ninguno en repos — `~/Documents/ravn-tu-dia` se archiva en `~/Documents/_archivo-2026-06/`.

Datos verificados: el proyecto Vercel es `ravn-tu-dia` (projectId `prj_o3alROxePlcVoqRXvngQewbEQrRJ`, org `team_MCgMBHHZZZqLzJoSL9jcCvEc`, según `.vercel/project.json`). El repo local NO tiene remoto git (no hay nada que archivar en GitHub). La tabla `tareas` que creó este proyecto ya quedó versionada en el repo del Centro de Mando (Frente A, `20260612102000_tareas.sql`) — los datos viven en Supabase y no se tocan.

- [ ] **Step 1: GATE — el Centro de Mando reemplaza al tablero**

```bash
ls /Users/ezeotero/Documents/ravn/supabase/migrations/ | grep tareas
```

Expected: `20260612102000_tareas.sql`. Después, verificación manual CON Eze: en el Centro de Mando deployado, crear una tarea desde el módulo Pendientes, marcarla hecha y borrarla (CRUD completo). Sin su OK → FRENAR.

- [ ] **Step 2: Eliminar el proyecto de Vercel (dos caminos, documentados ambos)**

Camino A — CLI:

```bash
cd /Users/ezeotero/Documents/ravn-tu-dia
npx vercel project rm ravn-tu-dia
```

Expected: pide confirmación escribiendo `ravn-tu-dia` → `Success! Project ravn-tu-dia removed`. Si la CLI no está logueada en el team correcto: `npx vercel login` y/o `npx vercel switch` al team de Eze primero.

Camino B — Dashboard (si la CLI falla): vercel.com → team de Eze → proyecto **ravn-tu-dia** → Settings → Advanced → **Delete Project** → escribir el nombre para confirmar.

- [ ] **Step 3: Verificar que el deploy murió**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://ravn-tu-dia.vercel.app
```

Expected: `404` (o el dominio ya no resuelve el proyecto). El dashboard de Vercel ya no lista `ravn-tu-dia`.

- [ ] **Step 4: Archivar el repo local**

```bash
mkdir -p /Users/ezeotero/Documents/_archivo-2026-06
rm -rf /Users/ezeotero/Documents/ravn-tu-dia/node_modules
mv /Users/ezeotero/Documents/ravn-tu-dia /Users/ezeotero/Documents/_archivo-2026-06/ravn-tu-dia
ls /Users/ezeotero/Documents/ | grep ravn-tu-dia || echo "ARCHIVADO"
```

Expected: `ARCHIVADO`.

- [ ] **Step 5: Registrar la baja en eventos**

Derivar credenciales y token frescos (el `access_token` de Supabase expira ~1 hora — NUNCA reusar uno de otra tarea):

```bash
ENVF=/Users/ezeotero/.ravn-cotizador/.env
SUPABASE_URL=$(grep '^SUPABASE_URL=' $ENVF | cut -d= -f2-)
ANON=$(grep '^SUPABASE_ANON_KEY=' $ENVF | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$(grep '^BOT_EMAIL=' $ENVF | cut -d= -f2-)\",\"password\":\"$(grep '^BOT_PASSWORD=' $ENVF | cut -d= -f2-)\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SUPABASE_URL/rest/v1/eventos" \
  -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN" -H "Content-Type: application/json" \
  -d '{"origen":"sistema","tipo":"baja_pieza","titulo":"ravn-tu-dia dado de baja (Vercel + repo archivado)","contenido":{"spec":"§8","reemplazo":"Centro de Mando"}}'
```

Expected: `201`. No hay commit (tarea operativa).

---

### Tarea 17: Runbook `daemon/README.md` + verificación final del frente

**Files:**
- Create: `daemon/README.md`

- [ ] **Step 1: Crear el runbook**

Crear `daemon/README.md`:

```markdown
# Daemon Ravn — jobs programados (com.ravn.jobs)

Jobs del cerebro del Centro de Mando. Corren en la Mac de Eze vía launchd
(`com.ravn.jobs`, tick cada 30 min + al arrancar). Catch-up automático: si la
Mac estuvo apagada, el primer tick corre todo lo vencido. Cada corrida (OK o
error) deja una fila en la tabla `eventos` (origen `daemon`).

| Job | Frecuencia | Qué hace |
|---|---|---|
| dolar | diario (≥8h) | Bluelytics→DolarAPI → `Conocimiento/Precios/dolar.json` + bloque en materiales-construccion.md. Sin IA. |
| sismat | mensual (día ≥2, ≥8h) | corre `Conocimiento/Precios/sismat/sync.py` del vault |
| top30 | semanal (≥8h) | Claude headless re-busca los precios de materiales-construccion.md |
| inbox | diario (≥2h) | Claude headless: "procesá mi inbox" (vault CLAUDE.md) + patrones ADN de `referencias` → Orientación + push |

## Operación

- **Estado:** `cat ~/.ravn-jobs/state.json` (ultima_ok / errores por job)
- **Logs:** `tail -50 ~/.ravn-jobs/logs/runner.log` (y `launchd.err.log` si el wrapper ni arrancó)
- **Forzar un tick ya:** `launchctl kickstart gui/$(id -u)/com.ravn.jobs`
- **Forzar UN job (re-corre aunque ya haya corrido hoy):** borrar su clave de `state.json` y kickstart
- **Gate de un job:** `python3 daemon/jobs/chequear_evento.py job_inbox` (python = 3.13 del framework)
- **Reinstalar:** `daemon/install.sh` · **Desinstalar:** `launchctl bootout gui/$(id -u)/com.ravn.jobs && rm ~/Library/LaunchAgents/com.ravn.jobs.plist`
- **Tests:** `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s daemon/jobs/tests -v`

## Latido de la Mac

El daemon del cotizador (`~/.ravn-cotizador/daemon.py`, `com.ravn.cotizador`, cada 45s)
upsertea `sistema_estado` (singleton id=1): `ultimo_latido` + `daemon_version`.
El bot considera la Mac viva si el latido tiene <3 min. `cotizaciones_cola` ya no existe.

## Troubleshooting

- **Auth 400 contra Supabase:** el usuario `BOT_EMAIL` no existe o cambió la password → Dashboard → Authentication → Users. Credenciales en `~/.ravn-cotizador/.env`.
- **`push del vault falló`:** el remoto `boveda` tiene commits que la Mac no tiene → `git --git-dir ~/.ravn-vault-git --work-tree /Users/ezeotero/Obsidian/RAVN pull --rebase origin main` y esperar el próximo tick.
- **Job clavado en error 3 veces:** revisar `runner.log`, arreglar la causa, borrar la clave del job en `state.json`.
- **NUNCA** `pkill -f server.py` / `pkill python` (mata otros tools). Procesos solo por puerto: `lsof -ti:PUERTO | xargs kill`.
- El vault es un symlink a iCloud y su git vive en `~/.ravn-vault-git`. NUNCA crear un `.git` dentro del vault ni ejecutar código desde paths de iCloud (espacios → launchd exit 127).
```

- [ ] **Step 2: Verificación final del frente (checklist global)**

```bash
# 1. Suite completa verde:
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m unittest discover -s /Users/ezeotero/Documents/ravn/daemon/jobs/tests -v
# Expected: OK (45 tests)

# 2. launchd: lo nuevo cargado, lo viejo dado de baja:
launchctl list | grep -i ravn
# Expected: com.ravn.cotizador y com.ravn.jobs con status 0 (reminders-bridge: ver dudas). SIN tudia ni dia-whatsapp.

# 3. Puertos viejos libres:
lsof -nP -iTCP:4317 -iTCP:4319 -sTCP:LISTEN || echo "LIBRES"
# Expected: LIBRES

# 4. Latido fresco y tabla vieja muerta — derivar credenciales y token frescos
#    (el access_token de Supabase expira ~1 hora; NUNCA reusar uno de otra tarea):
ENVF=/Users/ezeotero/.ravn-cotizador/.env
SUPABASE_URL=$(grep '^SUPABASE_URL=' $ENVF | cut -d= -f2-)
ANON=$(grep '^SUPABASE_ANON_KEY=' $ENVF | cut -d= -f2-)
BOT_TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d "{\"email\":\"$(grep '^BOT_EMAIL=' $ENVF | cut -d= -f2-)\",\"password\":\"$(grep '^BOT_PASSWORD=' $ENVF | cut -d= -f2-)\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s "$SUPABASE_URL/rest/v1/sistema_estado?id=eq.1&select=ultimo_latido,daemon_version" -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
curl -s -o /dev/null -w '%{http_code}\n' "$SUPABASE_URL/rest/v1/cotizaciones_cola?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
# Expected: latido de <1 min con daemon_version frente-e-1 · 404

# 5. Eventos del daemon en la base (alimentan el feed Actividad):
curl -s "$SUPABASE_URL/rest/v1/eventos?origen=eq.daemon&select=tipo,titulo,creado_at&order=creado_at.desc&limit=5" -H "apikey: $ANON" -H "Authorization: Bearer $BOT_TOKEN"
# Expected: filas job_dolar / job_inbox / job_top30 recientes
```

- [ ] **Step 3: Commit final**

```bash
cd /Users/ezeotero/Documents/ravn && git add daemon/README.md && git commit -m "docs(daemon): runbook de operación de com.ravn.jobs y el latido

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Dudas de frontera (anotadas, NO bloquean la escritura del plan)

1. **Enmienda RLS del Frente A:** el contrato amplió permisos del bot (UPDATE en `eventos`/`trabajos_cola`/`tareas`, DELETE en `tareas`/`gastos_personales`, SELECT en `presupuestos`, INSERT en Storage `referencias`) y el plan A se va a enmendar. Este frente NO depende de esa enmienda: `sistema_estado` define sus propias policies (Tarea 10) y los jobs solo hacen INSERT en `eventos` y SELECT en `referencias`, ambos ya en el contrato original.
2. **`com.ravn.dia-whatsapp` no figura en la tabla §8 del spec**, pero consume el `dia.json` que generaba `com.ravn.tudia` (roto) y queda zombie tras la baja del panel. El plan lo da de baja junto con tudia (Tarea 14) PREVIO OK de Eze. Si Eze quiere conservar un resumen mañanero por WhatsApp, se reimplementa después leyendo el Centro de Mando (proyecto aparte).
3. **`com.ravn.reminders-bridge`** (`~/.ravn/reminders-bridge.py`, tick 15s) sigue cargado y NO está en §8 ni en el alcance de este frente → no se toca. Decidir con Eze si muere con el pivote tareas-en-Supabase (huele a pieza del sistema viejo de Reminders).
4. **Orden de ejecución entre frentes:** Tareas 1-9 requieren Frente A ejecutado (tabla `eventos` + usuario bot); Tarea 10 usa `set_actualizado_at()` de A; **Tarea 11 requiere el daemon del Frente D YA reemplazado** (gate de orden en su Step 1); Tarea 12 se commitea en la rama `frente-c-bot-2` (C) y llega a producción con el merge de esa rama (lo coordina el cierre de C); Tarea 13 además requiere el daemon del Frente D procesando `trabajos_cola`; Tareas 15-16 requieren el Centro de Mando (B) deployado. Los gates de cada tarea verifican esto con comandos — si fallan, se frena esa tarea sin bloquear las demás.
5. **El plan D REEMPLAZA `~/.ravn-cotizador/daemon.py` COMPLETO** (su Task 18, fuera de git): constante `TABLA_LEGACY = "cotizaciones_cola"`, cola nueva `trabajos_cola` + camino legacy (`PROMPTS`, `desempaquetar`, `correr_claude_legacy`, `procesar_legacy`). El orden es ESTRICTO: D Task 18 → Tarea 11 (latido doble, escrito contra el daemon post-D) → Tarea 12 (bot) → Tarea 13 (corte del latido viejo + extirpación del camino legacy + drop). Si la Tarea 11 corriera antes que D, el reemplazo completo de D pisaría el latido doble y `macViva` (Tarea 12) vería la Mac muerta. Buscar `latir()` por nombre, no por línea; backup `.bak` antes de cada edición.
6. **URL de producción del Centro de Mando:** el plan asume el proyecto Vercel `ravn-app-one` deployado (Frente B). Los gates manuales de las Tareas 15-16 usan esa URL.
7. **`job_top30` edita `materiales-construccion.md` con Claude headless**: si el Frente D cambia el formato de tablas de ese archivo, ajustar `filas_materiales()`/`filas_con_fecha()` y el prompt. La verificación post-corrida mira la columna Fecha de las filas de materiales (`filas_con_fecha`), NO la presencia de la fecha en el archivo — el bloque DOLAR que escribe `job_dolar` en el mismo archivo ya tiene la fecha de hoy y daría falso OK. Un cambio de formato que rompa el parseo hace fallar el job con error visible, nunca en silencio.
8. **Colisión de timestamps evitada:** B ya usa `20260613100000`; las migraciones de este frente van en `20260614100000` y `20260614110000`.
