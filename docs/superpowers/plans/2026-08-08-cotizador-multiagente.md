# Cotizador multiagente RAVN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el flujo de cotización existente en un expediente coordinado con diagnóstico único, vistas cliente/Fran, investigación Internet/SISMAT, motor determinístico, propuesta y revisión obligatoria.

**Architecture:** El puente local existente conserva Claude/Fable y Codex como motores, pero los envuelve en roles con contratos JSON y paquetes mínimos de contexto. Una tabla de etapas registra idempotencia y observabilidad; el mismo diagnóstico técnico alimenta los documentos de cliente y Fran, SISMAT corre como herramienta determinística, Internet como investigador Codex y toda aritmética permanece en `src/lib/cotizador`.

**Tech Stack:** TypeScript 5.7, Node.js 24, Next.js 15 App Router, Supabase/Postgres, Vitest 4, puente local con Claude Code y Codex, motor determinístico RAVN, Python SISMAT existente.

## Global Constraints

- Ningún agente aprueba ni emite; el resultado automatizado máximo es `en_revision`.
- Cantidades y totales se calculan únicamente con el motor determinístico existente.
- Diagnosticador cliente y Fran comparten un único objeto técnico validado.
- Internet y SISMAT informan fuente, fecha, unidad y calidad; no calculan el total.
- Cada rol recibe un paquete de contexto, nunca la conversación o el Vault completos.
- Las dudas materiales se agrupan en una única ronda breve.
- App RAVN se reconsulta después de cada escritura de estado.
- GARAGE, PUENTE y cualquier trabajo similar mantienen expedientes, evidencia y recetas separados.
- No se despliega hasta superar el flujo local completo y la revisión de Ezequiel.

---

## File Map

- `src/lib/cotizador/expediente.ts`: contrato de ficha maestra y validación.
- `src/lib/cotizador/etapas.ts`: estados, transiciones y reglas de cierre.
- `supabase/migrations/20260808120000_cotizacion_etapas.sql`: persistencia de etapas y RLS.
- `daemon/puente-cotizador/paquete-contexto.ts`: contexto mínimo por rol.
- `daemon/puente-cotizador/agentes/diagnosticador.ts`: diagnóstico técnico y dos vistas.
- `daemon/puente-cotizador/agentes/precios-internet.ts`: investigación Codex normalizada.
- `daemon/puente-cotizador/agentes/sismat.ts`: búsqueda local determinística.
- `daemon/puente-cotizador/agentes/cotizador.ts`: selección de referencias, receta y motor.
- `daemon/puente-cotizador/agentes/redactor.ts`: propuesta borrador.
- `daemon/puente-cotizador/agentes/revisor.ts`: gate de coherencia.
- `daemon/puente-cotizador/orquestador.ts`: máquina de estados e idempotencia.
- `daemon/puente-cotizador/puente.ts`: dispara el orquestador y conserva el chat.
- `src/app/api/cotizaciones/[id]/etapas/route.ts`: lectura del avance.
- `src/app/cotizaciones/[id]/revision/flujo-agentes.tsx`: estado visible en la mesa.

### Task 1: Contrato de expediente y etapas

**Files:**
- Create: `src/lib/cotizador/expediente.ts`
- Create: `src/lib/cotizador/etapas.ts`
- Create: `src/lib/cotizador/__tests__/expediente.test.ts`
- Create: `src/lib/cotizador/__tests__/etapas.test.ts`

**Interfaces:**
- Produces: `ExpedienteCotizacion`, `DiagnosticoTecnico`, `FuentePrecioNormalizada`, `ResultadoRol<T>`.
- Produces: `validarExpediente(input: unknown): ExpedienteCotizacion`.
- Produces: `puedeTransicionar(desde: EstadoEtapa, hacia: EstadoEtapa): boolean` and `puedePasarARevision(expediente): ResultadoGate`.

- [ ] **Step 1: Write failing contract tests**

