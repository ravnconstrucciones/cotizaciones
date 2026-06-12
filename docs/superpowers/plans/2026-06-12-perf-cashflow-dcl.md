# Perf /cashflow DCL 4.2s → <1.5s Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir el DCL de `/cashflow` de 4.2s a <1.5s caliente local eliminando el tercer round-trip DB en el endpoint `/cashflow/resumen`.

**Architecture:** El screen ya usa el patrón correcto (PrefetchDatos + fetchCompartido + Cache-Control). El cuello de botella está en el servidor: `resumen/route.ts` tiene 3 round-trips DB **secuenciales** donde los últimos dos (`presupuestos_gastos` y `movimientos_anulados_recientes`) son independientes entre sí y pueden correr en paralelo. Paralelizarlos elimina un round-trip completo del critical path.

**Tech Stack:** Next.js 15 Route Handler (TypeScript), Supabase JS Client, Playwright (medición before/after), Vitest 4.

---

## Diagnóstico de la causa raíz

### Dependency graph actual (secuencial)

```
RT1: Promise.all(
       UPDATE cashflow_items vencidos,
       SELECT cashflow_items (items),
       SELECT obras + presupuestos (obras)
     )                                          ← ~Xms
  ↓ produce: obrasAprobadasTodas, saldoObraIds, presIdsAll, rows
RT2: SELECT presupuestos_gastos                 ← ~Xms  (espera RT1)
  ↓ produce: gastosRows
RT3: SELECT cashflow_items deleted_at (anulados) ← ~Xms (espera RT2, pero NO necesita gastosRows)
  ↓ produce: movimientos_anulados_recientes
Cómputo + response
```

### Dependency graph correcto (paralelo)

```
RT1: Promise.all(update, items, obras)          ← ~Xms
  ↓
RT2: Promise.all(
       SELECT presupuestos_gastos,               ← necesita presIdsAll (RT1)
       SELECT cashflow_items anulados            ← necesita saldoObraIds (RT1), NO gastosRows
     )                                          ← ~Xms (solo 1 round-trip, no 2)
Cómputo + response
```

**Ahorro estimado:** 1 round-trip DB completo (~300-800ms dependiendo de la carga de Supabase). Con Cache-Control `stale-while-revalidate`, las navegaciones repetidas ya sirven caché instantáneo.

## File Structure

- Modify: `src/app/cashflow/resumen/route.ts` — paralelizar RT2a y RT2b
- Create: `scripts/perf-cashflow.mjs` — script Playwright para medir DCL antes y después
- No test files nuevos: los 147 tests de caracterización existentes validan que la lógica de cómputo no cambió

---

## Task 1: Medir baseline con Playwright (ANTES)

**Files:**
- Create: `scripts/perf-cashflow.mjs`

- [ ] **Step 1: Verificar que el server local está corriendo**

```bash
curl -s http://localhost:3000/api/health 2>/dev/null || echo "⚠️  Arrancar con: npm run dev"
```

Si no está corriendo, abrirlo en otra terminal antes de continuar:
```bash
# en otra terminal
cd /Users/ezeotero/Documents/ravn && npm run dev
```

Esperar hasta ver `Ready` en la salida.

- [ ] **Step 2: Crear el script de medición**

