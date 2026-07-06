# Módulo Dinero — Fase 2: espejo total (app+bot), RPC asentar y foto inicial

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que TODO movimiento de plata — cargado por bot o por app — termine en el ledger `movimientos_plata` con su bolsillo (paridad total, decisión de Eze 06/07), con el bot pasando a borrador→confirmo y el RPC `dinero_asentar_grupo` como único camino del bot a `asentado`; y dejar hecha la foto inicial de bolsillos.

**Architecture:** Tres piezas. (1) **Base**: dos RPC security definer (`dinero_asentar_grupo`, `dinero_descartar_grupo`) + cierre del agujero de insert del bot. (2) **App**: una lib de espejo (`dinero-espejo.ts` reglas puras + `dinero-sync.ts` sincronizador idempotente) llamada desde cada punto de escritura de plata de la app — escribe `asentado` directo (la app ES la confirmación de Eze). (3) **Bot**: flujo checklist borrador→confirmo (`dineroFlujo.js`) para gasto/transferencia/arqueo, que inserta el grupo `borrador`, muestra resumen y con "confirmo" inserta el detalle + asienta por RPC (con financiamiento si cruza dueños). La foto inicial se hace en sesión guiada con Eze ANTES de deployar los espejos.

**Tech Stack:** Postgres/Supabase (plpgsql, RLS), Next.js 15 (route handlers service-role), TypeScript + vitest (app), Node.js CommonJS + node:test (bot).

## Global Constraints

- Repo app: `/Users/ezeotero/Documents/ravn`, branch `home-cards`. Repo bot: `/Users/ezeotero/Documents/ravn-bots`, branch `main` (push a main = deploy Railway; NO pushear hasta la Task 10).
- Migraciones: archivo local en `supabase/migrations/` **y** aplicada en prod vía MCP `apply_migration` (mismo patrón Fase 1). Después de aplicar: `get_advisors` sin findings nuevos.
- **El código suma; la IA no.** Montos y patas los arma código determinístico, nunca Haiku.
- **Solo `asentado` suma.** El bot solo puede insertar `borrador` (policy); su único camino a `asentado` es `dinero_asentar_grupo`.
- **El espejo replica EXACTO las reglas del motor actual** (`src/lib/cuentas.ts::saldosPorCuenta`), incluidas sus limitaciones (gasto empresa cross-moneda = 0 patas; cashflow sin monto en la moneda de la cuenta = 0). Invariante de convivencia: `chequeoConsistencia` (F1) da verde.
- Nada se asienta sin foto inicial previa (guard en el RPC y en el sync) — decisión de Eze 07/07.
- Sin triggers para el espejo (spec): lo escribe app/bot en el punto de escritura.
- Tests: app `pnpm vitest run` (suite hoy: 381 verdes), bot `npm test` (node --test). TDD por task.
- Convención de nombres/comentarios en castellano, estilo de la casa (ver `src/lib/dinero.ts` y `src/saldos.js` del bot).
- Cada task termina revisada (flujo subagent-driven de F1) y el cierre lleva review `ravn-code-reviewer` + verificación en vivo (pedido explícito de Eze).

## Convenciones de diseño de F2 (decisiones cerradas)

1. **Dueños por defecto en escrituras de la app** (la app no pregunta bolsillo en F2; los cruces entre dueños se cargan por bot, que sí pregunta):
   - `presupuestos_gastos` → dueño `obra` = `presupuesto_id`.
   - `cashflow_items` ingreso (cobro) → dueño `obra` (via `obra_id` → `obras.presupuesto_id`); egreso real de libreta → también dueño `obra`, `origen_tipo='gasto_obra'`.
   - `gastos_empresa` → `empresa`. `gastos_personales` → `personal`.
   - `retiros_socio` → `empresa` (retiro resta / aporte suma).
   - `transferencias` → mismo dueño ambas patas: obra de la cuenta destino (`cuentas.obra_id`) si tiene, sino obra de la cuenta origen, sino `empresa`.
2. **origen_tipo por tabla**: `presupuestos_gastos`→`gasto_obra` · `cashflow_items`→`cobro` (ingreso) / `gasto_obra` (egreso) · `gastos_empresa`→`gasto_empresa` · `gastos_personales`→`gasto_personal` · `retiros_socio`→`retiro` · `transferencias`→`transferencia` · `cuenta_ajustes`→`ajuste`. El sync matchea filas existentes por `(origen_id, origen_tipo ∈ tipos-de-la-tabla)`.
3. **Dedup gasto↔libreta** (regla del motor): un `cashflow_items` referenciado por `presupuestos_gastos.cashflow_item_id` NO genera espejo (la cuenta vive en el gasto).
4. **Un gasto = un bolsillo** en el bot F2. El caso volquete (split 90k obra + 60k personal) se carga como DOS gastos. Documentado en el resumen del bot.
5. **Limitaciones conocidas y aceptadas** (quedan visibles vía `chequeoConsistencia`, se concilian con ajuste): editar movimientos pre-foto que ya tenían cuenta; movimientos cargados entre la foto y el deploy de los espejos.
6. El sync **NUNCA** toca grupos que tienen `financiamientos.origen_grupo_id` apuntándoles (son operaciones del bot con libro de deudas): loguea y saltea.
7. El espejo **NUNCA** rompe la operación original: se llama en try/catch, el error se loguea y la respuesta de la ruta sale igual.

## File Structure

**Repo app (`~/Documents/ravn`):**
- Create: `supabase/migrations/20260706130000_dinero_rpc_asentar.sql` — RPCs + policy + índice origen.
- Create: `src/lib/dinero-espejo.ts` + `src/lib/dinero-espejo.test.ts` — reglas puras: detalle → patas.
- Create: `src/lib/dinero-sync.ts` — sincronizador idempotente (server-only, admin client).
- Create: `src/app/api/dinero/espejo/route.ts` — endpoint para las pantallas client-side.
- Create: `scripts/dinero-foto.ts` — saldos del motor + chequeo de consistencia (sesión foto inicial).
- Modify: los 9 write-points de plata (Task 4 y 5) — una llamada al sync en cada uno.

**Repo bot (`~/Documents/ravn-bots`):**
- Create: `src/dinero.js` + `test/dinero.test.js` — armado de patas, bolsillos, resumen.
- Create: `src/dineroFlujo.js` + `test/dinero-flujo.test.js` — máquina de pasos del checklist.
- Modify: `src/supabaseService.js` (wrappers RPC + vista bolsillos), `src/advisorService.js` (casos gasto/transferencia/arqueo delegan al flujo), `src/portero.js` (acciones `dinero_paso`/`dinero_confirmar`/`dinero_cancelar`), `src/preguntasService.js` (captura numérica + cierre custom).

---

### Task 1: Migración — RPCs de asentar/descartar, policy de insert y índice de origen

**Files:**
- Create: `supabase/migrations/20260706130000_dinero_rpc_asentar.sql`

**Interfaces:**
- Produces: `public.dinero_asentar_grupo(p_grupo_id uuid, p_origen_id uuid default null, p_financiamiento jsonb default null) returns jsonb` — `{ya_estaba bool, asentadas int, financiamiento_id uuid|null}`.
- Produces: `public.dinero_descartar_grupo(p_grupo_id uuid) returns integer` (filas borradas).
- Produces: policy de insert que impide al bot insertar `estado='asentado'` (cierra el minor de F1 Task 1).
- Produces: índice `movimientos_plata_origen_idx (origen_tipo, origen_id)`.

- [ ] **Step 1: Escribir la migración completa**