```ts
it("rechaza una medida sin procedencia", () => {
  expect(() => validarExpediente({ medidas: [{ nombre: "superficie", valor: 20 }] }))
    .toThrow(/procedencia/);
});

it("impide en_revision con motor incompleto", () => {
  expect(puedePasarARevision({ ...EXPEDIENTE, motor: { estado: "pendiente" } }).ok).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/cotizador/__tests__/expediente.test.ts src/lib/cotizador/__tests__/etapas.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement exact domain types**

Required stage names: `alta`, `diagnostico`, `precios_internet`, `precios_sismat`, `motor`, `propuesta`, `revision`. Required stage states: `pendiente`, `ejecutando`, `esperando_dato`, `completa`, `error`, `vencida`.

Every `DatoConProcedencia<T>` contains `valor`, `fuente`, `confianza: 'verificado'|'estimado'`, `fecha`. Every job identity contains `expediente_id`, `titulo`, `separacion_alcance` and optional App IDs.

- [ ] **Step 4: Implement transition/gate rules**

Only `pendiente|error|vencida → ejecutando`; `ejecutando → esperando_dato|completa|error`; `esperando_dato → ejecutando`; `completa → vencida`. Final gate requires diagnostic, both price stages, motor, proposal and review complete; zero unresolved critical doubts; state currently `borrador`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/cotizador/__tests__/expediente.test.ts src/lib/cotizador/__tests__/etapas.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cotizador/expediente.ts src/lib/cotizador/etapas.ts src/lib/cotizador/__tests__
git commit -m "feat(cotizador): definir expediente y etapas multiagente"
```

### Task 2: Persistencia de etapas en Supabase

**Files:**
- Create: `supabase/migrations/20260808120000_cotizacion_etapas.sql`
- Create: `src/lib/cotizador/etapas-repo.ts`
- Create: `src/lib/cotizador/__tests__/etapas-repo.test.ts`

**Interfaces:**
- Produces table `cotizacion_etapas(id, cotizacion_id, etapa, estado, intento, entrada_hash, salida, error, iniciado_at, completado_at, actualizado_at)`.
- Produces: `EtapasRepo` with `iniciar`, `completar`, `fallar`, `esperarDato`, `listar`.

- [ ] **Step 1: Write failing repository tests with injected Supabase fake**

Verify `iniciar` increments attempt, refuses a second running row with same `entrada_hash`, and `completar` stores JSON output without changing `cotizaciones.estado`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/lib/cotizador/__tests__/etapas-repo.test.ts`

Expected: FAIL because repository does not exist.

- [ ] **Step 3: Write migration**

Constraints:

```sql
check (etapa in ('alta','diagnostico','precios_internet','precios_sismat','motor','propuesta','revision'))
check (estado in ('pendiente','ejecutando','esperando_dato','completa','error','vencida'))
unique (cotizacion_id, etapa)
```

Add FK cascade to `cotizaciones`, index `(cotizacion_id, etapa)`, authenticated read/write policy, service-role access and Realtime publication using the repository's existing idempotent block pattern.

- [ ] **Step 4: Implement repository with compare-and-set updates**

Every transition filters both `id` and expected previous state and verifies exactly one returned row. Hash inputs with stable JSON key order and SHA-256.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/lib/cotizador/__tests__/etapas-repo.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260808120000_cotizacion_etapas.sql src/lib/cotizador/etapas-repo.ts src/lib/cotizador/__tests__/etapas-repo.test.ts
git commit -m "feat(cotizador): persistir etapas idempotentes"
```

### Task 3: Paquetes mínimos y contratos de roles

**Files:**
- Create: `daemon/puente-cotizador/paquete-contexto.ts`
- Create: `daemon/puente-cotizador/roles.ts`
- Create: `daemon/puente-cotizador/paquete-contexto.test.ts`

**Interfaces:**
- Produces: `RolCotizador = 'coordinador'|'diagnosticador'|'internet'|'sismat'|'cotizador'|'redactor'|'revisor'`.
- Produces: `construirPaquete(rol, expediente, memoria): PaqueteRol`.
- Produces: `parsearSalidaRol<T>(rol, texto): ResultadoRol<T>`.

- [ ] **Step 1: Write failing least-context tests**

Assert diagnosticador receives evidence and methods but no price rows; redactor receives approved scope/totals but no raw transcript; Internet receives item list and zone but no client personal data; every serialized packet remains under 12.000 characters.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run daemon/puente-cotizador/paquete-contexto.test.ts`

Expected: FAIL because package builder does not exist.

- [ ] **Step 3: Implement role field allowlists**

Define immutable field maps per role. Reject packets over the limit with `PaqueteExcedeLimiteError` and report the largest fields rather than truncating silently.

- [ ] **Step 4: Implement strict role envelope**

Every role returns:

```ts
type ResultadoRol<T> = {
  version: 1;
  rol: RolCotizador;
  estado: "completa" | "esperando_dato" | "error";
  datos: T | null;
  dudas: Array<{ texto: string; material: boolean }>;
  fuentes: Array<{ titulo: string; url?: string; fecha: string }>;
};
```

Strip code fences, parse exactly one JSON object and reject extra prose.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run daemon/puente-cotizador/paquete-contexto.test.ts`