```javascript
// scripts/perf-cashflow.mjs
// Mide DCL (DOMContentLoaded) y tiempo hasta primer request de /cashflow/resumen.
// Uso: node scripts/perf-cashflow.mjs [--label "ANTES|DESPUES"]
import { chromium } from "playwright";

const label = process.argv[process.argv.indexOf("--label") + 1] ?? "medicion";
const URL = "http://localhost:3000/cashflow";
const RUNS = 3;

// Credenciales de la app (cookie de sesión ya en el browser, o usar login)
const EMAIL = "ravn.construcciones@gmail.com";
const PASSWORD = "RAVN-283580-Mando";

async function medirDCL(page) {
  const timing = await page.evaluate(() =>
    JSON.stringify(window.performance.timing)
  );
  const t = JSON.parse(timing);
  return t.domContentLoadedEventEnd - t.navigationStart;
}

async function medirResumenStart(page) {
  // Cuándo arrancó el fetch de /cashflow/resumen relativo a navigationStart
  const entries = await page.evaluate(() =>
    JSON.stringify(
      performance.getEntriesByType("resource").filter((e) =>
        e.name.includes("/cashflow/resumen")
      )
    )
  );
  const list = JSON.parse(entries);
  if (!list.length) return null;
  // requestStart es relativo a navigationStart implícitamente en PerformanceEntry
  return list[0].requestStart;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Login una vez para tener sesión
  const loginPage = await context.newPage();
  await loginPage.goto("http://localhost:3000/login");
  await loginPage.waitForSelector('input[type="email"]', { timeout: 10000 });
  await loginPage.fill('input[type="email"]', EMAIL);
  await loginPage.fill('input[type="password"]', PASSWORD);
  await loginPage.click('button[type="submit"]');
  await loginPage.waitForURL(/\/(cashflow|$)/, { timeout: 15000 });
  await loginPage.close();

  const dcls = [];
  const resumenStarts = [];

  for (let i = 0; i < RUNS; i++) {
    const page = await context.newPage();
    // Caché caliente: segunda carga en adelante (primera warmup)
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    const dcl = await medirDCL(page);
    const rs = await medirResumenStart(page);
    dcls.push(dcl);
    if (rs != null) resumenStarts.push(rs);
    await page.close();
  }

  await browser.close();

  const avg = (arr) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : "N/A";
  const min = (arr) => (arr.length ? Math.min(...arr) : "N/A");

  console.log(`\n=== ${label} ===`);
  console.log(`DCL (avg ${RUNS} runs): ${avg(dcls)}ms`);
  console.log(`DCL (min):             ${min(dcls)}ms`);
  console.log(`/resumen fetch start (avg): ${avg(resumenStarts)}ms`);
  console.log(`Raw DCLs: [${dcls.join(", ")}]ms`);
  console.log(`Raw resumenStarts: [${resumenStarts.join(", ")}]ms`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Ejecutar medición ANTES**

```bash
cd /Users/ezeotero/Documents/ravn
node scripts/perf-cashflow.mjs --label "ANTES"
```

Anotar los valores de salida. Ejemplo esperado con el bug:
```
=== ANTES ===
DCL (avg 3 runs): 4200ms   ← objetivo bajar a <1500ms caliente
DCL (min):             3900ms
/resumen fetch start (avg): 50ms   ← el prefetch arranca rápido
```

**Si el dev server aún no está listo:** esperar a que aparezca `Ready` y reintentar.

- [ ] **Step 4: Verificar que los 147 tests siguen verdes (baseline)**

```bash
cd /Users/ezeotero/Documents/ravn
npx vitest run
```

Salida esperada:
```
Test Files  20 passed (20)
      Tests  147 passed (147)
```

Si hay fallas, no continuar.

---

## Task 2: Paralelizar RT2 en `resumen/route.ts`

**Files:**
- Modify: `src/app/cashflow/resumen/route.ts:200-427`

- [ ] **Step 1: Leer la sección a modificar**

Las líneas 200-427 de `src/app/cashflow/resumen/route.ts` contienen los dos queries secuenciales:
- Línea 202-210: `presupuestos_gastos` query (necesita `presIdsAll` de RT1)
- Línea 392-427: `movimientos_anulados_recientes` query (necesita `saldoObraIds` de RT1, NO necesita `gastosRows`)

- [ ] **Step 2: Aplicar el cambio — paralelizar los dos queries**

Reemplazar el bloque de líneas 200-427 (desde `const presIdsAll` hasta el cierre del bloque `if (obraIdsSaldoArr.length > 0)`) con la versión paralelizada:

El cambio concreto en `src/app/cashflow/resumen/route.ts`:

**Antes (secuencial):**
```typescript
    const presIdsAll = obrasAprobadasTodas.map((o) => o.presupuesto_id);
    let gastosRows: GastoDb[] = [];
    if (presIdsAll.length > 0) {
      const { data: gData, error: gErr } = await supabase
        .from("presupuestos_gastos")
        .select("id, presupuesto_id, fecha, descripcion, importe")
        .in("presupuesto_id", presIdsAll);
      if (!gErr && gData) {
        gastosRows = gData as GastoDb[];
      }
    }

    const gastosTotalPorObraId = new Map<string, number>();
    // ... (cómputo de gastosTotalPorObraId — líneas 212-221)

    // ... (cómputo de obrasActivas, totGlob, etc — líneas 223-379)

    const conMontoReal = rows.filter(
      (r) =>
        saldoObraIds.has(r.obra_id) &&
        r.monto_real != null &&
        String(r.monto_real).trim() !== ""
    );
    const obraIdsSaldoArr = [...saldoObraIds];
    let movimientos_anulados_recientes: { ... }[] = [];
    if (obraIdsSaldoArr.length > 0) {
      const { data: rawAnul, error: errAnul } = await supabase
        .from("cashflow_items")
        .select("id, obra_id, tipo, descripcion, monto_real, fecha_real, deleted_at")
        .in("obra_id", obraIdsSaldoArr)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(25);
      // ...
    }