```sql
-- Fase 2 módulo Dinero (spec 2026-07-06, plan 2026-07-06-dinero-fase-2.md).
-- El ÚNICO camino del bot a 'asentado' es dinero_asentar_grupo: valida el
-- grupo (moneda = cuenta), lo asienta ATÓMICO, estampa el origen y crea el
-- financiamiento si la operación cruzó dueños — idempotente por
-- origen_grupo_id (confirmar dos veces no duplica nada).

-- 1) Cerrar el agujero del insert (minor de F1): el bot SOLO inserta borrador.
drop policy movimientos_plata_insert_auth on public.movimientos_plata;
create policy movimientos_plata_insert_auth on public.movimientos_plata
  for insert to authenticated
  with check (not es_bot() or estado = 'borrador');

-- 2) Índice para el sync del espejo (lookup "¿qué patas espejan esta fila?").
create index movimientos_plata_origen_idx
  on public.movimientos_plata (origen_tipo, origen_id)
  where origen_id is not null;

-- 3) Asentar un grupo (bot: "confirmo").
create or replace function public.dinero_asentar_grupo(
  p_grupo_id uuid,
  p_origen_id uuid default null,
  p_financiamiento jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
  v_borrador int;
  v_fin_id uuid;
begin
  -- Decisión de Eze 07/07: nada se asienta sobre bolsillos vacíos.
  if not exists (
    select 1 from movimientos_plata
    where origen_tipo = 'foto_inicial' and estado = 'asentado'
  ) then
    raise exception 'falta la foto inicial: no se asienta nada todavía';
  end if;

  -- Lock del grupo entero (dos confirmaciones simultáneas no se pisan).
  perform 1 from movimientos_plata where grupo_id = p_grupo_id for update;

  select count(*), count(*) filter (where estado = 'borrador')
    into v_filas, v_borrador
  from movimientos_plata where grupo_id = p_grupo_id;

  if v_filas = 0 then
    raise exception 'grupo % inexistente', p_grupo_id;
  end if;

  -- Idempotencia: ya estaba asentado → devolver lo que hay, sin duplicar.
  if v_borrador = 0 then
    select id into v_fin_id from financiamientos
      where origen_grupo_id = p_grupo_id limit 1;
    return jsonb_build_object(
      'ya_estaba', true, 'asentadas', 0, 'financiamiento_id', v_fin_id);
  end if;

  if v_borrador <> v_filas then
    raise exception 'grupo % con estados mixtos: no se asienta', p_grupo_id;
  end if;

  -- Cada pata en la moneda de SU cuenta (validación pedida en el handoff).
  if exists (
    select 1 from movimientos_plata m
    join cuentas c on c.id = m.cuenta_id
    where m.grupo_id = p_grupo_id and m.moneda <> c.moneda
  ) then
    raise exception 'una pata del grupo % no está en la moneda de su cuenta', p_grupo_id;
  end if;

  update movimientos_plata
    set estado = 'asentado',
        origen_id = coalesce(p_origen_id, origen_id)
    where grupo_id = p_grupo_id;

  -- Financiamiento del cruce de dueños, en la MISMA confirmación (spec).
  if p_financiamiento is not null then
    select id into v_fin_id from financiamientos
      where origen_grupo_id = p_grupo_id limit 1;
    if v_fin_id is null then
      if p_financiamiento->>'deudor_tipo' = p_financiamiento->>'acreedor_tipo'
         and coalesce(p_financiamiento->>'deudor_obra_id', '')
             = coalesce(p_financiamiento->>'acreedor_obra_id', '') then
        raise exception 'financiamiento inválido: deudor y acreedor son el mismo dueño';
      end if;
      insert into financiamientos
        (deudor_tipo, deudor_obra_id, acreedor_tipo, acreedor_obra_id,
         monto_original, saldo_pendiente, moneda, origen_grupo_id, notas, updated_at)
      values
        (p_financiamiento->>'deudor_tipo',
         nullif(p_financiamiento->>'deudor_obra_id', '')::uuid,
         p_financiamiento->>'acreedor_tipo',
         nullif(p_financiamiento->>'acreedor_obra_id', '')::uuid,
         (p_financiamiento->>'monto')::numeric,
         (p_financiamiento->>'monto')::numeric,
         p_financiamiento->>'moneda',
         p_grupo_id,
         coalesce(p_financiamiento->>'notas', ''),
         now())
      returning id into v_fin_id;
    end if;
  end if;

  return jsonb_build_object(
    'ya_estaba', false, 'asentadas', v_filas, 'financiamiento_id', v_fin_id);
end;
$$;

comment on function public.dinero_asentar_grupo(uuid, uuid, jsonb) is
  'Asienta un grupo borrador ATÓMICO (bot: "confirmo"). Valida moneda=cuenta, estampa origen_id y crea el financiamiento del cruce si viene (idempotente por origen_grupo_id). Exige foto inicial previa.';

-- 4) Descartar un grupo borrador (bot: "cancelar" — RLS le bloquea DELETE).
create or replace function public.dinero_descartar_grupo(p_grupo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas int;
begin
  delete from movimientos_plata
    where grupo_id = p_grupo_id and estado = 'borrador';
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

comment on function public.dinero_descartar_grupo(uuid) is
  'Borra SOLO las patas borrador de un grupo (cancelación del bot). Lo asentado no se toca jamás.';

revoke all on function public.dinero_asentar_grupo(uuid, uuid, jsonb) from public, anon;
revoke all on function public.dinero_descartar_grupo(uuid) from public, anon;
grant execute on function public.dinero_asentar_grupo(uuid, uuid, jsonb) to authenticated;
grant execute on function public.dinero_descartar_grupo(uuid) to authenticated;
```

- [ ] **Step 2: Aplicar en prod** — MCP `apply_migration` con nombre `dinero_rpc_asentar` y el SQL de arriba. Expected: sin error.

- [ ] **Step 3: Verificar en prod (SQL vivo, patrón cierre F1)** — vía MCP `execute_sql`:
  1. `select dinero_asentar_grupo(gen_random_uuid());` → Expected: ERROR `falta la foto inicial`.
  2. Insertar 1 fila `foto_inicial` asentada de prueba en una cuenta real con monto 0.01, luego: grupo borrador de prueba de 1 pata (misma cuenta, moneda correcta) → `dinero_asentar_grupo(grupo)` → `{ya_estaba:false, asentadas:1}`; repetir la llamada → `{ya_estaba:true}`. Grupo borrador con moneda ≠ cuenta → ERROR de moneda. `dinero_descartar_grupo` sobre un borrador → 1; sobre el asentado → 0.
  3. **Limpiar TODAS las filas de prueba** (delete por grupo_id, incluida la foto de prueba) y verificar `select count(*) from movimientos_plata` = 0.

- [ ] **Step 4: Advisors** — MCP `get_advisors` (security y performance). Expected: sin findings nuevos vs cierre F1.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/ravn && git add supabase/migrations/20260706130000_dinero_rpc_asentar.sql && git commit -m "feat(dinero): RPC asentar/descartar grupo + insert solo-borrador para el bot (Fase 2)"
```

---

### Task 2: `dinero-espejo.ts` — reglas puras detalle → patas (paridad con el motor)

**Files:**
- Create: `src/lib/dinero-espejo.ts`
- Test: `src/lib/dinero-espejo.test.ts`

**Interfaces:**
- Consumes: tipos de `src/lib/cuentas.ts` (`Cuenta`, `Moneda`) y `parseNum`/`roundArs2`.
- Produces: `type PataEspejo = { cuenta_id: string; dueno_tipo: DuenoTipo; dueno_obra_id: string | null; monto: number; moneda: Moneda; fecha: string; descripcion: string }` y las funciones:
  - `filasEspejoGastoObra(g, cuenta): PataEspejo[]`
  - `filasEspejoCashflow(m, cuenta, presupuestoId, esEspejoDeGasto): PataEspejo[]`
  - `filasEspejoGastoEmpresa(g, cuenta): PataEspejo[]`
  - `filasEspejoGastoPersonal(g, cuenta): PataEspejo[]`
  - `filasEspejoRetiro(r, cuenta): PataEspejo[]`
  - `filasEspejoTransferencia(t, cuentaOrigen, cuentaDestino, dueno): PataEspejo[]`

  Regla de oro (documentar en el header del archivo): **cada función devuelve exactamente el delta que `saldosPorCuenta` aplica para esa fila** — si el motor suma 0, acá se devuelven 0 patas.

- [ ] **Step 1: Tests primero.** Casos mínimos (usar cuentas fixture `{id, moneda}`):

```ts
import { describe, expect, it } from "vitest";
import {
  filasEspejoCashflow, filasEspejoGastoEmpresa, filasEspejoGastoObra,
  filasEspejoGastoPersonal, filasEspejoRetiro, filasEspejoTransferencia,
} from "@/lib/dinero-espejo";

const ars = { id: "c-ars", moneda: "ARS" } as const;
const usd = { id: "c-usd", moneda: "USD" } as const;
const base = { fecha: "2026-07-06", descripcion: "x" };

describe("filasEspejoGastoObra", () => {
  it("cuenta ARS: una pata -importe, dueño la obra", () => {
    const patas = filasEspejoGastoObra(
      { id: "g1", presupuesto_id: "p1", importe: "12800", cuenta_id: "c-ars",
        cotizacion_venta_ars_por_usd: null, ...base }, ars);
    expect(patas).toEqual([expect.objectContaining({
      cuenta_id: "c-ars", dueno_tipo: "obra", dueno_obra_id: "p1",
      monto: -12800, moneda: "ARS" })]);
  });
  it("cuenta USD con cotización: -importe/cot en USD", () => {
    const [p] = filasEspejoGastoObra(
      { id: "g2", presupuesto_id: "p1", importe: "150000", cuenta_id: "c-usd",
        cotizacion_venta_ars_por_usd: "1500", ...base }, usd);
    expect(p.monto).toBe(-100);
    expect(p.moneda).toBe("USD");
  });
  it("cuenta USD SIN cotización: 0 patas (regla del motor)", () => {
    expect(filasEspejoGastoObra({ id: "g3", presupuesto_id: "p1", importe: "1000",
      cuenta_id: "c-usd", cotizacion_venta_ars_por_usd: null, ...base }, usd)).toEqual([]);
  });
  it("sin cuenta: 0 patas", () => {
    expect(filasEspejoGastoObra({ id: "g4", presupuesto_id: "p1", importe: "1000",
      cuenta_id: null, ...base }, undefined)).toEqual([]);
  });
});

