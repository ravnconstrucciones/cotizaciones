# Memoria compartida Codex–Claude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archivar las conversaciones de Codex y Claude, producir cierres estructurados compartidos y recuperar contexto relevante desde App RAVN, Obsidian y Graphify sin superar 3.000 tokens.

**Architecture:** Un paquete Python sin dependencias nuevas normaliza los JSONL de ambos hosts, filtra secretos y escribe de forma atómica dos capas en el Vault: crudo auditable y cierre estructurado. Un índice local permite recuperación inmediata y acotada; Graphify consolida relaciones en segundo plano y el job nocturno existente mantiene la reconstrucción completa.

**Tech Stack:** Python 3.13 stdlib, `unittest`, JSONL, Markdown/YAML frontmatter, Obsidian, Graphify, git-dir externo del Vault, runner launchd existente.

## Global Constraints

- App RAVN/Supabase conserva la verdad operativa; Obsidian conserva la memoria narrativa.
- `Conversaciones/crudo/` nunca entra a Graphify ni a prompts habituales.
- Recuperación predeterminada: máximo 8 notas y 3.000 tokens estimados.
- No persistir claves, tokens, cookies, secretos ni volcados de entorno.
- Toda escritura es atómica e idempotente por `host + thread_id + fecha_cierre`.
- Si falla la sincronización, conservar la copia local y registrar un pendiente visible.
- Codex y Claude usan el mismo contrato y el mismo comando de cierre.
- El repositorio Git del Vault usa `/Users/ezeotero/.ravn-vault-git`; nunca crear `.git` dentro del Vault de iCloud.

---

## File Map

- `daemon/memoria/modelo.py`: tipos, validación, redacción y serialización canónica.
- `daemon/memoria/colectores.py`: adaptadores JSONL para Codex y Claude.
- `daemon/memoria/almacen.py`: rutas, escritura atómica, idempotencia e índice local.
- `daemon/memoria/cerrar.py`: CLI común para que ambos agentes persistan un cierre.
- `daemon/memoria/recuperar.py`: ranking y paquete de contexto acotado.
- `daemon/memoria/cli.py`: entrada única `ravn-memoria` disponible desde cualquier directorio.
- `daemon/memoria/instrucciones.md`: contrato que se instala en AGENTS/CLAUDE.
- `daemon/memoria/instalar.py`: instalación idempotente de carpetas, ignore e instrucciones.
- `daemon/jobs/job_memoria.py`: respaldo periódico de crudos y cierres faltantes.
- `daemon/jobs/runner.py`: registra `memoria` como job de cada tick.
- `daemon/jobs/job_cerebro.py`: consume la marca de índice pendiente y mantiene Graphify.
- `daemon/memoria/tests/`: unitarias e integración con Vault temporal.

### Task 1: Modelo canónico y filtro de secretos

**Files:**
- Create: `daemon/memoria/__init__.py`
- Create: `daemon/memoria/modelo.py`
- Create: `daemon/memoria/tests/__init__.py`
- Create: `daemon/memoria/tests/test_modelo.py`

**Interfaces:**
- Produces: `Mensaje(host, thread_id, timestamp, autor, tipo, texto, metadata)`.
- Produces: `Cierre(id, host, thread_id, fecha_inicio, fecha_cierre, tema, estado, entidades, hechos, decisiones, metodos, cambios, pendientes, separaciones, enlaces, fuente_cruda, sensibilidad)`.
- Produces: `redactar_secretos(texto: str) -> str`, `validar_cierre(data: dict) -> Cierre`, `cierre_a_markdown(cierre: Cierre) -> str`.

- [ ] **Step 1: Write failing model tests**

```python
def test_redacta_secretos_sin_borrar_contenido_util():
    texto = "obra Glorietas SUPABASE_SERVICE_ROLE_KEY=secreto precio 100"
    assert redactar_secretos(texto) == "obra Glorietas SUPABASE_SERVICE_ROLE_KEY=[REDACTADO] precio 100"

def test_cierre_exige_fuente_y_estado_valido():
    with self.assertRaises(ValueError):
        validar_cierre({"host": "codex", "thread_id": "t-1", "estado": "inventado"})
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_modelo -v`

Expected: FAIL because `daemon.memoria.modelo` does not exist.