```

**Después (paralelo):** Se lanza el query de anulados junto con el de gastos, ambos después de RT1.

Editar `src/app/cashflow/resumen/route.ts`: reemplazar desde `const presIdsAll` hasta el final del bloque `movimientos_anulados_recientes` con el siguiente bloque que usa `Promise.all`:

```typescript
    const presIdsAll = obrasAprobadasTodas.map((o) => o.presupuesto_id);
    const obraIdsSaldoArr = [...saldoObraIds];

    // RT2: presupuestos_gastos y anulados_recientes son independientes entre sí
    // (ambos solo necesitan datos de RT1). Los lanzamos en paralelo.
    const [gastosResult, anuladosResult] = await Promise.all([
      presIdsAll.length > 0
        ? supabase
            .from("presupuestos_gastos")
            .select("id, presupuesto_id, fecha, descripcion, importe")
            .in("presupuesto_id", presIdsAll)
        : Promise.resolve({ data: [] as GastoDb[], error: null }),
      obraIdsSaldoArr.length > 0
        ? supabase
            .from("cashflow_items")
            .select(
              "id, obra_id, tipo, descripcion, monto_real, fecha_real, deleted_at"
            )
            .in("obra_id", obraIdsSaldoArr)
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false })
            .limit(25)
        : Promise.resolve({
            data: [] as {
              id: string;
              obra_id: string;
              tipo: string;
              descripcion: string | null;
              monto_real: unknown;
              fecha_real: string | null;
              deleted_at: string;
            }[],
            error: null,
          }),
    ]);

    let gastosRows: GastoDb[] = [];
    if (!gastosResult.error && gastosResult.data) {
      gastosRows = gastosResult.data as GastoDb[];
    }

    let movimientos_anulados_recientes: {
      id: string;
      obra_id: string;
      nombre_obra: string;
      tipo: "ingreso" | "egreso";
      descripcion: string;
      monto_real: number;
      fecha_real: string;
      deleted_at: string;
    }[] = [];
    if (!anuladosResult.error && anuladosResult.data) {
      movimientos_anulados_recientes = (
        anuladosResult.data as {
          id: string;
          obra_id: string;
          tipo: string;
          descripcion: string | null;
          monto_real: unknown;
          fecha_real: string | null;
          deleted_at: string;
        }[]
      ).map((r) => ({
        id: String(r.id),
        obra_id: String(r.obra_id),
        nombre_obra: nombrePorObraId.get(String(r.obra_id)) ?? "Obra",
        tipo: r.tipo === "egreso" ? ("egreso" as const) : ("ingreso" as const),
        descripcion: String(r.descripcion ?? ""),
        monto_real:
          r.monto_real == null ? 0 : roundArs2(parseNum(r.monto_real)),
        fecha_real: r.fecha_real
          ? String(r.fecha_real).slice(0, 10)
          : "",
        deleted_at: String(r.deleted_at),
      }));
    }