describe("filasEspejoCashflow", () => {
  it("cobro (ingreso) cuenta ARS: +monto_real, dueño la obra", () => {
    const [p] = filasEspejoCashflow(
      { id: "m1", tipo: "ingreso", monto_real: "500000", monto_usd: null,
        cuenta_id: "c-ars", deleted_at: null, ...base }, ars, "p1", false);
    expect(p).toEqual(expect.objectContaining({ monto: 500000, dueno_tipo: "obra", dueno_obra_id: "p1" }));
  });
  it("cuenta USD usa monto_usd; sin monto_usd → 0 patas", () => {
    expect(filasEspejoCashflow({ id: "m2", tipo: "ingreso", monto_real: "500000",
      monto_usd: null, cuenta_id: "c-usd", deleted_at: null, ...base }, usd, "p1", false)).toEqual([]);
  });
  it("espejo de gasto (dedup) o borrado o sin monto_real: 0 patas", () => {
    const m = { id: "m3", tipo: "egreso", monto_real: "1000", monto_usd: null,
      cuenta_id: "c-ars", deleted_at: null, ...base };
    expect(filasEspejoCashflow(m, ars, "p1", true)).toEqual([]);
    expect(filasEspejoCashflow({ ...m, deleted_at: "2026-07-06" }, ars, "p1", false)).toEqual([]);
    expect(filasEspejoCashflow({ ...m, monto_real: null }, ars, "p1", false)).toEqual([]);
  });
});

describe("empresa / personal / retiro", () => {
  it("gasto empresa cross-moneda: 0 patas (regla del motor)", () => {
    expect(filasEspejoGastoEmpresa({ id: "e1", monto: "20", moneda: "USD",
      cuenta_id: "c-ars", ...base }, ars)).toEqual([]);
  });
  it("gasto empresa misma moneda: -monto dueño empresa", () => {
    const [p] = filasEspejoGastoEmpresa({ id: "e2", monto: "20", moneda: "USD",
      cuenta_id: "c-usd", ...base }, usd);
    expect(p).toEqual(expect.objectContaining({ monto: -20, dueno_tipo: "empresa", dueno_obra_id: null }));
  });
  it("gasto personal: -monto dueño personal", () => {
    const [p] = filasEspejoGastoPersonal({ id: "gp1", monto: "4500", cuenta_id: "c-ars", ...base }, ars);
    expect(p).toEqual(expect.objectContaining({ monto: -4500, dueno_tipo: "personal" }));
  });
  it("retiro resta / aporte suma, dueño empresa", () => {
    expect(filasEspejoRetiro({ id: "r1", tipo: "retiro", monto_ars: "100000", cuenta_id: "c-ars", ...base }, ars)[0].monto).toBe(-100000);
    expect(filasEspejoRetiro({ id: "r2", tipo: "aporte", monto_ars: "100000", cuenta_id: "c-ars", ...base }, ars)[0].monto).toBe(100000);
  });
});

describe("filasEspejoTransferencia", () => {
  it("dos patas, mismo dueño, cada una en la moneda de su cuenta", () => {
    const patas = filasEspejoTransferencia(
      { id: "t1", cuenta_origen_id: "c-ars", cuenta_destino_id: "c-usd",
        monto_origen: "150000", monto_destino: "100", ...base },
      ars, usd, { dueno_tipo: "obra", dueno_obra_id: "p1" });
    expect(patas).toHaveLength(2);
    expect(patas[0]).toEqual(expect.objectContaining({ cuenta_id: "c-ars", monto: -150000, moneda: "ARS", dueno_obra_id: "p1" }));
    expect(patas[1]).toEqual(expect.objectContaining({ cuenta_id: "c-usd", monto: 100, moneda: "USD", dueno_obra_id: "p1" }));
  });
});
```

- [ ] **Step 2: Correr y ver fallar** — `pnpm vitest run src/lib/dinero-espejo.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/dinero-espejo.ts`.** Cada función es un `if`-cascade que copia la regla del motor y arma la pata. Esqueleto completo:

```ts
import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import type { Cuenta, Moneda } from "@/lib/cuentas";
import type { DuenoTipo } from "@/lib/dinero";

/**
 * ESPEJO del módulo Dinero (Fase 2): de una fila de detalle a sus patas del
 * ledger. REGLA DE ORO: cada función devuelve EXACTAMENTE el delta que
 * saldosPorCuenta (cuentas.ts) aplica para esa fila — si el motor suma 0,
 * acá van 0 patas. Es lo que mantiene verde el chequeo de consistencia
 * durante la convivencia. Las taras del motor (empresa cross-moneda, USD sin
 * cotización) se corrigen recién en el switch de Fase 4, no acá.
 */

export type PataEspejo = {
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  monto: number;
  moneda: Moneda;
  fecha: string;
  descripcion: string;
};

type CuentaMin = Pick<Cuenta, "id" | "moneda"> | undefined;

const pata = (
  cuenta: NonNullable<CuentaMin>, dueno_tipo: DuenoTipo,
  dueno_obra_id: string | null, monto: number, fecha: string, descripcion: string
): PataEspejo => ({
  cuenta_id: cuenta.id, dueno_tipo, dueno_obra_id,
  monto, moneda: cuenta.moneda, fecha, descripcion,
});

export function filasEspejoGastoObra(
  g: { presupuesto_id: string; importe: unknown; cuenta_id: string | null;
       cotizacion_venta_ars_por_usd?: unknown; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!g.cuenta_id || !cuenta) return [];
  const importeArs = roundArs2(parseNum(g.importe));
  if (importeArs === 0) return [];
  if (cuenta.moneda === "USD") {
    const cot = parseNum(g.cotizacion_venta_ars_por_usd);
    if (!(cot > 0)) return []; // el motor suma 0 sin cotización
    return [pata(cuenta, "obra", g.presupuesto_id, -roundArs2(importeArs / cot), g.fecha, g.descripcion)];
  }
  return [pata(cuenta, "obra", g.presupuesto_id, -importeArs, g.fecha, g.descripcion)];
}