- [ ] **Step 3: Implement the canonical dataclasses and redaction**

Implement exact allowed values:

```python
HOSTS = {"codex", "claude"}
ESTADOS = {"completo", "parcial", "bloqueado"}
SENSIBILIDADES = {"normal", "restringida"}
SECRET_PATTERNS = (
    r"(?i)(SUPABASE_SERVICE_ROLE_KEY\s*=\s*)[^\s]+",
    r"(?i)(ANTHROPIC_API_KEY\s*=\s*)[^\s]+",
    r"(?i)(OPENAI_API_KEY\s*=\s*)[^\s]+",
    r"(?i)(Authorization:\s*Bearer\s+)[A-Za-z0-9._-]+",
)
```

Serialize frontmatter in a stable key order and body sections in this exact order: `Hechos confirmados`, `Decisiones`, `Métodos reutilizables`, `Cambios realizados`, `Pendientes`, `Separaciones de alcance`, `Enlaces`.

- [ ] **Step 4: Run model tests**

Run: `python3 -m unittest daemon.memoria.tests.test_modelo -v`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add daemon/memoria
git commit -m "feat(memoria): definir cierre compartido y filtro de secretos"
```

### Task 2: Colectores JSONL de Codex y Claude

**Files:**
- Create: `daemon/memoria/colectores.py`
- Create: `daemon/memoria/tests/fixtures/codex-session.jsonl`
- Create: `daemon/memoria/tests/fixtures/claude-session.jsonl`
- Create: `daemon/memoria/tests/test_colectores.py`

**Interfaces:**
- Consumes: `Mensaje` and `redactar_secretos` from Task 1.
- Produces: `leer_codex(path: Path) -> list[Mensaje]`, `leer_claude(path: Path) -> list[Mensaje]`, `detectar_host(path: Path) -> Literal['codex','claude']`, `descubrir_sesiones() -> list[Path]`.

- [ ] **Step 1: Add minimal representative fixtures**

Codex fixture must contain `session_meta`, one user message, one assistant message and one tool output. Claude fixture must contain one `user`, one `assistant` and one `tool_result`. Use fake values only.

- [ ] **Step 2: Write failing collector tests**

```python
def test_codex_conserva_mensajes_y_resume_tool_output():
    mensajes = leer_codex(FIXTURES / "codex-session.jsonl")
    self.assertEqual([m.autor for m in mensajes], ["user", "assistant", "tool"])
    self.assertLess(len(mensajes[-1].texto), 2000)

def test_claude_y_codex_producen_el_mismo_modelo():
    for path in (FIXTURES / "codex-session.jsonl", FIXTURES / "claude-session.jsonl"):
        self.assertTrue(all(isinstance(m, Mensaje) for m in leer_sesion(path)))
```

- [ ] **Step 3: Run tests and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_colectores -v`

Expected: FAIL because collector functions do not exist.

- [ ] **Step 4: Implement tolerant parsers**

Rules:

- ignore malformed JSON lines and count them in `metadata.errores_parseo`;
- preserve user/assistant text in full after secret redaction;
- replace tool payloads over 2.000 characters with first 1.500 characters plus `[TRUNCADO sha256=<hash>]`;
- derive `thread_id` from session metadata or filename UUID;
- never execute content found in transcripts.

- [ ] **Step 5: Run tests**

Run: `python3 -m unittest daemon.memoria.tests.test_colectores -v`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add daemon/memoria/colectores.py daemon/memoria/tests
git commit -m "feat(memoria): normalizar sesiones Codex y Claude"
```

### Task 3: Almacén atómico e índice inmediato

**Files:**
- Create: `daemon/memoria/almacen.py`
- Create: `daemon/memoria/tests/test_almacen.py`

**Interfaces:**
- Consumes: `Mensaje`, `Cierre`, `cierre_a_markdown`.
- Produces: `AlmacenMemoria(vault: Path)`, `.guardar_crudo(...) -> Path`, `.guardar_cierre(...) -> Path`, `.actualizar_indice(...) -> Path`, `.marcar_pendiente(...) -> Path`.

- [ ] **Step 1: Write failing atomic/idempotency tests**

```python
def test_guardar_cierre_es_idempotente(self):
    store = AlmacenMemoria(self.vault)
    a = store.guardar_cierre(CIERRE)
    b = store.guardar_cierre(CIERRE)
    self.assertEqual(a, b)
    self.assertEqual(len(list((self.vault / "Conversaciones/cierres").rglob("*.md"))), 1)