```

- [ ] **Step 3: Aplicar el cambio con la herramienta Edit**

El cambio tiene dos partes:

**Parte A:** Reemplazar el bloque de queries de `presupuestos_gastos` (líneas 200-210) para que quede como declaración de `presIdsAll` + `obraIdsSaldoArr` + `Promise.all`.

**Parte B:** Eliminar el bloque `movimientos_anulados_recientes` de las líneas 381-427 (el que tenía el segundo `await` secuencial) — ya estará incluido en el `Promise.all` de arriba.

Usar la herramienta `Edit` del agente con:

`old_string`:
```typescript
    const presIdsAll = obrasAprobadasTodas.map((o) => o.presupuesto_id);
    let gastosRows: GastoDb[] = [];
    if (presIdsAll.length > 0) {
      const { data: gData, error: gErr } = await supabase
        .from("presupuestos_gastos")
        .select("id, presupuesto_id, fecha, descripcion, importe")
        .in("presupuesto_id", presIdsAll);
      if (!gErr && gData) {
        gastosRows = gData as GastoDb[];
      }
    }
```

`new_string`:
```typescript
    const presIdsAll = obrasAprobadasTodas.map((o) => o.presupuesto_id);
    const obraIdsSaldoArr = [...saldoObraIds];

    // RT2: presupuestos_gastos y anulados_recientes son independientes entre sí
    // (ambos solo necesitan datos de RT1). Los lanzamos en paralelo.
    const [gastosResult, anuladosResult] = await Promise.all([
      presIdsAll.length > 0
        ? supabase
            .from("presupuestos_gastos")
            .select("id, presupuesto_id, fecha, descripcion, importe")
            .in("presupuesto_id", presIdsAll)
        : Promise.resolve({ data: [] as GastoDb[], error: null }),
      obraIdsSaldoArr.length > 0
        ? supabase
            .from("cashflow_items")
            .select(
              "id, obra_id, tipo, descripcion, monto_real, fecha_real, deleted_at"
            )
            .in("obra_id", obraIdsSaldoArr)
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false })
            .limit(25)
        : Promise.resolve({
            data: [] as {
              id: string;
              obra_id: string;
              tipo: string;
              descripcion: string | null;
              monto_real: unknown;
              fecha_real: string | null;
              deleted_at: string;
            }[],
            error: null,
          }),
    ]);

    let gastosRows: GastoDb[] = [];
    if (!gastosResult.error && gastosResult.data) {
      gastosRows = gastosResult.data as GastoDb[];
    }
```

Segundo `Edit` — eliminar el bloque secuencial de anulados (líneas 381-427):

`old_string`:
```typescript
    const conMontoReal = rows.filter(
      (r) =>
        saldoObraIds.has(r.obra_id) &&
        r.monto_real != null &&
        String(r.monto_real).trim() !== ""
    );
    const obraIdsSaldoArr = [...saldoObraIds];
    let movimientos_anulados_recientes: {
      id: string;
      obra_id: string;
      nombre_obra: string;
      tipo: "ingreso" | "egreso";
      descripcion: string;
      monto_real: number;
      fecha_real: string;
      deleted_at: string;
    }[] = [];
    if (obraIdsSaldoArr.length > 0) {
      const { data: rawAnul, error: errAnul } = await supabase
        .from("cashflow_items")
        .select(
          "id, obra_id, tipo, descripcion, monto_real, fecha_real, deleted_at"
        )
        .in("obra_id", obraIdsSaldoArr)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(25);
      if (!errAnul && rawAnul) {
        movimientos_anulados_recientes = (
          rawAnul as {
            id: string;
            obra_id: string;
            tipo: string;
            descripcion: string | null;
            monto_real: unknown;
            fecha_real: string | null;
            deleted_at: string;
          }[]
        ).map((r) => ({
          id: String(r.id),
          obra_id: String(r.obra_id),
          nombre_obra: nombrePorObraId.get(String(r.obra_id)) ?? "Obra",
          tipo: r.tipo === "egreso" ? ("egreso" as const) : ("ingreso" as const),
          descripcion: String(r.descripcion ?? ""),
          monto_real:
            r.monto_real == null ? 0 : roundArs2(parseNum(r.monto_real)),
          fecha_real: r.fecha_real
            ? String(r.fecha_real).slice(0, 10)
            : "",
          deleted_at: String(r.deleted_at),
        }));
      }
    }