export function filasEspejoCashflow(
  m: { tipo: string; monto_real: unknown; monto_usd?: unknown;
       cuenta_id: string | null; deleted_at?: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin, presupuestoId: string | null, esEspejoDeGasto: boolean
): PataEspejo[] {
  if (esEspejoDeGasto || m.deleted_at || !m.cuenta_id || !cuenta || !presupuestoId) return [];
  const monto = roundArs2(cuenta.moneda === "USD" ? parseNum(m.monto_usd) : parseNum(m.monto_real));
  if (monto === 0) return [];
  return [pata(cuenta, "obra", presupuestoId, m.tipo === "egreso" ? -monto : monto, m.fecha, m.descripcion)];
}

export function filasEspejoGastoEmpresa(
  g: { monto: unknown; moneda?: string | null; cuenta_id: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!g.cuenta_id || !cuenta) return [];
  const monedaGasto = g.moneda === "USD" ? "USD" : "ARS";
  if (cuenta.moneda !== monedaGasto) return []; // el motor suma 0 en el cruce
  const monto = roundArs2(parseNum(g.monto));
  if (monto === 0) return [];
  return [pata(cuenta, "empresa", null, -monto, g.fecha, g.descripcion)];
}

export function filasEspejoGastoPersonal(
  g: { monto: unknown; cuenta_id: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!g.cuenta_id || !cuenta) return [];
  const monto = roundArs2(parseNum(g.monto));
  if (monto === 0) return [];
  return [pata(cuenta, "personal", null, -monto, g.fecha, g.descripcion)];
}

export function filasEspejoRetiro(
  r: { tipo: string; monto_ars: unknown; cuenta_id: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!r.cuenta_id || !cuenta) return [];
  const monto = roundArs2(parseNum(r.monto_ars));
  if (monto === 0) return [];
  return [pata(cuenta, "empresa", null, r.tipo === "aporte" ? monto : -monto, r.fecha, r.descripcion)];
}

export function filasEspejoTransferencia(
  t: { cuenta_origen_id: string | null; cuenta_destino_id: string | null;
       monto_origen: unknown; monto_destino: unknown; fecha: string; descripcion: string },
  cuentaOrigen: CuentaMin, cuentaDestino: CuentaMin,
  dueno: { dueno_tipo: DuenoTipo; dueno_obra_id: string | null }
): PataEspejo[] {
  const patas: PataEspejo[] = [];
  const mo = roundArs2(parseNum(t.monto_origen));
  const md = roundArs2(parseNum(t.monto_destino));
  if (t.cuenta_origen_id && cuentaOrigen && mo !== 0)
    patas.push(pata(cuentaOrigen, dueno.dueno_tipo, dueno.dueno_obra_id, -mo, t.fecha, t.descripcion));
  if (t.cuenta_destino_id && cuentaDestino && md !== 0)
    patas.push(pata(cuentaDestino, dueno.dueno_tipo, dueno.dueno_obra_id, md, t.fecha, t.descripcion));
  return patas;
}
```

  Nota de firma: los objetos de entrada llevan `fecha` y `descripcion` ya resueltos por el caller (el sync los arma desde la fila de detalle con fallbacks; ver Task 3).

- [ ] **Step 4: Correr y ver pasar** — `pnpm vitest run src/lib/dinero-espejo.test.ts` → PASS; suite completa `pnpm vitest run` → 381+ verdes.

- [ ] **Step 5: Commit** — `git add src/lib/dinero-espejo.ts src/lib/dinero-espejo.test.ts && git commit -m "feat(dinero): reglas puras del espejo detalle→patas (paridad con el motor)"`

---

### Task 3: `dinero-sync.ts` — sincronizador idempotente + endpoint `/api/dinero/espejo`

**Files:**
- Create: `src/lib/dinero-sync.ts`
- Create: `src/app/api/dinero/espejo/route.ts`

**Interfaces:**
- Consumes: `createSupabaseAdminClient()` de `src/lib/supabase/server.ts`; las `filasEspejo*` de Task 2.
- Produces: `sincronizarEspejo(admin: SupabaseClient, tabla: TablaEspejo, id: string): Promise<ResultadoSync>` con `TablaEspejo = 'presupuestos_gastos'|'cashflow_items'|'gastos_empresa'|'gastos_personales'|'retiros_socio'|'transferencias'` y `ResultadoSync = { accion: 'sin_foto'|'igual'|'reescrito'|'salteado_financiamiento'; patas: number }`.
- Produces: `POST /api/dinero/espejo` body `{tabla, id}` → `{ok: true, ...ResultadoSync}` (para las pantallas client-side).

- [ ] **Step 1: Implementar `src/lib/dinero-sync.ts`** (no hay test unitario acá — es I/O puro sobre las reglas ya testeadas; se verifica en vivo en Task 10):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { roundArs2 } from "@/lib/format-currency";
import { parseNum } from "@/lib/cashflow-compute";
import type { PataEspejo } from "@/lib/dinero-espejo";
import {
  filasEspejoCashflow, filasEspejoGastoEmpresa, filasEspejoGastoObra,
  filasEspejoGastoPersonal, filasEspejoRetiro, filasEspejoTransferencia,
} from "@/lib/dinero-espejo";

/**
 * SINCRONIZADOR del espejo (Fase 2): después de CUALQUIER escritura de plata
 * de la app se llama sincronizarEspejo(admin, tabla, id). Relee la fila de
 * detalle, calcula qué patas DEBERÍAN existir (0 si se borró / no tiene
 * cuenta) y reconcilia contra lo que hay en movimientos_plata para ese
 * origen. Idempotente: llamarlo dos veces no cambia nada. La app escribe
 * ASENTADO directo — la app ES la confirmación de Eze; el borrador es cosa
 * del bot. Sin foto inicial el sync es no-op (nada se espeja sobre bolsillos
 * vacíos). NUNCA lanza hacia el caller: los write-points lo llaman en
 * try/catch y la operación original sale igual.
 */

export type TablaEspejo =
  | "presupuestos_gastos" | "cashflow_items" | "gastos_empresa"
  | "gastos_personales" | "retiros_socio" | "transferencias";

export type ResultadoSync = {
  accion: "sin_foto" | "igual" | "reescrito" | "salteado_financiamiento";
  patas: number;
};

const TIPOS_POR_TABLA: Record<TablaEspejo, string[]> = {
  presupuestos_gastos: ["gasto_obra"],
  cashflow_items: ["cobro", "gasto_obra"],
  gastos_empresa: ["gasto_empresa"],
  gastos_personales: ["gasto_personal"],
  retiros_socio: ["retiro"],
  transferencias: ["transferencia"],
};

const hoyIso = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function cuentaDe(admin: SupabaseClient, id: string | null) {
  if (!id) return undefined;
  const { data } = await admin.from("cuentas").select("id, moneda").eq("id", id).maybeSingle();
  return (data as { id: string; moneda: "ARS" | "USD" } | null) ?? undefined;
}

/** Qué patas debería tener hoy esta fila de detalle. Fila borrada → []. */
async function patasEsperadas(
  admin: SupabaseClient, tabla: TablaEspejo, id: string
): Promise<{ patas: PataEspejo[]; origenTipo: string }> {
  switch (tabla) {
    case "presupuestos_gastos": {
      const { data: g } = await admin.from("presupuestos_gastos")
        .select("id, presupuesto_id, importe, cuenta_id, cotizacion_venta_ars_por_usd, fecha, descripcion")
        .eq("id", id).maybeSingle();
      if (!g) return { patas: [], origenTipo: "gasto_obra" };
      const cuenta = await cuentaDe(admin, g.cuenta_id);
      return {
        origenTipo: "gasto_obra",
        patas: filasEspejoGastoObra(
          { ...g, fecha: g.fecha ?? hoyIso(), descripcion: g.descripcion ?? "" }, cuenta),
      };
    }
    case "cashflow_items": {
      const { data: m } = await admin.from("cashflow_items")
        .select("id, obra_id, tipo, monto_real, monto_usd, cuenta_id, deleted_at, fecha_real, fecha_proyectada, descripcion")
        .eq("id", id).maybeSingle();
      const origenTipo = m?.tipo === "egreso" ? "gasto_obra" : "cobro";
      if (!m) return { patas: [], origenTipo: "cobro" };
      const [{ data: obra }, { count }] = await Promise.all([
        admin.from("obras").select("presupuesto_id").eq("id", m.obra_id).maybeSingle(),
        admin.from("presupuestos_gastos").select("id", { count: "exact", head: true })
          .eq("cashflow_item_id", id),
      ]);
      const cuenta = await cuentaDe(admin, m.cuenta_id);
      return {
        origenTipo,
        patas: filasEspejoCashflow(
          { ...m, fecha: m.fecha_real ?? m.fecha_proyectada ?? hoyIso(), descripcion: m.descripcion ?? "" },
          cuenta, obra?.presupuesto_id ?? null, (count ?? 0) > 0),
      };
    }
    case "gastos_empresa": {
      const { data: g } = await admin.from("gastos_empresa")
        .select("id, monto, moneda, cuenta_id, fecha, concepto").eq("id", id).maybeSingle();
      if (!g) return { patas: [], origenTipo: "gasto_empresa" };
      const cuenta = await cuentaDe(admin, g.cuenta_id);
      return {
        origenTipo: "gasto_empresa",
        patas: filasEspejoGastoEmpresa(
          { ...g, fecha: g.fecha ?? hoyIso(), descripcion: g.concepto ?? "" }, cuenta),
      };
    }
    case "gastos_personales": {
      const { data: g } = await admin.from("gastos_personales")
        .select("id, monto, cuenta_id, fecha, concepto").eq("id", id).maybeSingle();
      if (!g) return { patas: [], origenTipo: "gasto_personal" };
      const cuenta = await cuentaDe(admin, g.cuenta_id);
      return {
        origenTipo: "gasto_personal",
        patas: filasEspejoGastoPersonal(
          { ...g, fecha: g.fecha ?? hoyIso(), descripcion: g.concepto ?? "" }, cuenta),
      };
    }
    case "retiros_socio": {
      const { data: r } = await admin.from("retiros_socio")
        .select("id, tipo, monto_ars, cuenta_id, fecha, concepto").eq("id", id).maybeSingle();
      if (!r) return { patas: [], origenTipo: "retiro" };
      const cuenta = await cuentaDe(admin, r.cuenta_id);
      return {
        origenTipo: "retiro",
        patas: filasEspejoRetiro(
          { ...r, fecha: r.fecha ?? hoyIso(), descripcion: r.concepto ?? "" }, cuenta),
      };
    }
    case "transferencias": {
      const { data: t } = await admin.from("transferencias")
        .select("id, cuenta_origen_id, cuenta_destino_id, monto_origen, monto_destino, fecha, concepto")
        .eq("id", id).maybeSingle();
      if (!t) return { patas: [], origenTipo: "transferencia" };
      const ids = [t.cuenta_origen_id, t.cuenta_destino_id].filter(Boolean) as string[];
      const { data: cuentas } = await admin.from("cuentas")
        .select("id, moneda, obra_id").in("id", ids);
      const porId = new Map((cuentas ?? []).map((c) => [c.id, c]));
      const origen = porId.get(t.cuenta_origen_id ?? "");
      const destino = porId.get(t.cuenta_destino_id ?? "");
      // Dueño default (convención F2): obra de la cuenta destino, sino de la
      // de origen, sino empresa. Los cruces reales se cargan por bot.
      const obraId = destino?.obra_id ?? origen?.obra_id ?? null;
      const dueno = obraId
        ? { dueno_tipo: "obra" as const, dueno_obra_id: obraId }
        : { dueno_tipo: "empresa" as const, dueno_obra_id: null };
      return {
        origenTipo: "transferencia",
        patas: filasEspejoTransferencia(
          { ...t, fecha: t.fecha ?? hoyIso(), descripcion: t.concepto ?? "" },
          origen, destino, dueno),
      };
    }
  }
}

const clavePata = (p: { cuenta_id: string; dueno_tipo: string; dueno_obra_id: string | null; moneda: string; monto: unknown }) =>
  `${p.cuenta_id}|${p.dueno_tipo}|${p.dueno_obra_id ?? ""}|${p.moneda}|${roundArs2(parseNum(p.monto))}`;

export async function sincronizarEspejo(
  admin: SupabaseClient, tabla: TablaEspejo, id: string
): Promise<ResultadoSync> {
  // Sin foto inicial no se espeja nada (bolsillos vacíos = ledger apagado).
  const { count: foto } = await admin.from("movimientos_plata")
    .select("id", { count: "exact", head: true })
    .eq("origen_tipo", "foto_inicial").eq("estado", "asentado");
  if (!foto) return { accion: "sin_foto", patas: 0 };

  const { patas: esperadas, origenTipo } = await patasEsperadas(admin, tabla, id);

  const { data: existentes } = await admin.from("movimientos_plata")
    .select("id, grupo_id, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda")
    .eq("origen_id", id).in("origen_tipo", TIPOS_POR_TABLA[tabla]);
  const viejas = existentes ?? [];

  const iguales =
    viejas.length === esperadas.length &&
    [...viejas].map(clavePata).sort().join("\n") ===
    [...esperadas].map(clavePata).sort().join("\n");
  if (iguales) return { accion: "igual", patas: viejas.length };

  // Grupos con financiamiento son operaciones del bot con libro de deudas:
  // reescribirlos rompería el vínculo — se saltea y queda para conciliar.
  if (viejas.length) {
    const grupos = [...new Set(viejas.map((v) => v.grupo_id))];
    const { count: fin } = await admin.from("financiamientos")
      .select("id", { count: "exact", head: true }).in("origen_grupo_id", grupos);
    if (fin) {
      console.error(`[dinero-sync] ${tabla}/${id}: grupo con financiamiento, no se reescribe (a conciliar)`);
      return { accion: "salteado_financiamiento", patas: viejas.length };
    }
    await admin.from("movimientos_plata").delete().eq("origen_id", id)
      .in("origen_tipo", TIPOS_POR_TABLA[tabla]);
  }

  if (esperadas.length) {
    const grupo = crypto.randomUUID();
    await admin.from("movimientos_plata").insert(esperadas.map((p) => ({
      ...p, grupo_id: grupo, origen_tipo: origenTipo, origen_id: id, estado: "asentado",
    })));
  }
  return { accion: "reescrito", patas: esperadas.length };
}
```

- [ ] **Step 2: Endpoint** `src/app/api/dinero/espejo/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo, type TablaEspejo } from "@/lib/dinero-sync";

const TABLAS: TablaEspejo[] = [
  "presupuestos_gastos", "cashflow_items", "gastos_empresa",
  "gastos_personales", "retiros_socio", "transferencias",
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tabla = body?.tabla as TablaEspejo;
  const id = String(body?.id ?? "");
  if (!TABLAS.includes(tabla) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "tabla o id inválidos" }, { status: 400 });
  }
  try {
    const r = await sincronizarEspejo(createSupabaseAdminClient(), tabla, id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[api/dinero/espejo]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck + suite** — `pnpm vitest run` verde y `pnpm tsc --noEmit` (o el lint del repo) sin errores nuevos.

- [ ] **Step 4: Commit** — `git commit -m "feat(dinero): sincronizador del espejo + endpoint /api/dinero/espejo"`

---

### Task 4: Hooks del espejo en los write-points server-side

**Files (todos Modify):**
- `src/app/api/pendientes-cuenta/route.ts` (POST tras el update de `cuenta_id`; DELETE tras cada borrado — incluye el espejo cashflow del gasto de obra)
- `src/app/api/cashflow/marcar-item/route.ts` (POST tras el update)
- `src/app/api/cashflow/registrar-movimiento/route.ts` (POST tras el insert)
- `src/app/cashflow/item/route.ts` (POST tras el insert)
- `src/app/cashflow/item/[id]/route.ts` (PUT tras el update; DELETE tras el soft-delete)
- `src/app/cashflow/item/[id]/restore/route.ts` (tras el restore)
- `src/app/api/finanzas/route.ts` (POST tras el insert; DELETE tras el delete)
- `src/app/api/negocio/retiro/route.ts` (POST tras el insert)
- `src/app/api/cuentas/reserva-obra/route.ts` (POST tras el insert de `transferencias`)

**Interfaces:**
- Consumes: `sincronizarEspejo(admin, tabla, id)` de Task 3.
- Produces: nada nuevo — cada ruta responde igual que antes; el espejo es efecto colateral best-effort.

- [ ] **Step 1: Patrón único.** En cada ruta, inmediatamente después de la escritura exitosa y ANTES del `return` de éxito, agregar (adaptando `tabla` e `id`):

```ts
// Espejo Dinero (Fase 2): best-effort, jamás rompe la operación original.
await sincronizarEspejo(admin, "cashflow_items", id).catch((e) =>
  console.error("[dinero espejo]", e)
);
```

  Detalle por archivo (la `tabla` y de dónde sale el `id`):
  - `pendientes-cuenta` POST: `tabla = TABLA_POR_ORIGEN[origen]` mapeada a `TablaEspejo` (mismos nombres), `id = body.id`.
  - `pendientes-cuenta` DELETE: tras cada borrado, sync de la tabla origen con el `id` borrado; en el caso `gasto_obra`, sync TAMBIÉN de `cashflow_items` con el `cashflow_item_id` soft-borrado.
  - `marcar-item` POST: `("cashflow_items", id)`. `registrar-movimiento` POST: `("cashflow_items", insertado.id)`.
  - `cashflow/item` POST: `("cashflow_items", data.id)`. `cashflow/item/[id]` PUT y DELETE: `("cashflow_items", id)`. `restore`: `("cashflow_items", id)`.
  - `finanzas` POST: `("gastos_personales", data.id)` (alta sin cuenta → sync no-op, uniforme igual). DELETE: `("gastos_personales", id)` (fila borrada → borra espejo si existía).
  - `negocio/retiro` POST: `("retiros_socio", data.id)`.
  - `reserva-obra` POST: `("transferencias", idTransferencia)` solo si insertó transferencia.
- [ ] **Step 2: `planificar-confirmar` NO se toca** — inserta items sin `cuenta_id` ni `monto_real` efectivos para el motor de cuentas (proyección); el espejo les llega cuando se marcan/asignan. Dejar un comentario de una línea en ese archivo apuntando a esta decisión.
- [ ] **Step 3: Typecheck + suite verde** — `pnpm vitest run` y build type-check. Expected: verde.
- [ ] **Step 4: Commit** — `git commit -m "feat(dinero): espejo del ledger en todos los write-points server de plata"`

---

### Task 5: Hook client-side en `gastos-screen.tsx`

**Files:**
- Modify: `src/app/obras/[id]/gastos/gastos-screen.tsx`

**Interfaces:**
- Consumes: `POST /api/dinero/espejo` (Task 3).

- [ ] **Step 1:** Agregar el helper local (arriba del componente):

```ts
// Espejo Dinero (Fase 2): fire-and-forget — la carga del gasto nunca espera
// ni falla por el espejo; una divergencia la agarra el chequeo de consistencia.
const espejarDinero = (tabla: string, id: string) => {
  fetch("/api/dinero/espejo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tabla, id }),
  }).catch(() => {});
};
```

- [ ] **Step 2:** Llamarlo en: (a) `guardarDraft()` tras el insert exitoso de `presupuestos_gastos` → `espejarDinero("presupuestos_gastos", gastoId)`; (b) `eliminarGasto()` tras el delete → `espejarDinero("presupuestos_gastos", gastoId)` y, si tenía espejo de libreta, `espejarDinero("cashflow_items", cashflowItemId)`.
- [ ] **Step 3: Suite + lint verdes.**
- [ ] **Step 4: Commit** — `git commit -m "feat(dinero): espejo del ledger al cargar/borrar gastos de obra desde la app"`

---

### Task 6: `scripts/dinero-foto.ts` — saldos del motor y chequeo de consistencia

**Files:**
- Create: `scripts/dinero-foto.ts`

**Interfaces:**
- Consumes: `saldosPorCuenta` (`src/lib/cuentas.ts`), `saldosCuentasDesdeLedger`/`chequeoConsistencia` (`src/lib/dinero.ts`), `@supabase/supabase-js` con `SUPABASE_SERVICE_ROLE_KEY` de `.env.local`.
- Produces: CLI `npx tsx scripts/dinero-foto.ts saldos` (tabla: cuenta · moneda · saldo motor · Σ bolsillos ledger) y `npx tsx scripts/dinero-foto.ts check` (divergencias de `chequeoConsistencia`; exit 1 si hay).

- [ ] **Step 1: Implementar.** El script replica el fetch de `/api/cuentas` (las 8 tablas, mismos selects que `src/app/api/cuentas/route.ts`), corre `saldosPorCuenta`, y lee `movimientos_plata` para el lado ledger:

```ts
/* Sesión de FOTO INICIAL del módulo Dinero (Fase 2) y chequeo de convivencia.
 *   npx tsx scripts/dinero-foto.ts saldos   → saldo motor vs Σ bolsillos, por cuenta
 *   npx tsx scripts/dinero-foto.ts check    → divergencias (exit 1 si hay)
 * Lee .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { saldosPorCuenta } from "../src/lib/cuentas";
import { chequeoConsistencia, saldosCuentasDesdeLedger } from "../src/lib/dinero";

config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function motor() {
  const [cuentas, gastosObra, cashflow, retiros, personales, empresa, transferencias, ajustes] = await Promise.all([
    admin.from("cuentas").select("*").eq("activa", true).order("orden"),
    admin.from("presupuestos_gastos").select("cuenta_id, importe, cotizacion_venta_ars_por_usd, cashflow_item_id").not("cuenta_id", "is", null),
    admin.from("cashflow_items").select("id, cuenta_id, tipo, monto_real, moneda, monto_usd, deleted_at").not("cuenta_id", "is", null).is("deleted_at", null),
    admin.from("retiros_socio").select("cuenta_id, tipo, monto_ars").not("cuenta_id", "is", null),
    admin.from("gastos_personales").select("cuenta_id, monto").not("cuenta_id", "is", null),
    admin.from("gastos_empresa").select("cuenta_id, monto, moneda").not("cuenta_id", "is", null),
    admin.from("transferencias").select("cuenta_origen_id, cuenta_destino_id, monto_origen, monto_destino"),
    admin.from("cuenta_ajustes").select("cuenta_id, delta"),
  ]);
  return saldosPorCuenta({
    cuentas: cuentas.data ?? [], gastosObra: gastosObra.data ?? [],
    cashflow: cashflow.data ?? [], retiros: retiros.data ?? [],
    gastosPersonales: personales.data ?? [], gastosEmpresa: empresa.data ?? [],
    transferencias: transferencias.data ?? [], ajustes: ajustes.data ?? [],
  });
}

async function main() {
  const modo = process.argv[2] ?? "saldos";
  const [s, movs] = await Promise.all([
    motor(),
    admin.from("movimientos_plata").select("id, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, grupo_id, origen_tipo, estado"),
  ]);
  const ledger = saldosCuentasDesdeLedger((movs.data ?? []) as never);
  if (modo === "saldos") {
    for (const c of s.cuentas.filter((c) => c.activa)) {
      const l = ledger.get(c.id);
      console.log(`${c.nombre.padEnd(34)} ${c.moneda}  motor=${c.saldo}  ledger=${l ?? "—"}`);
    }
    return;
  }
  const saldosMotor = new Map(s.cuentas.map((c) => [c.id, c.saldo]));
  const div = chequeoConsistencia((movs.data ?? []) as never, saldosMotor);
  if (!div.length) { console.log("✅ consistencia OK: ledger = motor en todas las cuentas del ledger"); return; }
  const nombres = new Map(s.cuentas.map((c) => [c.id, c.nombre]));
  for (const d of div) console.log(`⚠️ ${nombres.get(d.cuenta_id) ?? d.cuenta_id}: ledger=${d.saldoLedger} motor=${d.saldoMotor} delta=${d.delta}`);
  process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Probar en vivo** — `npx tsx scripts/dinero-foto.ts saldos` imprime las cuentas reales (ledger “—” en todas: todavía no hay foto). `check` dice OK (ledger vacío no diverge: `chequeoConsistencia` solo compara cuentas que el ledger conoce).
- [ ] **Step 3: Commit** — `git commit -m "feat(dinero): script de foto inicial y chequeo de consistencia"`

---

### Task 7: Bot — `src/dinero.js` (patas, bolsillos, resumen) + wrappers de Supabase + captura numérica

**Files (repo `~/Documents/ravn-bots`):**
- Create: `src/dinero.js`
- Modify: `src/supabaseService.js` (agregar `dineroBolsillos`, `dineroInsertarBorrador`, `dineroAsentarGrupo`, `dineroDescartarGrupo` y exportarlos)
- Modify: `src/preguntasService.js` (opción `cierre` custom en `renderPregunta`/`preguntar`; captura numérica en `resolverTextoLibre`)
- Test: `test/dinero.test.js`, ampliar `test/preguntas-texto-libre.test.js`

**Interfaces:**
- Produces (`src/dinero.js`):
  - `armarPatasGasto(op)` → `[{cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, descripcion}]` (1 pata) — mismas reglas de moneda que el motor: cuenta ARS → `-importeArs`; cuenta USD → `-round2(importeArs/cot)`; `importeArs = moneda gasto USD ? round2(monto*cot) : monto`.
  - `armarPatasTransferenciaParte(parte, origen, destino, dueno)` → 2 patas.
  - `armarPatasAjuste({delta, cuenta, dueno})` → 1 pata.
  - `financiamientoDe(op, pata)` → `null` si el dueño del bolsillo = dueño de imputación; sino `{deudor_tipo, deudor_obra_id, acreedor_tipo, acreedor_obra_id, monto: |pata.monto|, moneda, notas}`.
  - `duenoImputacion(op)` → `{dueno_tipo, dueno_obra_id}` (obra del gasto / empresa / personal).
  - `etiquetaDueno(dueno, nombreObra)` → `"Obra Pueyrredón" | "RAVN (empresa)" | "Tuya (personal)"`.
  - `textoResumen(op)` → el resumen completo de WhatsApp (qué, monto, cuenta, bolsillo, financiamiento explícito si cruza, cotización si cruzó moneda).
- Produces (`supabaseService`):
  - `dineroBolsillos(cuentaId)` → filas de `dinero_saldos_bolsillos` con `saldo ≠ 0` + `nombre_obra` resuelto (fetch de `presupuestos` por ids).
  - `dineroInsertarBorrador(filas)` → inserta con `estado:'borrador'` (default), devuelve `grupo_id` o `null`.
  - `dineroAsentarGrupo({ grupoId, origenId, financiamiento })` → resultado del RPC o `null`.
  - `dineroDescartarGrupo(grupoId)` → nº de filas o `null`.
- Produces (`preguntasService`):
  - `preguntar(eventoId, texto, opciones, { suave, cierre, captura })` — `cierre` reemplaza el texto de cierre; `captura: 'numero'` guarda en el evento `pregunta.captura='numero'` y `pregunta.accion_captura` (= `opciones[0].accion`).
  - En `resolverTextoLibre`: ANTES del match de etiquetas, si la pregunta pendiente tiene `captura==='numero'` y el texto parsea como número (`/^[\d.,]+$/` sobre el texto sin `$`, espacios ni "pesos"), ejecutar `{...accion_captura, valor: <número>}`.

- [ ] **Step 1: Tests primero** (`test/dinero.test.js`, node:test):

```js
const test = require('node:test');
const assert = require('node:assert');
const { armarPatasGasto, financiamientoDe, duenoImputacion, textoResumen } = require('../src/dinero');

const opBase = {
  clase: 'gasto',
  gasto: { concepto: 'Volquete', monto: 150000, moneda: 'ARS' },
  presupuesto_id: 'p-puey', obra_nombre: 'Baño Pueyrredón',
  cuenta_id: 'c-mp', cuenta_nombre: 'Mercado Pago', cuenta_moneda: 'ARS',
  bolsillo: { dueno_tipo: 'obra', dueno_obra_id: 'p-puey', nombre_obra: 'Baño Pueyrredón' },
  cotizacion: null,
};

test('gasto ARS en cuenta ARS: una pata negativa en la moneda de la cuenta', () => {
  const patas = armarPatasGasto(opBase);
  assert.equal(patas.length, 1);
  assert.equal(patas[0].monto, -150000);
  assert.equal(patas[0].moneda, 'ARS');
  assert.equal(patas[0].dueno_obra_id, 'p-puey');
});

test('gasto ARS pagado de cuenta USD: pata en USD con la cotización', () => {
  const patas = armarPatasGasto({ ...opBase, cuenta_moneda: 'USD', cotizacion: 1500 });
  assert.equal(patas[0].monto, -100);
  assert.equal(patas[0].moneda, 'USD');
});

test('gasto USD pagado de cuenta ARS: pata ARS = monto*cotización', () => {
  const patas = armarPatasGasto({
    ...opBase, gasto: { concepto: 'Rendair', monto: 20, moneda: 'USD' }, cotizacion: 1500 });
  assert.equal(patas[0].monto, -30000);
});

test('mismo dueño: sin financiamiento; bolsillo de otra obra: financiamiento explícito', () => {
  assert.equal(financiamientoDe(opBase, armarPatasGasto(opBase)[0]), null);
  const cruzado = { ...opBase, bolsillo: { dueno_tipo: 'obra', dueno_obra_id: 'p-glor', nombre_obra: 'Glorietas' } };
  const fin = financiamientoDe(cruzado, armarPatasGasto(cruzado)[0]);
  assert.deepEqual(
    { d: fin.deudor_obra_id, a: fin.acreedor_obra_id, m: fin.monto },
    { d: 'p-puey', a: 'p-glor', m: 150000 });
});

test('gasto personal imputa a personal', () => {
  const op = { ...opBase, presupuesto_id: null, obra_nombre: null,
    gasto: { ...opBase.gasto, es_personal: true } };
  assert.deepEqual(duenoImputacion(op), { dueno_tipo: 'personal', dueno_obra_id: null });
});

test('resumen nombra cuenta, bolsillo y el financiamiento si cruza', () => {
  const cruzado = { ...opBase, bolsillo: { dueno_tipo: 'personal', dueno_obra_id: null } };
  const r = textoResumen(cruzado);
  assert.ok(r.includes('Mercado Pago'));
  assert.ok(/financiamiento/i.test(r));
  assert.ok(r.includes('150.000'));
});
```

  Y en `test/preguntas-texto-libre.test.js`, sumar: pregunta pendiente con `captura:'numero'` + texto `"1500"` → ejecuta `accion_captura` con `valor: 1500`; texto `"1.500"` → 1500; texto no numérico → sigue el flujo actual.

- [ ] **Step 2: Ver fallar** — `npm test` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar `src/dinero.js`.** Reglas de moneda idénticas al motor (comentar la correspondencia). `textoResumen` formato:

```
🧾 *Revisá antes de asentar:*
Gasto de obra — Baño Pueyrredón
Volquete — $150.000
Cuenta: Mercado Pago
Bolsillo: Tuya (personal)
⚠️ Cruce de dueños → queda anotado el financiamiento: Baño Pueyrredón le debe $150.000 a tu bolsillo personal.
```

  (más la línea de cotización si `op.cotizacion`). Un gasto = UN bolsillo (convención F2; el split se carga como dos gastos).
- [ ] **Step 4: Implementar los wrappers en `supabaseService.js`** siguiendo el estilo de la casa (try/catch, `console.error('[Supabase] …')`, `null`/`[]` en error). `dineroInsertarBorrador` genera `grupo_id` con `require('crypto').randomUUID()` si las filas no lo traen, setea `fecha` (hoy AR) y `evento_id`, y devuelve el `grupo_id`.
- [ ] **Step 5: Implementar `cierre`/`captura` en `preguntasService.js`.** `renderPregunta(texto, opciones, suave, cierre)` usa `cierre` si viene. En `preguntar` persistir `captura` y `accion_captura` dentro de `contenido.pregunta`. En `resolverTextoLibre`, el bloque de captura va después del guard de reenvío y antes de `matchEtiqueta`:

```js
const p = ev.contenido.pregunta;
if (p.captura === 'numero' && p.accion_captura) {
  const limpioNum = t.replace(/\$|pesos|ars/gi, '').trim();
  if (/^[\d.,\s]+$/.test(limpioNum)) {
    const n = Number(limpioNum.replace(/\.(?=\d{3})/g, '').replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) {
      await ejecutarOpcion(ev, { ...p.accion_captura, valor: n }, ejecutarAccion);
      return true;
    }
  }
}
```

  OJO documentado: un número de 1-2 dígitos lo consume `resolver()` como opción — para la cotización real (≥3 dígitos) no molesta.
- [ ] **Step 6: Ver pasar** — `npm test` → PASS completo.
- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(dinero): patas+bolsillos+resumen, wrappers RPC y captura numérica de preguntas (Fase 2)"`

---

### Task 8: Bot — flujo GASTO borrador→confirmo (`dineroFlujo.js` + advisor + portero)

**Files:**
- Create: `src/dineroFlujo.js`
- Modify: `src/advisorService.js` — el `case 'gasto'` delega al flujo nuevo (se van los inserts inmediatos y `preguntaCuenta`; quedan las guardias determinísticas de personal/empresa/consulta-de-plata y `detectarFijoPersonal`)
- Modify: `src/portero.js` — acciones nuevas `dinero_paso`, `dinero_confirmar`, `dinero_cancelar`; las acciones `gasto_obra`/`asignar_cuenta` viejas se mantienen SOLO para preguntas pendientes emitidas antes del deploy
- Test: `test/dinero-flujo.test.js` (y ajustar `test/advisor-ejecutar.test.js` a las expectativas nuevas)

**Interfaces:**
- Consumes: Task 7 completa (`armarPatasGasto`, `financiamientoDe`, `textoResumen`, wrappers `dinero*`, `preguntar` con `cierre`/`captura`).
- Produces (`src/dineroFlujo.js`):
  - `async avanzar(op, ctx)` → `{ reply } | { pregunta: {texto, opciones, suave?, cierre?, captura?} }` — mira `pasoSiguiente(op)` y arma la pregunta de ese paso o el resumen.
  - `pasoSiguiente(op)` → `'obra' | 'cuenta' | 'cotizacion' | 'bolsillo' | 'resumen'`.
  - `async confirmar(op, ctx)` → inserta el detalle + RPC asentar + reply.
  - `async cancelar(op, ctx)` → RPC descartar + reply.
- Produces (acciones del portero): `{clase:'dinero_paso', op, campo, valor?}` (las opciones traen `valor`; la captura numérica lo inyecta), `{clase:'dinero_confirmar', op}`, `{clase:'dinero_cancelar', op}`.

- [ ] **Step 1: Tests primero** (`test/dinero-flujo.test.js`) — con `sb` fake (objeto con stubs que registran llamadas). Casos:

```js
// 1. pasoSiguiente: gasto de obra sin presupuesto → 'obra'; con obra sin cuenta →
//    'cuenta'; cuenta USD sin cotización → 'cotizacion'; todo menos bolsillo →
//    'bolsillo'; completo → 'resumen'.
// 2. avanzar con paso 'bolsillo' y UN solo bolsillo con saldo en la cuenta →
//    lo auto-propone (op.bolsillo seteado, propuesto:true) y sigue derecho al
//    resumen SIN pregunta de bolsillo.
// 3. avanzar con paso 'resumen' → llama sb.dineroInsertarBorrador con 1 pata
//    correcta, y devuelve pregunta con opciones [Confirmo ✅ / Cancelar] cuyas
//    acciones son dinero_confirmar/dinero_cancelar con op.grupo_id seteado,
//    suave:true y cierre que dice "queda como borrador".
// 4. confirmar (gasto de obra) → llama sb.insertGastoObra (con cuenta_id y
//    cotizacion si hubo), después sb.dineroAsentarGrupo con origenId=gastoId y
//    financiamiento=null si no cruza; reply nombra la obra y la cuenta.
// 5. confirmar con bolsillo de OTRA obra → dineroAsentarGrupo recibe el
//    financiamiento {deudor: obra del gasto, acreedor: obra del bolsillo} y el
//    reply lo dice explícito.
// 6. confirmar gasto personal → sb.insertGastoPersonal con fijo_id si matchea
//    (detectarFijoPersonal sigue vivo) y agrega la frase del día si está.
// 7. cancelar → sb.dineroDescartarGrupo(grupo) y reply "descartado, no impacta".
// 8. Si dineroInsertarBorrador devuelve null → reply de error claro, sin tirar.
// 9. Si dineroAsentarGrupo falla → LANZA (el portero archiva y avisa — regla de oro).
```

  Escribir los 9 con asserts concretos sobre los stubs (mismo estilo que `test/advisor-transferencia.test.js`).
- [ ] **Step 2: Ver fallar** — `npm test`.
- [ ] **Step 3: Implementar `src/dineroFlujo.js`.** Puntos clave:
  - `pasoSiguiente(op)`: orden del checklist del spec — obra (solo gasto de obra sin `presupuesto_id`) → cuenta → cotización (si `moneda gasto ≠ moneda cuenta` — para gasto de OBRA también cuando cualquiera de las dos es USD, porque `importe` va SIEMPRE en ARS) → bolsillo → resumen.
  - Paso `obra`: opciones = obras activas (como el menú actual) + «Es gasto personal» / «Es gasto de empresa» (setean `es_personal`/`es_empresa` y siguen) + «Ninguna — archivalo».
  - Paso `cuenta`: opciones desde `listarCuentasActivas()` — primero las de la moneda del gasto, después las cruzadas marcadas `(en US$/$)`; para gasto PERSONAL solo la misma moneda (regla vigente). Sin opción “sin asignar”: en el flujo nuevo la cuenta es obligatoria antes de asentar; si Eze no quiere asignarla, cancela y lo carga por la app.
  - Paso `cotizacion`: pregunta con `captura:'numero'` (“¿A qué cotización? Contestame el número, ej: 1480”), `accion_captura = {clase:'dinero_paso', op, campo:'cotizacion'}`, única opción visible «Cancelar la carga».
  - Paso `bolsillo`: `sb.dineroBolsillos(cuenta_id)`; si hay UNO con saldo → auto-proponer y seguir; si hay varios (o ninguno) → opciones: cada bolsillo con saldo (`"Obra Pueyrredón ($1.2M)"`), + atajos que falten: obra imputada / «RAVN (empresa)» / «Tuya (personal)».
  - Paso `resumen`: `armarPatasGasto(op)` → `sb.dineroInsertarBorrador(filas + evento_id)` → `op.grupo_id` → pregunta `textoResumen(op)` con opciones `[Confirmo ✅ → dinero_confirmar]`, `[Cancelar → dinero_cancelar]`, `suave: true`, `cierre: 'Respondé 1 para asentarlo o 2 para descartarlo. Si no contestás queda como BORRADOR en la app — no impacta ningún saldo hasta que confirmes.'`.
  - `confirmar(op, ctx)`: por subtipo — obra → `insertGastoObra({presupuesto_id, descripcion: formatGasto, importe: importeArs, fecha, cuenta_id, cotizacion_venta_ars_por_usd})` (extender `insertGastoObra` para aceptar la cotización); empresa → `insertGastoEmpresa` (como hoy, con cuenta); personal → `insertGastoPersonal` (+`fijo_id`). Después `dineroAsentarGrupo({grupoId: op.grupo_id, origenId: gastoId, financiamiento: financiamientoDe(op, pata)})` — si devuelve `null` LANZAR. `marcarDestino`. Reply: confirmación + financiamiento explícito si hubo + `conRemanente` + (personal) frase del día.
  - `cancelar`: `dineroDescartarGrupo` + reply.
- [ ] **Step 4: Cablear.** En `advisorService.js` el `case 'gasto'` conserva las guardias del principio (keywords personal/empresa, consulta-de-plata, `detectarCuenta` para pre-llenar `op.cuenta_id`, `detectarFijoPersonal` para `op.fijo`) y termina en `return dineroFlujo.avanzar(op, ctx)`. En `portero.js`:

```js
case 'dinero_paso': {
  const op = { ...accion.op };
  if (accion.campo) op[accion.campo] = accion.valor !== undefined ? accion.valor : accion.set;
  const r = await dineroFlujo.avanzar(op, { texto, eventoId: evento.id, sb });
  if (r.pregunta) {
    await preguntas.preguntar(evento.id, r.pregunta.texto, r.pregunta.opciones,
      { suave: !!r.pregunta.suave, cierre: r.pregunta.cierre, captura: r.pregunta.captura });
    return { pregunto: true };
  }
  await enviar(ownerPhone(), r.reply);
  return;
}
case 'dinero_confirmar': {
  const r = await dineroFlujo.confirmar(accion.op, { texto, eventoId: evento.id, sb });
  await enviar(ownerPhone(), r.reply);
  return;
}
case 'dinero_cancelar': {
  const r = await dineroFlujo.cancelar(accion.op, { texto, eventoId: evento.id, sb });
  await enviar(ownerPhone(), r.reply);
  return;
}
```

  (con `sb` y `dineroFlujo` inyectados como el resto de deps del portero). Las opciones de cada paso arman `{clase:'dinero_paso', op, campo:'presupuesto_id', valor:o.id}` etc. — el `op` viaja COMPLETO en la acción, igual que hoy viaja `gasto` en `gasto_obra`.
- [ ] **Step 5: `npm test` completo verde** (ajustar los tests viejos de `advisor-ejecutar` que esperaban insert inmediato: ahora esperan pregunta de flujo o resumen).
- [ ] **Step 6: Commit** — `git commit -m "feat(dinero): flujo gasto borrador→confirmo con bolsillos y financiamiento (Fase 2)"`

---

### Task 9: Bot — TRANSFERENCIA y ARQUEO al mismo esquema

**Files:**
- Modify: `src/dineroFlujo.js` (+ casos), `src/advisorService.js` (`case 'transferencia'` y `case 'arqueo'` delegan), `src/dinero.js` si falta algún armador
- Test: ampliar `test/dinero-flujo.test.js`; ajustar `test/advisor-transferencia.test.js` y `test/arqueo.test.js`

**Interfaces:**
- Consumes: resolución determinística actual de transferencia (cuentas, partes, montos, cruce de moneda — se queda tal cual en el advisor) y de arqueo (delta contra saldo derivado).
- Produces: ops `{clase:'transferencia', concepto, destino:{id,nombre,moneda}, partes:[{origen:{id,nombre,moneda}, monto, montoDestino}], bolsillo, grupos:[]}` y `{clase:'arqueo', cuenta:{id,nombre,moneda}, declarado, delta, bolsillo, grupo_id}`.

- [ ] **Step 1: Tests primero.**
  - Transferencia: resuelta → paso `bolsillo` (¿de quién es la plata que se mueve? — un solo dueño para toda la operación, spec); resumen lista las partes; confirmar inserta `transferencias` por parte + un grupo de 2 patas por parte + `dineroAsentarGrupo` por grupo (sin financiamiento: mismo dueño); cancelar descarta TODOS los grupos.
  - Arqueo: delta calculado → si la cuenta tiene un solo bolsillo → directo al resumen («Ajuste de +$X al bolsillo Obra Y — ¿confirmo?»); confirmar inserta `cuenta_ajustes` + grupo 1 pata (`origen_tipo:'ajuste'`, `origen_id: idAjuste`) + RPC; delta 0 responde “cuadrados” sin flujo (como hoy).
- [ ] **Step 2: Ver fallar.** — `npm test`.
- [ ] **Step 3: Implementar.** El advisor deja de insertar directo en ambos casos; toda la validación determinística previa (cuentas reconocidas, montos, cruce de moneda con `monto_destino`) se conserva ANTES de armar la op. El texto del resumen de transferencia reusa el formato actual de confirmación (`$X de A + $Y de B → destino`).
- [ ] **Step 4: `npm test` verde. Commit** — `git commit -m "feat(dinero): transferencia y arqueo por borrador→confirmo (Fase 2)"`

---

### Task 10: Cierre — foto inicial con Eze, deploys, verificación en vivo y review final

**Files:**
- Modify: `.superpowers/sdd/progress.md` (ledger de la fase), `~/Documents/ravn/handoff.md` (actualizar/borrar según estado)

Este task es un RUNBOOK con checkpoints humanos — ejecutarlo EN ORDEN (la foto va antes de que los espejos entren a escribir):

- [ ] **Step 1: Pre-check.** Migración de Task 1 aplicada en prod; `pnpm vitest run` (app) y `npm test` (bot) verdes; `npx tsx scripts/dinero-foto.ts check` OK.
- [ ] **Step 2: FOTO INICIAL con Eze (sesión guiada, checkpoint humano).**
  1. `npx tsx scripts/dinero-foto.ts saldos` → mostrarle a Eze cuenta por cuenta.
  2. Por cada cuenta con saldo ≠ 0, Eze declara el split por dueño. Insertar por MCP `execute_sql` UN grupo por cuenta: filas `origen_tipo='foto_inicial'`, `estado='asentado'`, `fecha=hoy`, `descripcion='Foto inicial bolsillos <cuenta>'`, mismo `grupo_id` por cuenta, montos que sumen EXACTO el saldo motor.
  3. Cruces pasados conocidos → `financiamientos` iniciales (mínimo, confirmar con Eze): siding **Glorietas debe $450.000 a Pueyrredón**; volquete **Pueyrredón debe $60.000 al bolsillo personal de Eze**. `origen_grupo_id = gen_random_uuid()` sintético, `notas = 'reconstrucción foto inicial 06/07'`.
  4. `npx tsx scripts/dinero-foto.ts check` → ✅ consistencia OK (obligatorio antes de seguir).
- [ ] **Step 3: Deploy app** — commit/push de `home-cards` y deploy al proyecto Vercel **`ravn-app-one`** (target correcto, ojo el decoy `ravn-app`). Verificar en prod: cargar y borrar un gasto de prueba desde la app → el espejo aparece y desaparece en `movimientos_plata` (MCP `execute_sql`).
- [ ] **Step 4: Deploy bot** — push de `ravn-bots` a `main` (Railway).
- [ ] **Step 5: Verificación en vivo con Eze (checkpoint humano).** Guión mínimo por WhatsApp:
  1. Gasto simple: «gasté 5000 en tornillos en pueyrredon, mp» → resumen → «1» → asentado: fila en `presupuestos_gastos` + grupo `asentado` + sin financiamiento; el reply trae remanente.
  2. Gasto cruzado: gasto de una obra pagándolo con bolsillo de otra → el resumen avisa el cruce → confirmo → `financiamientos` tiene la deuda nueva con `origen_grupo_id` del grupo.
  3. Cancelar: repetir un gasto → «2» → grupo borrador desaparece, sin detalle insertado.
  4. Borrador colgado: iniciar un gasto y NO contestar el resumen → el grupo queda `borrador` en la base (visible para la app en F3), ningún saldo cambió.
  5. Arqueo: «en mp hay X» → confirmo → `cuenta_ajustes` + espejo.
  6. `npx tsx scripts/dinero-foto.ts check` → ✅ verde después de todo el guión.
- [ ] **Step 6: Review final** — agente `ravn-code-reviewer` sobre el diff completo de la fase (ambos repos) + `get_advisors`. Aplicar lo que salga.
- [ ] **Step 7: Cierre administrativo** — actualizar `.superpowers/sdd/progress.md` (tasks, commits, minors diferidos a F3/F4), memoria `proyecto-modulo-dinero.md`, y el `handoff.md` (o borrarlo si la fase quedó cerrada). Anotar explícitamente los diferidos: F3 = `/dinero` UI + cobro/retiro/devolución por bot + borradores visibles; F4 = switch del motor al ledger + cierre de convivencia.

---

## Self-Review (hecho al escribir el plan)

1. **Cobertura del spec/handoff:** RPC único camino a asentado ✓ (T1, policy + RPC); valida moneda=cuenta ✓, deudor≠acreedor ✓, updated_at ✓ (insert del financiamiento), idempotencia por origen_grupo_id ✓; foto inicial completa única al arranque ✓ (T6+T10, guard en RPC y sync); bot borrador→confirmo con checklist (obra→cuenta→cotización→bolsillo→resumen) ✓ (T7-T9); espejo ledger app+bot (paridad, decisión Eze 06/07) ✓ (T2-T5); minors de F1 cerrados: insert-asentado del bot ✓, deudor≠acreedor ✓, updated_at ✓, índice origen_grupo_id ya estaba (F1 fix wave).
2. **Fuera de alcance (anotado en T10):** cobro/retiro/devolución POR BOT, UI `/dinero`, switch del motor, neteo al cierre de obra (`cierre_obra`), split multi-bolsillo de un gasto (se carga como dos gastos).
3. **Consistencia de tipos:** `PataEspejo` (T2) = shape de insert de `movimientos_plata` sin grupo/origen/estado (los agrega el sync T3); `op` del bot definido en T8 y reusado en T9; wrappers `dinero*` definidos en T7 y consumidos en T8/T9.

## Riesgos conocidos

- Los tests viejos del bot que esperaban insert inmediato de gasto/transferencia/arqueo van a romper: se ajustan en T8/T9 (está previsto), no es regresión.
- Movimientos cargados entre la foto (T10.2) y los deploys (T10.3-4): divergencia esperada, se detecta con el `check` y se concilia con un ajuste. Hacer los 4 pasos en la misma sesión lo minimiza.
- `resolver()` consume respuestas de 1-2 dígitos como número de opción: la captura de cotización exige ≥3 dígitos (real: ~1500).