Expected: all tests PASS.

```bash
git add daemon/puente-cotizador
git commit -m "feat(cotizador): limitar contexto y normalizar salidas de roles"
```

### Task 4: Diagnosticador único con vistas cliente y Fran

**Files:**
- Create: `daemon/puente-cotizador/agentes/diagnosticador.ts`
- Create: `daemon/puente-cotizador/agentes/plantillas-diagnostico.ts`
- Create: `daemon/puente-cotizador/agentes/diagnosticador.test.ts`

**Interfaces:**
- Consumes: `PaqueteRol<'diagnosticador'>`, `correrFable` injected.
- Produces: `DiagnosticoTecnico` plus `VistaCliente` and `FichaFran` derived by pure functions.

- [ ] **Step 1: Write failing derivation tests**

Verify both views contain the same `alcance_id`, total surface and task IDs; client view excludes technical dosage; Fran view includes tasks, replacements, access and quote points; neither can override the technical object.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run daemon/puente-cotizador/agentes/diagnosticador.test.ts`

Expected: FAIL because diagnosticador does not exist.

- [ ] **Step 3: Implement diagnostic prompt and validation**

Prompt order: evidence, measured facts, Seia/manufacturer method, observed/inferred/pending distinction, scope separation. Require stable IDs for surfaces and tasks. A material missing dimension returns `esperando_dato`; visual uncertainty stays in `dudas` without inventing.

- [ ] **Step 4: Implement pure audience templates**

`crearVistaCliente(diagnostico)` and `crearFichaFran(diagnostico)` must derive values, never ask the model to rewrite numbers. Text paragraphs may be model-written only after numeric fields are locked and checked.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run daemon/puente-cotizador/agentes/diagnosticador.test.ts`

Expected: all tests PASS.

```bash
git add daemon/puente-cotizador/agentes
git commit -m "feat(cotizador): generar diagnóstico único para cliente y Fran"
```

### Task 5: Investigación paralela Internet y SISMAT

**Files:**
- Create: `daemon/puente-cotizador/agentes/precios-internet.ts`
- Create: `daemon/puente-cotizador/agentes/sismat.ts`
- Create: `daemon/puente-cotizador/agentes/precios.test.ts`

**Interfaces:**
- `investigarInternet(paquete, correrCodex): Promise<ResultadoRol<FuentePrecioNormalizada[]>>`.
- `buscarSismat(paquete, execFile): Promise<ResultadoRol<FuentePrecioNormalizada[]>>`.
- `investigarPrecios(...)` returns both results using `Promise.allSettled`.

- [ ] **Step 1: Write failing normalization tests**

Test unit mismatch rejection, absent SISMAT result labeled `ausente`, approximate match preserving original SISMAT description, Internet source requiring URL/date/tax/freight notes, and one failed worker not deleting the other's result.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run daemon/puente-cotizador/agentes/precios.test.ts`

Expected: FAIL because workers do not exist.

- [ ] **Step 3: Implement Internet role**

Use `correrCodex` with one batched query packet. Reject marketplace placeholders, prices without unit, and sources older than configured expiry. Return each price with `coincidencia: 'exacta'|'aproximada'|'ausente'`.

- [ ] **Step 4: Implement deterministic SISMAT adapter**

Execute `python3 /Users/ezeotero/Obsidian/RAVN/Conocimiento/Precios/sismat/buscar.py <term> --solo mat|mo` using argument arrays, not shell strings. Parse output without renaming descriptions. Search aliases from task/item names and deduplicate by SISMAT ID.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run daemon/puente-cotizador/agentes/precios.test.ts`

Expected: all tests PASS.

```bash
git add daemon/puente-cotizador/agentes
git commit -m "feat(cotizador): investigar Internet y SISMAT en paralelo"
```

### Task 6: Cotizador y motor determinístico

**Files:**
- Create: `daemon/puente-cotizador/agentes/cotizador.ts`
- Create: `daemon/puente-cotizador/agentes/cotizador.test.ts`
- Modify: `scripts/cotizador/instanciar.ts`

**Interfaces:**
- Produces: `seleccionarReferencias(expediente, internet, sismat) -> SeleccionPrecios`.
- Produces: `ejecutarMotor(entrada: EntradaCotizacion) -> CotizacionCalculada` through child process with JSON stdin/stdout.

- [ ] **Step 1: Write failing selection tests**

Test exact beats approximate, Eze price beats all, divergences over 25% create review doubt, absent source remains visible, and no role calculates subtotal.

- [ ] **Step 2: Add CLI machine-readable error test**

Invalid parameters must return exit `2` and JSON `{"ok":false,"tipo":"faltan_parametros","faltan":[...]}` on stderr without a stack trace.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run daemon/puente-cotizador/agentes/cotizador.test.ts src/lib/cotizador/__tests__/cotizar.test.ts`