```

`new_string`:
```typescript
    const conMontoReal = rows.filter(
      (r) =>
        saldoObraIds.has(r.obra_id) &&
        r.monto_real != null &&
        String(r.monto_real).trim() !== ""
    );

    let movimientos_anulados_recientes: {
      id: string;
      obra_id: string;
      nombre_obra: string;
      tipo: "ingreso" | "egreso";
      descripcion: string;
      monto_real: number;
      fecha_real: string;
      deleted_at: string;
    }[] = [];
    if (!anuladosResult.error && anuladosResult.data) {
      movimientos_anulados_recientes = (
        anuladosResult.data as {
          id: string;
          obra_id: string;
          tipo: string;
          descripcion: string | null;
          monto_real: unknown;
          fecha_real: string | null;
          deleted_at: string;
        }[]
      ).map((r) => ({
        id: String(r.id),
        obra_id: String(r.obra_id),
        nombre_obra: nombrePorObraId.get(String(r.obra_id)) ?? "Obra",
        tipo: r.tipo === "egreso" ? ("egreso" as const) : ("ingreso" as const),
        descripcion: String(r.descripcion ?? ""),
        monto_real:
          r.monto_real == null ? 0 : roundArs2(parseNum(r.monto_real)),
        fecha_real: r.fecha_real
          ? String(r.fecha_real).slice(0, 10)
          : "",
        deleted_at: String(r.deleted_at),
      }));
    }
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd /Users/ezeotero/Documents/ravn
npx tsc --noEmit
```

Salida esperada: ningún error. Si hay error de tipos en `gastosResult.data`, revisar el cast — el tipo `GastoDb[]` puede necesitar `as unknown as GastoDb[]` si el Supabase client retorna `GastoDb[] | null`.

Si tsc reporta:
```
error TS2322: Type 'GastoDb[] | null' is not assignable to type 'GastoDb[]'
```
Entonces cambiar:
```typescript
    if (!gastosResult.error && gastosResult.data) {
      gastosRows = gastosResult.data as unknown as GastoDb[];
    }
```

- [ ] **Step 5: Verificar los 147 tests siguen verdes**

```bash
cd /Users/ezeotero/Documents/ravn
npx vitest run
```

Salida esperada:
```
Test Files  20 passed (20)
      Tests  147 passed (147)
```

Si hay fallas en tests de `cashflow-compute`, revisar que no se cambió accidentalmente lógica de cómputo (el cambio solo toca queries y su orden de ejecución, no los algoritmos).

---

## Task 3: Medir DESPUÉS con Playwright

**Files:**
- Use: `scripts/perf-cashflow.mjs` (ya creado)

- [ ] **Step 1: Reiniciar el dev server para que Next.js recompile la ruta**

Si el dev server sigue corriendo, el hot-reload debería haberse disparado ya al guardar. Verificar en la terminal del servidor que aparece algo como `✓ Compiled /cashflow/resumen/route`.

Si no lo ves, hacer ctrl+C en el servidor y relanzar:
```bash
cd /Users/ezeotero/Documents/ravn && npm run dev
```

- [ ] **Step 2: Ejecutar medición DESPUÉS**

```bash
cd /Users/ezeotero/Documents/ravn
node scripts/perf-cashflow.mjs --label "DESPUES"
```

Comparar con la medición ANTES. El objetivo es DCL avg < 1500ms caliente.

Ejemplo de salida esperada:
```
=== DESPUES ===
DCL (avg 3 runs): 1100ms   ← objetivo cumplido
DCL (min):             980ms
/resumen fetch start (avg): 50ms
```

- [ ] **Step 3: Si el objetivo no se cumple, investigar el cuello restante**

Si el DCL sigue > 1500ms, revisar la salida del dev server buscando cuánto tarda el handler:
```bash
# Medir directamente el endpoint (sin overhead de browser)
time curl -s -b "$(cat /tmp/ravn-cookies.txt 2>/dev/null || echo "")" \
  http://localhost:3000/cashflow/resumen | python3 -c "import sys,json; j=json.load(sys.stdin); print('obras:', len(j.get('obras_activas',[])), 'mov:', len(j.get('movimientos_recientes',[])))"