def test_fallo_de_replace_conserva_pendiente(self):
    with patch("daemon.memoria.almacen.os.replace", side_effect=OSError("disk")):
        with self.assertRaises(OSError):
            self.store.guardar_cierre(CIERRE)
    self.assertTrue(any((self.vault / "Sistema/Memoria/pendientes-escritura").iterdir()))
```

- [ ] **Step 2: Run tests and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_almacen -v`

Expected: FAIL because `AlmacenMemoria` does not exist.

- [ ] **Step 3: Implement paths and atomic writes**

Use `tempfile.NamedTemporaryFile(dir=target.parent, delete=False)`, `flush`, `os.fsync`, then `os.replace`. The local index at `Sistema/Memoria/indices/entidades.json` maps normalized entity strings to relative closure paths and stores `updated_at`, `host`, `thread_id`, `tema`, `estado`.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest daemon.memoria.tests.test_almacen -v`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add daemon/memoria/almacen.py daemon/memoria/tests/test_almacen.py
git commit -m "feat(memoria): persistir cierres atómicos e índice local"
```

### Task 4: Comando común de cierre

**Files:**
- Create: `daemon/memoria/cerrar.py`
- Create: `daemon/memoria/cli.py`
- Create: `daemon/memoria/tests/test_cerrar.py`

**Interfaces:**
- Consumes: `ravn-memoria cerrar`, JSON closure on stdin and optional `--session-path`.
- Produces: stdout JSON `{"ok": true, "cierre": "...", "crudo": "...", "indexado": true}`; exit `2` on validation and `3` on persistence failure.

- [ ] **Step 1: Write failing CLI test**

```python
def test_cli_escribe_cierre_y_devuelve_evidencia(self):
    result = subprocess.run(
        [sys.executable, "-m", "daemon.memoria.cli", "cerrar", "--vault", str(self.vault)],
        input=json.dumps(CIERRE_DICT), text=True, capture_output=True,
    )
    self.assertEqual(result.returncode, 0)
    self.assertTrue(json.loads(result.stdout)["indexado"])
```

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_cerrar -v`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement CLI**

Required options: `--vault`, `--session-path`, `--host`, `--thread-id`. Stdin data wins over inferred metadata. Refuse to report success unless the closure file and index entry can be reopened and verified. `cli.py` dispatches subcommands `cerrar`, `recuperar`, `reindexar` and `estado` without importing host-specific code.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest daemon.memoria.tests.test_cerrar -v`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add daemon/memoria/cerrar.py daemon/memoria/tests/test_cerrar.py
git commit -m "feat(memoria): agregar cierre común para Codex y Claude"
```

### Task 5: Recuperación semántica acotada

**Files:**
- Create: `daemon/memoria/recuperar.py`
- Create: `daemon/memoria/tests/test_recuperar.py`

**Interfaces:**
- Produces: `ConsultaMemoria(texto, entidades, max_notas=8, max_tokens=3000)`.
- Produces: `PaqueteContexto(notas, app_refs, tokens_estimados, procedencia, confianza)`.
- Produces: `recuperar(consulta: ConsultaMemoria, vault: Path) -> PaqueteContexto`.
- CLI `ravn-memoria recuperar` writes JSON and accepts `--query`, repeated `--entidad`, `--max-notas`, `--max-tokens`. `ravn-memoria reindexar` rebuilds `entidades.json` only from validated closure Markdown files.

- [ ] **Step 1: Write failing ranking and budget tests**

```python
def test_prioriza_entidad_exacta_y_respeta_presupuesto():
    paquete = recuperar(ConsultaMemoria("garage adoquines", ["Glorietas"], max_tokens=120), vault)
    self.assertEqual(paquete.notas[0].entidades["obras"], ["Glorietas"])
    self.assertLessEqual(paquete.tokens_estimados, 120)

def test_no_abre_crudo_por_defecto():
    paquete = recuperar(ConsultaMemoria("garage", []), vault)
    self.assertFalse(any("Conversaciones/crudo" in n.ruta for n in paquete.notas))
```

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_recuperar -v`