Expected: FAIL on new behavior.

- [ ] **Step 4: Implement selection without arithmetic**

The cotizador role chooses source IDs, recipe, zone factor policy and explicit doubts. Build `EntradaCotizacion`; invoke `scripts/cotizador/instanciar.ts`; accept totals only from its JSON output.

- [ ] **Step 5: Implement CLI errors and run tests**

Run: `npx vitest run daemon/puente-cotizador/agentes/cotizador.test.ts src/lib/cotizador/__tests__/cotizar.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add daemon/puente-cotizador/agentes/cotizador.ts daemon/puente-cotizador/agentes/cotizador.test.ts scripts/cotizador/instanciar.ts
git commit -m "feat(cotizador): seleccionar fuentes y ejecutar motor sin cuentas IA"
```

### Task 7: Propuesta y revisión final

**Files:**
- Create: `daemon/puente-cotizador/agentes/redactor.ts`
- Create: `daemon/puente-cotizador/agentes/revisor.ts`
- Create: `daemon/puente-cotizador/agentes/propuesta.test.ts`

**Interfaces:**
- `redactarPropuesta(paquete, correrFable) -> ResultadoRol<DocumentoBorrador>`.
- `revisarExpediente(expediente) -> ResultadoRevision` pure deterministic checks plus optional prose summary.

- [ ] **Step 1: Write failing immutability/review tests**

Test proposal cannot introduce an item/task ID, change surface or change totals; review catches mismatch between client and Fran, expired prices, missing source, unresolved material doubt and a state other than `borrador`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run daemon/puente-cotizador/agentes/propuesta.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement redactor with locked facts**

Send immutable facts in a separate JSON field and compare the returned document's `alcance_id`, task IDs and economic snapshot to the input. Reject on any difference. Mark `emitido: false` unconditionally.

- [ ] **Step 4: Implement deterministic reviewer**

Return checks with IDs: `MISMO_ALCANCE`, `MISMO_METRAJE`, `FUENTES_VIGENTES`, `MOTOR_REPRODUCIBLE`, `PROPUESTA_NO_EMITIDA`, `ESTADO_SEGURO`, `ESPEJO_VAULT`. Only all `ok` allows the orchestrator to request `en_revision`.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run daemon/puente-cotizador/agentes/propuesta.test.ts`

Expected: all tests PASS.

```bash
git add daemon/puente-cotizador/agentes
git commit -m "feat(cotizador): redactar propuesta bloqueada y revisar coherencia"
```

### Task 8: Orquestador e integración con el puente

**Files:**
- Create: `daemon/puente-cotizador/orquestador.ts`
- Create: `daemon/puente-cotizador/orquestador.test.ts`
- Modify: `daemon/puente-cotizador/puente.ts`
- Modify: `daemon/puente-cotizador/prompt-sistema.md`

**Interfaces:**
- Produces: `ejecutarFlujo(cotizacionId, deps) -> Promise<ResultadoFlujo>`.
- Trigger: `cotizacion_mensajes.meta.tipo === 'flujo_completo'` or parsed directive `accion: 'flujo_completo'`.

- [ ] **Step 1: Write failing orchestrator tests**

Test exact stage order; Internet/SISMAT overlap; material doubt stops before motor; retry resumes at failed stage; completed stage with same input hash is reused; final update is exactly `borrador → en_revision`; no code path writes `aprobada` or `documento_emitido`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run daemon/puente-cotizador/orquestador.test.ts`

Expected: FAIL because orchestrator does not exist.

- [ ] **Step 3: Implement state machine**

Sequence: load quote and memory packet; ensure stage rows; diagnostic; parallel price stages; single grouped question if needed; price selection and motor; proposal; deterministic review; write App/Vault; re-query all states. Persist stage output after each successful boundary.

- [ ] **Step 4: Integrate without breaking chat mode**

Existing `busqueda` conversation behavior remains unchanged. Add action field to protocol as optional: `{"mensaje":"...","busqueda":null,"accion":null|'flujo_completo'}`. A system trigger launches the flow through the same per-quotation queue.