```

Si el handler tarda > 800ms, el cuello es Supabase (latencia de red a la instancia). En ese caso, la mejora del plan ya está aplicada y el 4.2s del deploy se explica por cold start + red. Reportar en el commit.

---

## Task 4: Commit atómico

**Files:**
- `src/app/cashflow/resumen/route.ts`
- `scripts/perf-cashflow.mjs`

- [ ] **Step 1: Verificar estado del repo**

```bash
cd /Users/ezeotero/Documents/ravn
git status
git diff --stat
```

Solo deben aparecer los dos archivos del plan: `src/app/cashflow/resumen/route.ts` y `scripts/perf-cashflow.mjs`. El plan mismo (`docs/superpowers/plans/2026-06-12-perf-cashflow-dcl.md`) también puede incluirse.

- [ ] **Step 2: Stagear los archivos**

```bash
cd /Users/ezeotero/Documents/ravn
git add src/app/cashflow/resumen/route.ts scripts/perf-cashflow.mjs docs/superpowers/plans/2026-06-12-perf-cashflow-dcl.md
```

- [ ] **Step 3: Commit**

```bash
cd /Users/ezeotero/Documents/ravn
git commit -m "$(cat <<'EOF'
perf(cashflow): paralelizar RT2 en /cashflow/resumen (-1 round-trip DB)

presupuestos_gastos y movimientos_anulados_recientes eran secuenciales
pese a ser independientes entre sí (ambos solo necesitan datos de RT1).
Promise.all elimina uno de los dos round-trips del critical path.

Antes: RT1 → RT2a → RT2b → respuesta  (~4.2s DCL en deploy)
Después: RT1 → Promise.all(RT2a, RT2b) → respuesta

147 tests verdes. Sin cambios en lógica de cómputo.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Verificar el commit**

```bash
cd /Users/ezeotero/Documents/ravn
git show --stat HEAD
```

Debe mostrar solo los archivos incluidos en el stage.

---

## Self-Review

### Spec coverage
- [x] Diagnóstico con Playwright local midiendo cuándo arranca cada request → Task 1 + Task 3
- [x] Verificar si `/cashflow` tiene el patrón PrefetchDatos + fetchCompartido → Task 1 Step 1 (diagnóstico ya hecho en escritura del plan: SÍ lo tiene en page.tsx + screen.tsx)
- [x] Verificar si la pantalla hace fetches propios en cascada post-hidratación → diagnóstico: NO, solo `fetchCompartido` + 3 actions (mutations). La cascada está en el route handler.
- [x] Aplicar el mismo patrón paralelizar → Task 2
- [x] Cache-Control donde sea seguro → ya aplicado en la ronda anterior (`private, max-age=15, stale-while-revalidate=60`). No tocar.
- [x] Medir antes/después (objetivo <1.5s caliente local) → Task 1 + Task 3
- [x] NO tocar lógica de cálculo → Task 2 solo mueve queries, no algoritmos
- [x] npx vitest run verde (147) → Task 1 Step 4 + Task 2 Step 5
- [x] tsc limpio → Task 2 Step 4
- [x] Commit atómico, NO push → Task 4

### Placeholder scan
Ningún TBD, TODO, o "similar a Task N" sin código.

### Type consistency
`gastosRows` sigue siendo `GastoDb[]` en todo el archivo. `movimientos_anulados_recientes` mantiene el mismo tipo inline. `anuladosResult` y `gastosResult` son los resultados del `Promise.all`. Consistente.

### Nota sobre la causa raíz en deploy vs local

En el deploy (Vercel + Supabase cloud), el 4.2s DCL incluye:
- Cold start del Edge/Serverless function
- 3 round-trips a Supabase (cada uno ~200-400ms de red transatlántica)
- Prefetch inline no puede eliminar el tiempo del servidor

Esta mejora elimina 1 round-trip completo (~200-400ms) y es el fix correcto. Si después del fix el DCL caliente local es ~1s pero en deploy sigue alto (~2-3s caliente), el próximo paso sería agregar `export const dynamic = "force-dynamic"` con revalidación ISR o mover el endpoint a Edge Runtime para eliminar cold starts — pero eso está fuera del scope de esta ronda.