Expected: FAIL because retrieval does not exist.

- [ ] **Step 3: Implement deterministic ranking**

Score: exact entity `+100`, entity token `+40`, title token `+20`, body token `+5`, active/partial state `+10`, each day of age `-0.05` capped at `-20`, Graphify neighbor `+15`. Estimate tokens as `ceil(chars / 4)`. Add notes in descending score until either limit is reached. Include file path and matched reasons for every note.

- [ ] **Step 4: Run tests**

Run: `python3 -m unittest daemon.memoria.tests.test_recuperar -v`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add daemon/memoria/recuperar.py daemon/memoria/tests/test_recuperar.py
git commit -m "feat(memoria): recuperar contexto relevante con límite de tokens"
```

### Task 6: Recolector de respaldo y runner

**Files:**
- Create: `daemon/jobs/job_memoria.py`
- Create: `daemon/jobs/tests/test_job_memoria.py`
- Modify: `daemon/jobs/runner.py`
- Modify: `daemon/jobs/tests/test_runner.py`

**Interfaces:**
- Consumes: `descubrir_sesiones`, collectors and `AlmacenMemoria`.
- Produces: `job_memoria.correr(cfg, token)` and state cursor at `~/.ravn-jobs/memoria-cursor.json`.

- [ ] **Step 1: Write failing job tests**

Verify that a new Codex and Claude fixture are archived once, a second run writes nothing, and a session older than 15 minutes without closure creates one JSON file under `Sistema/Memoria/pendientes-escritura/` plus one `eventos` warning.

- [ ] **Step 2: Register expected runner behavior in tests**

Assert `jobs_vencidos` always includes `memoria`, before `cerebro`, and that a failure does not mark the cursor as processed.

- [ ] **Step 3: Run and verify failure**

Run: `python3 -m unittest daemon.jobs.tests.test_job_memoria daemon.jobs.tests.test_runner -v`

Expected: FAIL because `job_memoria` is absent.

- [ ] **Step 4: Implement backup collector**

Discover:

- Codex: `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl`.
- Claude: `~/.claude/projects/**/*.jsonl`.

Process only files whose `(mtime_ns, size)` differs from cursor. Do not call an LLM. Archive raw content, mark missing structured closure, update cursor only after verified writes, and register one summarized event per run.

- [ ] **Step 5: Add runner entry**

Place `("memoria", job_memoria.correr, lambda u, a: True)` immediately before `inbox`. Import `job_memoria` explicitly.

- [ ] **Step 6: Run tests**

Run: `python3 -m unittest daemon.jobs.tests.test_job_memoria daemon.jobs.tests.test_runner -v`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add daemon/jobs/job_memoria.py daemon/jobs/runner.py daemon/jobs/tests
git commit -m "feat(memoria): respaldar sesiones y detectar cierres faltantes"
```

### Task 7: Graphify incremental sin bloquear recuperación

**Files:**
- Create: `daemon/memoria/graphify_batch.py`
- Create: `daemon/memoria/tests/test_graphify_batch.py`
- Modify: `daemon/jobs/job_cerebro.py`

**Interfaces:**
- Produces: `debe_actualizar(marker: Path, state: Path, ahora: datetime) -> bool`.
- Produces: `marcar_cierre(vault: Path)`, `actualizar_incremental(vault: Path, graphify_bin: Path)`.

- [ ] **Step 1: Write failing batching tests**

Test first marker runs, a second marker within 15 minutes does not run, and a marker after 15 minutes runs once. Test a Graphify failure leaves the marker in place.

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_graphify_batch -v`

Expected: FAIL because batching functions do not exist.

- [ ] **Step 3: Implement batching**

Use marker `Sistema/Memoria/.graphify-pendiente` and state `~/.ravn-jobs/graphify-memoria.json`. Execute `[graphify, "update", vault, "--no-viz"]` with 900-second timeout. Delete marker only after exit code `0` and valid `graphify-out/graph.json` JSON.

- [ ] **Step 4: Keep nightly full rebuild intact**

Modify `job_cerebro` only to clear a stale marker after its existing successful full update. Do not remove export HTML, Organismo copy, diagnostics or daily question behavior.

- [ ] **Step 5: Run tests**

Run: `python3 -m unittest daemon.memoria.tests.test_graphify_batch daemon.jobs.tests.test_job_memoria -v`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add daemon/memoria/graphify_batch.py daemon/memoria/tests/test_graphify_batch.py daemon/jobs/job_cerebro.py
git commit -m "feat(memoria): actualizar Graphify por lotes incrementales"
```