- [ ] **Step 5: Run bridge tests**

Run: `npx vitest run daemon/puente-cotizador/*.test.ts daemon/puente-cotizador/agentes/*.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add daemon/puente-cotizador
git commit -m "feat(cotizador): orquestar flujo multiagente reanudable"
```

### Task 9: API y visibilidad en la mesa

**Files:**
- Create: `src/app/api/cotizaciones/[id]/etapas/route.ts`
- Create: `src/app/cotizaciones/[id]/revision/flujo-agentes.tsx`
- Create: `src/app/cotizaciones/[id]/revision/flujo-agentes.test.tsx`
- Modify: `src/app/cotizaciones/[id]/revision/revision-screen.tsx`

**Interfaces:**
- GET returns ordered stages and safe summaries; POST action `iniciar` inserts system message `meta.tipo='flujo_completo'` only when quote is `borrador`.

- [ ] **Step 1: Write failing API tests**

Test unauthorized access, missing quote, non-draft conflict, ordered stages and no raw prompts/transcripts in response.

- [ ] **Step 2: Write failing component tests**

Test labels: `Diagnóstico`, `Precios Internet`, `SISMAT`, `Motor`, `Propuesta`, `Revisión`; show running/error/waiting text; start button disabled outside draft.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run src/app/cotizaciones/[id]/revision/flujo-agentes.test.tsx`

Expected: FAIL because route/component do not exist.

- [ ] **Step 4: Implement route and component**

Use authenticated Supabase server client, validate UUID, select only safe columns, and use existing Realtime hook to refresh. Do not expose role prompts, raw transcripts or secrets.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/app/cotizaciones/[id]/revision/flujo-agentes.test.tsx`

Expected: all tests PASS.

```bash
git add src/app/api/cotizaciones src/app/cotizaciones/[id]/revision
git commit -m "feat(cotizador): mostrar avance multiagente en la mesa"
```

### Task 10: End-to-end verification and controlled deployment

**Files:**
- Modify: `daemon/puente-cotizador/install.sh`
- Modify: `daemon/puente-cotizador/run-puente.sh`
- Create: `daemon/puente-cotizador/VERIFICACION-MULTIAGENTE.md`

**Interfaces:**
- Verifies local bridge, Supabase migration, App API, Vault mirror and safe state transitions.

- [ ] **Step 1: Run all focused tests**

Run: `npx vitest run src/lib/cotizador daemon/puente-cotizador src/app/cotizaciones/[id]/revision/flujo-agentes.test.tsx`

Expected: 0 failed.

- [ ] **Step 2: Run full project checks**

Run: `npm test`

Expected: 0 failed.

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 3: Reconcile migration history before applying**

Compare local and remote migration lists. If they diverge, stop and reconcile; never run a blind `supabase db push`. Apply only `20260808120000_cotizacion_etapas.sql` through the approved path, then re-list migrations and table policies.

- [ ] **Step 4: Install local bridge after backup**

Stop only the existing `com.ravn.puente-cotizador` service, back up `~/.ravn-puente`, install, start one instance, and verify one current heartbeat. Never run a parallel bridge.

- [ ] **Step 5: Execute one synthetic draft**

Create a clearly named `PRUEBA — flujo multiagente`, attach fixture evidence, run the full pipeline, answer one synthetic material doubt, and verify:

- client and Fran share scope/metrage IDs;
- Internet and SISMAT outputs have provenance;
- engine output reproduces from saved input;
- proposal is unissued;
- state becomes `en_revision`, never approved;
- Vault closure is retrievable by both Codex and Claude.

- [ ] **Step 6: Clean synthetic data recoverably**

Move test attachments to the app's trash mechanism or mark the quote rejected as synthetic according to existing retention rules. Do not hard-delete production records.

- [ ] **Step 7: Deploy App RAVN once**

Recompare the principal checkout branch, commit and dirty state. Merge only reviewed commits, run checks again, deploy once through the project's current Vercel path, and verify the authenticated production route plus Supabase state.

- [ ] **Step 8: Document evidence and commit**

Record test IDs, timestamps, state queries, Vault paths and deployment URL in `VERIFICACION-MULTIAGENTE.md` without secrets.

```bash
git add daemon/puente-cotizador/VERIFICACION-MULTIAGENTE.md daemon/puente-cotizador/install.sh daemon/puente-cotizador/run-puente.sh
git commit -m "docs(cotizador): verificar flujo multiagente punta a punta"
```