### Task 8: Instalación compartida para Codex y Claude

**Files:**
- Create: `daemon/memoria/instrucciones.md`
- Create: `daemon/memoria/instalar.py`
- Create: `daemon/memoria/tests/test_instalar.py`
- Modify: `daemon/install.sh`

**Interfaces:**
- Installer targets: `/Users/ezeotero/.codex/AGENTS.md`, `/Users/ezeotero/.claude/CLAUDE.md`, `/Users/ezeotero/Obsidian/RAVN/CLAUDE.md`, `/Users/ezeotero/Obsidian/RAVN/.graphifyignore`.
- Managed block markers: `<!-- RAVN_MEMORIA_COMPARTIDA:START -->` and `<!-- RAVN_MEMORIA_COMPARTIDA:END -->`.

- [ ] **Step 1: Write failing idempotent installer test**

Run installer twice against temporary files and assert one managed block, raw directory ignored once, and required Vault directories exist.

- [ ] **Step 2: Run and verify failure**

Run: `python3 -m unittest daemon.memoria.tests.test_instalar -v`

Expected: FAIL because installer does not exist.

- [ ] **Step 3: Write exact shared instruction block**

The block must require agents to:

1. run `ravn-memoria recuperar` before material RAVN work;
2. never read raw transcripts by default;
3. run `ravn-memoria cerrar` before claiming completion;
4. report immediately if either command fails;
5. persist operational IDs in App RAVN and narrative context in Obsidian;
6. identify similar jobs explicitly to prevent scope mixing.

- [ ] **Step 4: Implement installer**

The installer replaces only its managed block, creates directories with mode `0700` for raw/pending and appends `Conversaciones/crudo/` to `.graphifyignore`. It installs `~/.local/bin/ravn-memoria` as a small wrapper that sets `PYTHONPATH=/Users/ezeotero/Documents/ravn` and executes `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -m daemon.memoria.cli`; it supports `--dry-run`, `--root` and `--source` for tests.

- [ ] **Step 5: Run tests**

Run: `python3 -m unittest daemon.memoria.tests.test_instalar -v`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add daemon/memoria daemon/install.sh
git commit -m "feat(memoria): instalar protocolo común en Codex y Claude"
```

### Task 9: Verification and live handoff

**Files:**
- Modify: `daemon/README.md` if present; otherwise Create: `daemon/MEMORIA.md`
- Test: all memory and job tests.

**Interfaces:**
- Verifies the complete Codex → Vault → Claude and Claude → Vault → Codex paths.

- [ ] **Step 1: Run focused suite**

Run: `python3 -m unittest discover -s daemon/memoria/tests -v`

Expected: all tests PASS.

- [ ] **Step 2: Run daemon regression suite**

Run: `python3 -m unittest discover -s daemon/jobs/tests -v`

Expected: all tests PASS.

- [ ] **Step 3: Run installer dry-run**

Run: `python3 -m daemon.memoria.instalar --dry-run`

Expected: JSON listing four managed targets, created directories and no writes.

- [ ] **Step 4: Install with explicit approval and verify**

Run: `python3 -m daemon.memoria.instalar`

Expected: `ok=true`; each managed target contains one block; Vault raw path is ignored by Graphify.

- [ ] **Step 5: Cross-host smoke test**

Create one fake Codex closure containing entity `Prueba-Memoria-Cruzada`, retrieve it with `ravn-memoria recuperar`, then create a fake Claude closure and retrieve it through the same command. Delete only the two fake closure files and run `ravn-memoria reindexar`.

- [ ] **Step 6: Run full project checks**

Run: `npm test`

Expected: 0 failed.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Verify Vault sync and job health**

Check the external Vault git status, latest commit, `~/.ravn-jobs/state.json`, and runner log. Do not start a second runner if launchd is already active.

- [ ] **Step 8: Commit documentation**

```bash
git add daemon/MEMORIA.md
git commit -m "docs(memoria): documentar recuperación y cierre compartidos"
```
