# Plan de compra y cruce cotizado/plan/real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar en cada obra el plan de compra real (nacido del desglose cotizado) y cruzarlo con los gastos efectivos, para conocer el margen real y alimentar `cotizador_lecciones`.

**Architecture:** Tabla nueva `obra_plan_items` clavada a `presupuestos` (convención del repo: `/obras/[id]` usa el id de `presupuestos`), sembrada desde `cotizaciones.desglose` al aprobar (dentro del "loop de oro" existente en `crearObraDesdeCotizacion`). Los gastos existentes (`presupuestos_gastos`) ganan una FK opcional `plan_item_id`. Todo cálculo (sembrado, cruce, lección) es código puro testeado con vitest — la IA nunca suma (regla madre del cotizador). La lección al cierre reutiliza el flujo existente `finalizarObra → correrContrasteObra`, enriquecido: si la obra tiene plan, contraste exacto por vínculo; si no, fallback al matching difuso actual.

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + RLS patrón `es_bot()`), TypeScript, vitest, Tailwind con clases `cdm-*` existentes.

**Spec:** `docs/superpowers/specs/2026-07-03-plan-compra-cruce-design.md`

## Global Constraints

- Copy de UI en castellano, tono App RAVN (mayúsculas mono-hud en labels, sin adjetivos de relleno).
- Estética existente: reutilizar las clases `labelCls`/`inputCls`/`sectionCls`/`thCls`/`tdCls` tal como están en `src/app/obras/[id]/gastos/gastos-screen.tsx`.
- Sin dependencias nuevas.
- Regla madre spec §6.2.1: la IA elige, el código suma. Toda aritmética en funciones puras con test.
- RLS: mismo patrón del repo — `revoke from anon`, select para authenticated, insert/update/delete `not public.es_bot()` (el bot NO edita el plan en fase 1; sí sigue insertando gastos sin asignar).
- Migraciones: archivo en `supabase/migrations/` con timestamp `20260703...` y aplicadas a prod vía MCP `mcp__supabase__apply_migration`.
- `presupuestos_gastos.importe` ya está en ARS siempre (ver `src/lib/cashflow-gastos-obra.ts`) — el cruce usa `importeGastoObraArs`.
- Tests: `npx vitest run <archivo>` (config en `vitest.config.ts`, alias `@` → `src`).
- Commits chicos por task, mensajes `feat:`/`test:` en castellano como el historial del repo.

## Enmiendas a la spec (decididas en este plan)

1. `obra_plan_items` referencia `presupuesto_id` (no `obra_id`): TODO el módulo obras (`gastos`, `obra_archivos`, la ruta `/obras/[id]`) está clavado a `presupuestos.id`. Usar `obra_id` obligaría a un join extra en cada pantalla.
2. `tipo` admite `'extra'` además de `material`/`mano_de_obra`: el desglose cotizado tiene `extras` (flete, volquete) que también hay que cruzar. En UI van al final del bloque Materiales.
3. El "botón cerrar cruce" de la spec NO se construye: la lección se genera en el flujo existente **CERRAR OBRA** (`finalizarObra` ya corre `correrContrasteObra`, best-effort). Solo se enriquece ese contraste con el plan.

---

### Task 1: Migración — tabla `obra_plan_items` + columna `plan_item_id`

**Files:**
- Create: `supabase/migrations/20260703100000_obra_plan_items.sql`

**Interfaces:**
- Produces: tabla `public.obra_plan_items` (columnas abajo) y `public.presupuestos_gastos.plan_item_id uuid null`.

- [ ] **Step 1: Escribir la migración**

```sql
-- obra_plan_items: plan de compra real de la obra (spec 2026-07-03 plan-compra-cruce).
-- Foto 2 del ciclo cotizado → plan → real. Se siembra desde cotizaciones.desglose
-- al aprobar (loop de oro) y Eze lo edita en /obras/[id]/plan. Los gastos reales
-- se cruzan vía presupuestos_gastos.plan_item_id (opcional, nunca obligatorio).
-- Clave por presupuesto_id: convención del repo (/obras/[id] = presupuestos.id).

create table if not exists public.obra_plan_items (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  cotizacion_id uuid references public.cotizaciones(id),
  origen text not null default 'manual' check (origen in ('cotizacion','manual')),
  tipo text not null check (tipo in ('material','mano_de_obra','extra')),
  nombre text not null,
  etapa text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  incluido boolean not null default true,
  notas text,
  -- Snapshot congelado del ítem cotizado (null en origen 'manual'). La UI jamás
  -- lo edita: es la evidencia de lo que se le cobró al cliente.
  cotizado jsonb
);

create index if not exists obra_plan_items_presupuesto_idx
  on public.obra_plan_items (presupuesto_id, creado_at);

comment on table public.obra_plan_items is
  'Plan de compra real por obra. origen=cotizacion nace del desglose (con snapshot cotizado congelado) y no se borra, solo se excluye; origen=manual es agregado de Eze.';

alter table public.obra_plan_items enable row level security;
revoke all on public.obra_plan_items from anon;

create policy "obra_plan_items_select_auth" on public.obra_plan_items
  for select to authenticated using (true);

create policy "obra_plan_items_insert_no_bot" on public.obra_plan_items
  for insert to authenticated with check (not public.es_bot());

create policy "obra_plan_items_update_no_bot" on public.obra_plan_items
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

create policy "obra_plan_items_delete_no_bot" on public.obra_plan_items
  for delete to authenticated using (not public.es_bot());

-- Vínculo opcional gasto → ítem del plan. on delete set null: si el ítem
-- desaparece, el gasto vuelve a "sin asignar", nunca se pierde.
alter table public.presupuestos_gastos
  add column if not exists plan_item_id uuid references public.obra_plan_items(id) on delete set null;

create index if not exists presupuestos_gastos_plan_item_idx
  on public.presupuestos_gastos (plan_item_id) where plan_item_id is not null;
```

- [ ] **Step 2: Aplicar a prod**

Aplicar vía MCP: `mcp__supabase__apply_migration` con `name: "obra_plan_items"` y el SQL de arriba.
Verificar: `mcp__supabase__list_tables` debe mostrar `obra_plan_items`; `select column_name from information_schema.columns where table_name='presupuestos_gastos' and column_name='plan_item_id'` devuelve 1 fila.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260703100000_obra_plan_items.sql
git commit -m "feat: tabla obra_plan_items + presupuestos_gastos.plan_item_id (plan de compra)"
```

---

### Task 2: Tipos + sembrado puro (desglose → filas del plan)

**Files:**
- Create: `src/lib/plan-compra/tipos.ts`
- Create: `src/lib/plan-compra/sembrar.ts`
- Test: `src/lib/plan-compra/__tests__/sembrar.test.ts`

**Interfaces:**
- Consumes: `Desglose`, `ItemDesglose`, `ExtraDesglose` de `@/lib/cotizador/tipos`.
- Produces:
  - `tipos.ts`: `PlanTipo`, `CotizadoSnapshot`, `PlanItemInsert`, `PlanItemRow` (abajo).
  - `sembrar.ts`: `sembrarPlanDesdeDesglose(desglose: Desglose, presupuestoId: string, cotizacionId: string): PlanItemInsert[]`.

- [ ] **Step 1: Escribir `tipos.ts`**

```typescript
/** Tipos del plan de compra (espejo de la tabla obra_plan_items). */

export type PlanTipo = "material" | "mano_de_obra" | "extra";
export type PlanOrigen = "cotizacion" | "manual";

/** Foto congelada del ítem cotizado. La UI nunca la edita. */
export type CotizadoSnapshot = {
  cantidad: number | null;
  unidad: string | null;
  precio_min: number | null;
  precio_max: number | null;
  subtotal_min: number;
  subtotal_max: number;
  fuente: string | null;
  fecha: string | null; // YYYY-MM-DD del precio de origen
};

export type PlanItemInsert = {
  presupuesto_id: string;
  cotizacion_id: string | null;
  origen: PlanOrigen;
  tipo: PlanTipo;
  nombre: string;
  etapa: string | null;
  unidad: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  incluido: boolean;
  notas: string | null;
  cotizado: CotizadoSnapshot | null;
};

export type PlanItemRow = PlanItemInsert & { id: string; creado_at: string };

/** Punto medio del subtotal cotizado; null si el ítem es manual (sin snapshot). */
export function cotizadoMedio(item: { cotizado: CotizadoSnapshot | null }): number | null {
  if (!item.cotizado) return null;
  return Math.round((item.cotizado.subtotal_min + item.cotizado.subtotal_max) / 2);
}
```

- [ ] **Step 2: Escribir el test que falla**

```typescript
import { describe, expect, it } from "vitest";
import { sembrarPlanDesdeDesglose } from "../sembrar";
import type { Desglose } from "@/lib/cotizador/tipos";

const desglose: Desglose = {
  receta_nombre: "pintura-interior",
  receta_version: 1,
  parametros: { superficie_m2: 40 },
  items: [
    {
      nombre: "Látex interior 20L",
      etapa: "Pintura",
      tipo: "material",
      unidad: "u",
      formula: "ceil(superficie_m2 / 20)",
      cantidad_base: 2,
      desperdicio_pct: 0,
      cantidad: 2,
      precios: {
        internet: { valor: 90000, fuente: "easy.com.ar", fecha: "2026-07-01" },
        sismat: { valor: 110000, fuente: "SISMAT", fecha: "2026-06-15" },
      },
      precio_min: 90000,
      precio_max: 110000,
      subtotal_min: 180000,
      subtotal_max: 220000,
      divergencia_pct: 22.2,
      sin_precio: false,
    },
    {
      nombre: "Pintor oficial",
      etapa: "Pintura",
      tipo: "mano_de_obra",
      unidad: "dia",
      formula: "3",
      cantidad_base: 3,
      desperdicio_pct: 0,
      cantidad: 3,
      precios: { sismat: { valor: 80000, fuente: "SISMAT", fecha: "2026-06-15" } },
      precio_min: 80000,
      precio_max: 80000,
      subtotal_min: 240000,
      subtotal_max: 240000,
      divergencia_pct: null,
      sin_precio: false,
    },
  ],
  extras: [
    { nombre: "Flete", monto_min: 30000, monto_max: 40000, fuente: "estimado", fecha: "2026-07-01" },
  ],
  totales: {
    materiales_min: 180000, materiales_max: 220000,
    mano_de_obra_min: 240000, mano_de_obra_max: 240000,
    extras_min: 30000, extras_max: 40000,
    subtotal_min: 450000, subtotal_max: 500000,
    imprevistos_pct: 0, factor_zona_min: 1, factor_zona_max: 1,
    total_min: 450000, total_max: 500000,
  },
  tiempo: { dias_min: 3, dias_max: 4, cuadrilla_max: 2 },
  generado_at: "2026-07-01T12:00:00Z",
};

describe("sembrarPlanDesdeDesglose", () => {
  it("convierte cada ítem del desglose en fila del plan con snapshot congelado", () => {
    const filas = sembrarPlanDesdeDesglose(desglose, "pres-1", "cot-1");
    expect(filas).toHaveLength(3); // 2 items + 1 extra

    const latex = filas[0];
    expect(latex).toMatchObject({
      presupuesto_id: "pres-1",
      cotizacion_id: "cot-1",
      origen: "cotizacion",
      tipo: "material",
      nombre: "Látex interior 20L",
      etapa: "Pintura",
      unidad: "u",
      cantidad: 2,
      precio_unitario: 100000, // punto medio de 90k/110k
      incluido: true,
    });
    expect(latex.cotizado).toEqual({
      cantidad: 2,
      unidad: "u",
      precio_min: 90000,
      precio_max: 110000,
      subtotal_min: 180000,
      subtotal_max: 220000,
      fuente: "easy.com.ar",
      fecha: "2026-07-01",
    });
  });

  it("los extras entran como tipo extra, cantidad 1, precio = punto medio", () => {
    const filas = sembrarPlanDesdeDesglose(desglose, "pres-1", "cot-1");
    const flete = filas[2];
    expect(flete).toMatchObject({
      tipo: "extra",
      nombre: "Flete",
      etapa: "Extras",
      cantidad: 1,
      precio_unitario: 35000,
    });
    expect(flete.cotizado).toMatchObject({ subtotal_min: 30000, subtotal_max: 40000, fuente: "estimado" });
  });

  it("ítem sin precio: precio_unitario null, snapshot con subtotales 0", () => {
    const sinPrecio: Desglose = {
      ...desglose,
      items: [{ ...desglose.items[0], precios: {}, precio_min: null, precio_max: null, subtotal_min: 0, subtotal_max: 0, sin_precio: true }],
      extras: [],
    };
    const filas = sembrarPlanDesdeDesglose(sinPrecio, "p", "c");
    expect(filas[0].precio_unitario).toBeNull();
    expect(filas[0].cotizado).toMatchObject({ precio_min: null, subtotal_min: 0 });
  });
});
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run src/lib/plan-compra/__tests__/sembrar.test.ts`
Expected: FAIL — `Cannot find module '../sembrar'`.

- [ ] **Step 4: Implementar `sembrar.ts`**

```typescript
import type { Desglose, ExtraDesglose, ItemDesglose } from "@/lib/cotizador/tipos";
import type { CotizadoSnapshot, PlanItemInsert } from "./tipos";

/** Fuente y fecha "representativas" del ítem: internet si existe, sino SISMAT. */
function fuenteDeItem(item: ItemDesglose): { fuente: string | null; fecha: string | null } {
  const p = item.precios.internet ?? item.precios.sismat ?? null;
  return { fuente: p?.fuente ?? null, fecha: p?.fecha ?? null };
}

function medio(min: number | null, max: number | null): number | null {
  if (min == null || max == null) return null;
  return Math.round((min + max) / 2);
}

function desdeItem(item: ItemDesglose, presupuestoId: string, cotizacionId: string): PlanItemInsert {
  const { fuente, fecha } = fuenteDeItem(item);
  const cotizado: CotizadoSnapshot = {
    cantidad: item.cantidad,
    unidad: item.unidad,
    precio_min: item.precio_min,
    precio_max: item.precio_max,
    subtotal_min: item.subtotal_min,
    subtotal_max: item.subtotal_max,
    fuente,
    fecha,
  };
  return {
    presupuesto_id: presupuestoId,
    cotizacion_id: cotizacionId,
    origen: "cotizacion",
    tipo: item.tipo,
    nombre: item.nombre,
    etapa: item.etapa ?? null,
    unidad: item.unidad ?? null,
    cantidad: item.cantidad,
    precio_unitario: medio(item.precio_min, item.precio_max),
    incluido: true,
    notas: null,
    cotizado,
  };
}

function desdeExtra(extra: ExtraDesglose, presupuestoId: string, cotizacionId: string): PlanItemInsert {
  return {
    presupuesto_id: presupuestoId,
    cotizacion_id: cotizacionId,
    origen: "cotizacion",
    tipo: "extra",
    nombre: extra.nombre,
    etapa: "Extras",
    unidad: null,
    cantidad: 1,
    precio_unitario: medio(extra.monto_min, extra.monto_max),
    incluido: true,
    notas: null,
    cotizado: {
      cantidad: 1,
      unidad: null,
      precio_min: extra.monto_min,
      precio_max: extra.monto_max,
      subtotal_min: extra.monto_min,
      subtotal_max: extra.monto_max,
      fuente: extra.fuente ?? null,
      fecha: extra.fecha ?? null,
    },
  };
}

/**
 * Sembrado del plan de compra (spec 2026-07-03): cada ítem y extra del desglose
 * cotizado se vuelve una fila editable del plan, con la foto cotizada congelada
 * adentro. Puro: el llamador hace el insert.
 */
export function sembrarPlanDesdeDesglose(
  desglose: Desglose,
  presupuestoId: string,
  cotizacionId: string
): PlanItemInsert[] {
  const items = (desglose.items ?? []).map((i) => desdeItem(i, presupuestoId, cotizacionId));
  const extras = (desglose.extras ?? []).map((e) => desdeExtra(e, presupuestoId, cotizacionId));
  return [...items, ...extras];
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `npx vitest run src/lib/plan-compra/__tests__/sembrar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/plan-compra
git commit -m "feat: sembrado puro del plan de compra desde el desglose cotizado"
```

---

### Task 3: Importar plan (idempotente) + hook en el loop de oro + endpoint retro

**Files:**
- Create: `src/lib/plan-compra/importar.ts`
- Modify: `src/lib/cotizador/crear-obra.ts` (paso 3.5, después de copiar archivos)
- Create: `src/app/api/obras/[id]/plan/importar/route.ts`

**Interfaces:**
- Consumes: `sembrarPlanDesdeDesglose` (Task 2).
- Produces: `importarPlanDesdeCotizacion(sb: SupabaseClient, presupuestoId: string, cotizacionId: string): Promise<{ insertados: number; motivo?: string }>` — idempotente, nunca tira. Endpoint `POST /api/obras/[id]/plan/importar` ([id] = presupuesto_id) → `{ insertados }` o `{ insertados: 0, motivo }`.

- [ ] **Step 1: Escribir `importar.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Desglose } from "@/lib/cotizador/tipos";
import { sembrarPlanDesdeDesglose } from "./sembrar";

/**
 * Importa el desglose de una cotización como plan de compra de la obra.
 * Idempotente: si la obra ya tiene ítems origen 'cotizacion' de ESA cotización,
 * no vuelve a sembrar (motivo 'ya_importado'). Best-effort: nunca tira — ante
 * error devuelve { insertados: 0, motivo } y loguea (mismo contrato que el
 * loop de oro de crear-obra: un fallo acá jamás bloquea la aprobación).
 */
export async function importarPlanDesdeCotizacion(
  sb: SupabaseClient,
  presupuestoId: string,
  cotizacionId: string
): Promise<{ insertados: number; motivo?: string }> {
  try {
    const { data: existentes, error: eEx } = await sb
      .from("obra_plan_items")
      .select("id")
      .eq("presupuesto_id", presupuestoId)
      .eq("cotizacion_id", cotizacionId)
      .eq("origen", "cotizacion")
      .limit(1);
    if (eEx) throw new Error(eEx.message);
    if (existentes && existentes.length > 0) return { insertados: 0, motivo: "ya_importado" };

    const { data: cot, error: eCot } = await sb
      .from("cotizaciones")
      .select("id, desglose")
      .eq("id", cotizacionId)
      .maybeSingle();
    if (eCot || !cot) throw new Error(eCot?.message ?? "cotización no encontrada");

    const desglose = cot.desglose as Desglose | null;
    if (!desglose || !Array.isArray(desglose.items) || desglose.items.length === 0) {
      return { insertados: 0, motivo: "sin_desglose" };
    }

    const filas = sembrarPlanDesdeDesglose(desglose, presupuestoId, cotizacionId);
    const { error: eIns } = await sb.from("obra_plan_items").insert(filas);
    if (eIns) throw new Error(eIns.message);
    return { insertados: filas.length };
  } catch (e) {
    console.error("[importarPlanDesdeCotizacion]", e instanceof Error ? e.message : e);
    return { insertados: 0, motivo: "error" };
  }
}
```

- [ ] **Step 2: Hook en `crear-obra.ts`**

En `crearObraDesdeCotizacion`, después del bloque `// 3) archivos` y ANTES del `// 4) cerrar el loop`, agregar:

```typescript
  // 3.5) plan de compra (spec 2026-07-03): el desglose cotizado se siembra como
  // plan editable de la obra. Best-effort, igual que archivos.
  await importarPlanDesdeCotizacion(sb, pres.id, cot.id);
```

Con el import arriba del archivo:

```typescript
import { importarPlanDesdeCotizacion } from "@/lib/plan-compra/importar";
```

- [ ] **Step 3: Endpoint retro `POST /api/obras/[id]/plan/importar`**

Para obras ya en curso con cotización vinculada. `[id]` = presupuesto_id (convención de la ruta /obras). Elige la cotización aprobada/emitida más reciente vinculada al presupuesto.

```typescript
import { NextResponse } from "next/server";
import { importarPlanDesdeCotizacion } from "@/lib/plan-compra/importar";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/obras/[id]/plan/importar — importa el plan desde la cotización vinculada ([id] = presupuesto_id). */
export async function POST(_req: Request, ctx: Params) {
  const { id: presupuestoId } = await ctx.params;
  const sb = createSupabaseAdminClient();

  const { data: cots, error } = await sb
    .from("cotizaciones")
    .select("id")
    .eq("presupuesto_id", presupuestoId)
    .in("estado", ["aprobada", "documento_emitido"])
    .order("creado_at", { ascending: false })
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cots || cots.length === 0) {
    return NextResponse.json({ insertados: 0, motivo: "sin_cotizacion" });
  }

  const resultado = await importarPlanDesdeCotizacion(sb, presupuestoId, cots[0].id);
  return NextResponse.json(resultado);
}
```

- [ ] **Step 4: Verificar build y tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/plan-compra src/lib/cotizador`
Expected: sin errores de tipos; tests existentes del cotizador siguen PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-compra/importar.ts src/lib/cotizador/crear-obra.ts "src/app/api/obras/[id]/plan/importar/route.ts"
git commit -m "feat: sembrado del plan al aprobar cotización + import retroactivo"
```

---

### Task 4: Cálculo puro del cruce

**Files:**
- Create: `src/lib/plan-compra/cruce.ts`
- Test: `src/lib/plan-compra/__tests__/cruce.test.ts`

**Interfaces:**
- Consumes: `PlanItemRow`, `cotizadoMedio` (Task 2).
- Produces:

```typescript
export type GastoParaCruce = {
  id: string;
  descripcion: string;
  importe_ars: number; // YA convertido con importeGastoObraArs
  plan_item_id: string | null;
  fecha: string;
};
export type FilaCruce = {
  item: PlanItemRow;
  cotizado: number | null;   // punto medio del snapshot; null = agregado sin cotizar
  plan: number;              // 0 si excluido
  real: number;              // suma de gastos vinculados
  cant_gastos: number;
  desvio_pct: number | null; // (real - cotizado) / cotizado, solo si hay ambos
};
export type TotalesCruce = {
  cotizado: number; plan: number;
  real_asignado: number; real_sin_asignar: number; real_total: number;
};
export type MargenCruce = {
  cobrado: number | null;      // presupuesto/obra: monto a cobrar
  margen_ars: number | null;   // cobrado - real_total
  margen_pct: number | null;
  margen_plan_ars: number | null; // cobrado - plan (lo que pensabas ganar)
};
export type Cruce = {
  filas: FilaCruce[];               // orden: materiales+extras, después MO
  sin_asignar: GastoParaCruce[];
  totales: TotalesCruce;
  margen: MargenCruce;
};
export function calcularCruce(items: PlanItemRow[], gastos: GastoParaCruce[], cobrado: number | null): Cruce;
```

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { describe, expect, it } from "vitest";
import { calcularCruce, type GastoParaCruce } from "../cruce";
import type { PlanItemRow } from "../tipos";

function item(p: Partial<PlanItemRow>): PlanItemRow {
  return {
    id: "i1", creado_at: "2026-07-01T00:00:00Z",
    presupuesto_id: "pres-1", cotizacion_id: "cot-1",
    origen: "cotizacion", tipo: "material",
    nombre: "Ítem", etapa: null, unidad: "u",
    cantidad: 2, precio_unitario: 100000,
    incluido: true, notas: null,
    cotizado: {
      cantidad: 2, unidad: "u", precio_min: 90000, precio_max: 110000,
      subtotal_min: 180000, subtotal_max: 220000, fuente: "easy", fecha: "2026-07-01",
    },
    ...p,
  };
}

function gasto(p: Partial<GastoParaCruce>): GastoParaCruce {
  return { id: "g1", descripcion: "compra", importe_ars: 0, plan_item_id: null, fecha: "2026-07-05", ...p };
}

describe("calcularCruce", () => {
  it("fila con cotizado (punto medio), plan (cant x precio) y real (gastos vinculados)", () => {
    const items = [item({ id: "latex" })];
    const gastos = [
      gasto({ id: "g1", plan_item_id: "latex", importe_ars: 95000 }),
      gasto({ id: "g2", plan_item_id: "latex", importe_ars: 100000 }),
    ];
    const c = calcularCruce(items, gastos, 500000);
    expect(c.filas[0]).toMatchObject({
      cotizado: 200000, plan: 200000, real: 195000, cant_gastos: 2, desvio_pct: -2.5,
    });
  });

  it("excluido: plan 0, cotizado visible; agregado manual: cotizado null", () => {
    const items = [
      item({ id: "ducha", nombre: "Plato de ducha", incluido: false }),
      item({ id: "flete", nombre: "Flete olvidado", origen: "manual", cotizado: null, cantidad: 1, precio_unitario: 40000 }),
    ];
    const c = calcularCruce(items, [gasto({ plan_item_id: "flete", importe_ars: 42000 })], null);
    expect(c.filas.find((f) => f.item.id === "ducha")).toMatchObject({ cotizado: 200000, plan: 0, real: 0 });
    expect(c.filas.find((f) => f.item.id === "flete")).toMatchObject({ cotizado: null, plan: 40000, real: 42000, desvio_pct: null });
  });

  it("plan sin precio cargado cae al cotizado medio si está incluido", () => {
    const items = [item({ precio_unitario: null })];
    const c = calcularCruce(items, [], null);
    expect(c.filas[0].plan).toBe(200000);
  });

  it("sin asignar entra al real_total y al margen; nada queda escondido", () => {
    const items = [item({ id: "latex" })];
    const gastos = [
      gasto({ id: "g1", plan_item_id: "latex", importe_ars: 150000 }),
      gasto({ id: "g2", plan_item_id: null, importe_ars: 50000 }),
    ];
    const c = calcularCruce(items, gastos, 500000);
    expect(c.totales).toMatchObject({
      cotizado: 200000, plan: 200000, real_asignado: 150000, real_sin_asignar: 50000, real_total: 200000,
    });
    expect(c.sin_asignar).toHaveLength(1);
    expect(c.margen).toMatchObject({ cobrado: 500000, margen_ars: 300000, margen_pct: 60, margen_plan_ars: 300000 });
  });

  it("sin cobrado: margen null pero totales completos", () => {
    const c = calcularCruce([item({})], [], null);
    expect(c.margen).toMatchObject({ cobrado: null, margen_ars: null, margen_pct: null, margen_plan_ars: null });
  });

  it("ordena materiales y extras antes que mano de obra", () => {
    const items = [
      item({ id: "mo", tipo: "mano_de_obra", nombre: "Pintor" }),
      item({ id: "mat", tipo: "material", nombre: "Látex" }),
      item({ id: "ex", tipo: "extra", nombre: "Flete" }),
    ];
    const c = calcularCruce(items, [], null);
    expect(c.filas.map((f) => f.item.id)).toEqual(["mat", "ex", "mo"]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/plan-compra/__tests__/cruce.test.ts`
Expected: FAIL — `Cannot find module '../cruce'`.

- [ ] **Step 3: Implementar `cruce.ts`**

```typescript
import { cotizadoMedio, type PlanItemRow } from "./tipos";

export type GastoParaCruce = {
  id: string;
  descripcion: string;
  importe_ars: number;
  plan_item_id: string | null;
  fecha: string;
};

export type FilaCruce = {
  item: PlanItemRow;
  cotizado: number | null;
  plan: number;
  real: number;
  cant_gastos: number;
  desvio_pct: number | null;
};

export type TotalesCruce = {
  cotizado: number;
  plan: number;
  real_asignado: number;
  real_sin_asignar: number;
  real_total: number;
};

export type MargenCruce = {
  cobrado: number | null;
  margen_ars: number | null;
  margen_pct: number | null;
  margen_plan_ars: number | null;
};

export type Cruce = {
  filas: FilaCruce[];
  sin_asignar: GastoParaCruce[];
  totales: TotalesCruce;
  margen: MargenCruce;
};

const ORDEN_TIPO: Record<PlanItemRow["tipo"], number> = { material: 0, extra: 1, mano_de_obra: 2 };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Valor plan de un ítem: excluido = 0; sin precio cargado cae al cotizado medio. */
function valorPlan(item: PlanItemRow): number {
  if (!item.incluido) return 0;
  if (item.cantidad != null && item.precio_unitario != null) {
    return Math.round(item.cantidad * item.precio_unitario);
  }
  return cotizadoMedio(item) ?? 0;
}

/**
 * El cruce cotizado / plan / real (spec 2026-07-03). Puro y determinístico:
 * la IA no suma. Los gastos sin asignar entran SIEMPRE al real_total y al
 * margen — nada queda escondido.
 */
export function calcularCruce(
  items: PlanItemRow[],
  gastos: GastoParaCruce[],
  cobrado: number | null
): Cruce {
  const porItem = new Map<string, GastoParaCruce[]>();
  const sinAsignar: GastoParaCruce[] = [];
  const ids = new Set(items.map((i) => i.id));
  for (const g of gastos) {
    if (g.plan_item_id && ids.has(g.plan_item_id)) {
      const lista = porItem.get(g.plan_item_id) ?? [];
      lista.push(g);
      porItem.set(g.plan_item_id, lista);
    } else {
      sinAsignar.push(g);
    }
  }

  const ordenados = [...items].sort(
    (a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.creado_at.localeCompare(b.creado_at)
  );

  const filas: FilaCruce[] = ordenados.map((item) => {
    const propios = porItem.get(item.id) ?? [];
    const real = Math.round(propios.reduce((acc, g) => acc + g.importe_ars, 0));
    const cotizado = cotizadoMedio(item);
    const desvio =
      cotizado != null && cotizado > 0 && propios.length > 0
        ? round1(((real - cotizado) / cotizado) * 100)
        : null;
    return { item, cotizado, plan: valorPlan(item), real, cant_gastos: propios.length, desvio_pct: desvio };
  });

  const totales: TotalesCruce = {
    cotizado: filas.reduce((a, f) => a + (f.cotizado ?? 0), 0),
    plan: filas.reduce((a, f) => a + f.plan, 0),
    real_asignado: filas.reduce((a, f) => a + f.real, 0),
    real_sin_asignar: Math.round(sinAsignar.reduce((a, g) => a + g.importe_ars, 0)),
    real_total: 0,
  };
  totales.real_total = totales.real_asignado + totales.real_sin_asignar;

  const margen: MargenCruce =
    cobrado == null
      ? { cobrado: null, margen_ars: null, margen_pct: null, margen_plan_ars: null }
      : {
          cobrado,
          margen_ars: cobrado - totales.real_total,
          margen_pct: cobrado > 0 ? round1(((cobrado - totales.real_total) / cobrado) * 100) : null,
          margen_plan_ars: cobrado - totales.plan,
        };

  return { filas, sin_asignar: sinAsignar, totales, margen };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/lib/plan-compra/__tests__/cruce.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-compra/cruce.ts src/lib/plan-compra/__tests__/cruce.test.ts
git commit -m "feat: cálculo puro del cruce cotizado/plan/real"
```

---

### Task 5: Pantalla `/obras/[id]/plan` — tab Plan (edición)

**Files:**
- Create: `src/app/obras/[id]/plan/page.tsx`
- Create: `src/app/obras/[id]/plan/plan-screen.tsx`

**Interfaces:**
- Consumes: tabla `obra_plan_items` (Task 1), `PlanItemRow` (Task 2), endpoint importar (Task 3), `calcularCruce` (Task 4, se usa en Task 6 dentro de este mismo screen).
- Produces: componente cliente `PlanScreen({ presupuestoId })`; patrón idéntico a `gastos-screen.tsx` (supabase browser client directo, `useRealtimeTable`).

- [ ] **Step 1: `page.tsx`** (espejo exacto de `gastos/page.tsx`)

```typescript
import { PlanScreen } from "./plan-screen";

export default async function ObrasPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanScreen presupuestoId={id} />;
}
```

- [ ] **Step 2: `plan-screen.tsx`**

Estructura (client component, clases copiadas de gastos-screen). Carga: `obra_plan_items` por presupuesto, `presupuestos_gastos` (id, descripcion, importe, fecha, plan_item_id) por presupuesto, `obras.monto_total_a_cobrar_ars` por presupuesto_id. Estado: `tab: "plan" | "cruce"`, `items`, `gastos`, `cobrado`.

```tsx
"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format-currency";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import { useRealtimeTable } from "@/lib/use-realtime-table";
import { calcularCruce, type GastoParaCruce } from "@/lib/plan-compra/cruce";
import { cotizadoMedio, type PlanItemRow, type PlanTipo } from "@/lib/plan-compra/tipos";

const labelCls =
  "mb-1 block font-mono-hud text-[10px] font-medium uppercase tracking-[0.14em] text-cdm-muted";
const inputCls =
  "w-full rounded-xl border border-cdm-line bg-cdm-panel px-3 py-2.5 text-sm text-cdm-fg placeholder:text-cdm-muted focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cdm-accent";
const sectionCls =
  "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-6 md:p-8";
const thCls =
  "border-b border-cdm-line px-3 py-3 text-left font-mono-hud text-[10px] font-bold uppercase tracking-[0.14em] text-cdm-muted md:px-4";
const tdCls = "border-b border-cdm-line px-3 py-3 align-middle md:px-4";

const TIPO_LABEL: Record<PlanTipo, string> = {
  material: "Materiales",
  extra: "Materiales",
  mano_de_obra: "Mano de obra",
};

type GastoRow = {
  id: string;
  descripcion: string;
  importe: number | string;
  fecha: string;
  plan_item_id: string | null;
};

export function PlanScreen({ presupuestoId }: { presupuestoId: string }) {
  const [tab, setTab] = useState<"plan" | "cruce">("plan");
  const [items, setItems] = useState<PlanItemRow[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [cobrado, setCobrado] = useState<number | null>(null);
  const [nombreObra, setNombreObra] = useState<string>("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [plan, gas, obra, pres] = await Promise.all([
      supabase
        .from("obra_plan_items")
        .select("*")
        .eq("presupuesto_id", presupuestoId)
        .order("creado_at", { ascending: true }),
      supabase
        .from("presupuestos_gastos")
        .select("id, descripcion, importe, fecha, plan_item_id")
        .eq("presupuesto_id", presupuestoId)
        .order("fecha", { ascending: true }),
      supabase
        .from("obras")
        .select("monto_total_a_cobrar_ars")
        .eq("presupuesto_id", presupuestoId)
        .maybeSingle(),
      supabase
        .from("presupuestos")
        .select("nombre_obra")
        .eq("id", presupuestoId)
        .maybeSingle(),
    ]);
    if (plan.error) setError(plan.error.message);
    setItems((plan.data ?? []) as PlanItemRow[]);
    setGastos((gas.data ?? []) as GastoRow[]);
    const monto = obra.data?.monto_total_a_cobrar_ars;
    setCobrado(monto == null ? null : Number(monto));
    setNombreObra(pres.data?.nombre_obra ?? "");
    setCargando(false);
  }, [presupuestoId]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeTable("obra_plan_items", load);
  useRealtimeTable("presupuestos_gastos", load);

  const gastosCruce: GastoParaCruce[] = useMemo(
    () =>
      gastos.map((g) => ({
        id: g.id,
        descripcion: g.descripcion ?? "",
        importe_ars: importeGastoObraArs(g),
        plan_item_id: g.plan_item_id,
        fecha: String(g.fecha ?? "").slice(0, 10),
      })),
    [gastos]
  );
  const cruce = useMemo(
    () => calcularCruce(items, gastosCruce, cobrado),
    [items, gastosCruce, cobrado]
  );

  async function patchItem(id: string, patch: Partial<PlanItemRow>) {
    const supabase = createClient();
    const { error: e } = await supabase.from("obra_plan_items").update(patch).eq("id", id);
    if (e) setError(e.message);
    else await load();
  }

  async function agregarItem(tipo: PlanTipo) {
    const nombre = window.prompt("Nombre del ítem (agregado fuera de cotización):");
    if (!nombre?.trim()) return;
    const supabase = createClient();
    const { error: e } = await supabase.from("obra_plan_items").insert({
      presupuesto_id: presupuestoId,
      origen: "manual",
      tipo,
      nombre: nombre.trim(),
      cantidad: 1,
      incluido: true,
    });
    if (e) setError(e.message);
    else await load();
  }

  async function borrarItem(item: PlanItemRow) {
    const conGastos = gastos.some((g) => g.plan_item_id === item.id);
    if (item.origen === "cotizacion" || conGastos) return; // guard: solo manuales sin gastos
    if (!window.confirm(`¿Borrar "${item.nombre}"?`)) return;
    const supabase = createClient();
    const { error: e } = await supabase.from("obra_plan_items").delete().eq("id", item.id);
    if (e) setError(e.message);
    else await load();
  }

  async function importarDesdeCotizacion() {
    setImportando(true);
    try {
      const res = await fetch(`/api/obras/${presupuestoId}/plan/importar`, { method: "POST" });
      const json = (await res.json()) as { insertados?: number; motivo?: string; error?: string };
      if (json.error) setError(json.error);
      else if (json.motivo === "sin_cotizacion") setError("Esta obra no tiene cotización vinculada.");
      else if (json.motivo === "ya_importado") setError("El plan ya fue importado de esa cotización.");
      await load();
    } finally {
      setImportando(false);
    }
  }

  const bloques: Array<{ titulo: string; filas: typeof cruce.filas }> = [
    { titulo: "Materiales", filas: cruce.filas.filter((f) => f.item.tipo !== "mano_de_obra") },
    { titulo: "Mano de obra", filas: cruce.filas.filter((f) => f.item.tipo === "mano_de_obra") },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href={`/obras/${presupuestoId}`} className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-cdm-fg">
            ← Obra
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cdm-fg">
            Plan y cruce{nombreObra ? ` — ${nombreObra}` : ""}
          </h1>
        </div>
        <RavnLogo />
      </header>

      <nav className="mb-6 flex gap-2">
        {(["plan", "cruce"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 font-mono-hud text-[11px] uppercase tracking-[0.14em] ring-1 ${
              tab === t ? "bg-cdm-fg text-cdm-bg ring-cdm-fg" : "text-cdm-muted ring-cdm-line hover:text-cdm-fg"
            }`}
          >
            {t === "plan" ? "Plan de compra" : "Cruce"}
          </button>
        ))}
      </nav>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
      {cargando ? (
        <p className="text-sm text-cdm-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <section className={sectionCls}>
          <p className="text-sm text-cdm-muted">
            Esta obra todavía no tiene plan de compra.
          </p>
          <div className="mt-4 flex gap-3">
            <button onClick={importarDesdeCotizacion} disabled={importando} className={inputCls + " w-auto cursor-pointer"}>
              {importando ? "Importando…" : "Importar desde la cotización"}
            </button>
            <button onClick={() => void agregarItem("material")} className={inputCls + " w-auto cursor-pointer"}>
              + Ítem manual
            </button>
          </div>
        </section>
      ) : tab === "plan" ? (
        <PlanTab
          bloques={bloques}
          gastos={gastos}
          onPatch={patchItem}
          onAgregar={agregarItem}
          onBorrar={borrarItem}
        />
      ) : (
        <CruceTab cruce={cruce} onAsignar={load} presupuestoId={presupuestoId} />
      )}
    </main>
  );
}
```

`PlanTab` (mismo archivo): por bloque, tabla con columnas ÍTEM / COTIZADO / CANT / PRECIO / NOTA / acciones. Toggle incluido = checkbox al inicio de la fila (excluido → fila con `opacity-40 line-through`). Cantidad y precio: inputs numéricos con `onBlur` → `onPatch(id, { cantidad, precio_unitario })`. Nota: input texto con `onBlur`. Columna COTIZADO muestra `formatMoney(cotizadoMedio(item))` o "—" si manual. Botón borrar (Trash2) solo visible si `origen === "manual"` y sin gastos vinculados. Botón "+ Ítem" por bloque (`onAgregar("material")` / `onAgregar("mano_de_obra")`). Leyenda al pie del bloque Materiales:

```tsx
<p className="mt-3 font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
  Regla: misma cosa con otra marca → editá la fila · concepto distinto → excluí y agregá
</p>
```

`CruceTab` se implementa en Task 6 — en esta task dejarlo como placeholder funcional mínimo que renderiza `<p className="text-sm text-cdm-muted">Cruce en construcción.</p>` para que el build pase (se reemplaza completo en la task siguiente).

- [ ] **Step 3: Verificar que `useRealtimeTable` existe con esa firma**

Run: `grep -n "export function useRealtimeTable" src/lib/use-realtime-table.ts || grep -rn "useRealtimeTable" src/lib | head -3`
Si el hook vive en otro path (ver import real en `obra-orbital-screen.tsx` línea ~144), copiar ese import exacto.

- [ ] **Step 4: Build**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Probar manual**

Run: `npm run dev` → abrir `http://localhost:3000/obras/<presupuesto_id>/plan` de una obra real (ej. Baño Correa). Ver estado vacío → botón importar (si tiene cotización vinculada) → aparecen ítems en dos bloques → toggle excluir, editar precio, agregar manual, borrar manual.

- [ ] **Step 6: Commit**

```bash
git add "src/app/obras/[id]/plan"
git commit -m "feat: pantalla plan de compra de la obra (tab Plan)"
```

---

### Task 6: Tab Cruce — comparación + asignación de gastos sin asignar

**Files:**
- Modify: `src/app/obras/[id]/plan/plan-screen.tsx` (reemplazar el placeholder `CruceTab`)

**Interfaces:**
- Consumes: `Cruce`, `FilaCruce`, `GastoParaCruce` (Task 4).
- Produces: `CruceTab({ cruce, presupuestoId, onAsignar })` — asignar actualiza `presupuestos_gastos.plan_item_id` y llama `onAsignar()` (el `load` del padre).

- [ ] **Step 1: Implementar `CruceTab`**

```tsx
function CruceTab({
  cruce,
  presupuestoId,
  onAsignar,
}: {
  cruce: Cruce;
  presupuestoId: string;
  onAsignar: () => Promise<void>;
}) {
  const { totales, margen, filas, sin_asignar } = cruce;

  async function asignarGasto(gastoId: string, planItemId: string | null) {
    const supabase = createClient();
    const { error } = await supabase
      .from("presupuestos_gastos")
      .update({ plan_item_id: planItemId })
      .eq("id", gastoId);
    if (!error) await onAsignar();
  }

  const resumen: Array<{ label: string; valor: string; fuerte?: boolean }> = [
    { label: "Cobrado al cliente", valor: margen.cobrado != null ? formatMoney(margen.cobrado) : "—" },
    { label: "Cotizado (costo)", valor: formatMoney(totales.cotizado) },
    { label: "Plan (costo)", valor: formatMoney(totales.plan) },
    { label: "Real (costo)", valor: formatMoney(totales.real_total) },
    {
      label: "Margen real",
      valor:
        margen.margen_ars != null
          ? `${formatMoney(margen.margen_ars)} · ${margen.margen_pct ?? "—"}%`
          : "—",
      fuerte: true,
    },
  ];

  return (
    <div className="space-y-6">
      <section className={sectionCls}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {resumen.map((r) => (
            <div key={r.label}>
              <p className={labelCls}>{r.label}</p>
              <p className={`text-lg tracking-tight ${r.fuerte ? "font-semibold text-cdm-fg" : "text-cdm-fg"}`}>
                {r.valor}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className={sectionCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>Ítem</th>
              <th className={thCls}>Cotizado</th>
              <th className={thCls}>Plan</th>
              <th className={thCls}>Real</th>
              <th className={thCls}>Desvío</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.item.id} className={!f.item.incluido ? "opacity-40" : ""}>
                <td className={tdCls}>
                  {f.item.nombre}
                  {!f.item.incluido && (
                    <span className="ml-2 font-mono-hud text-[10px] uppercase text-cdm-muted">excluido</span>
                  )}
                  {f.cotizado == null && (
                    <span className="ml-2 font-mono-hud text-[10px] uppercase text-amber-600">sin cotizar</span>
                  )}
                </td>
                <td className={tdCls}>{f.cotizado != null ? formatMoney(f.cotizado) : "—"}</td>
                <td className={tdCls}>{f.item.incluido ? formatMoney(f.plan) : "—"}</td>
                <td className={tdCls}>{f.cant_gastos > 0 ? formatMoney(f.real) : "—"}</td>
                <td className={tdCls}>
                  {f.desvio_pct != null ? (
                    <span className={f.desvio_pct <= 0 ? "text-emerald-600" : "text-red-500"}>
                      {f.desvio_pct > 0 ? "+" : ""}
                      {f.desvio_pct}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sin_asignar.length > 0 && (
        <section className={sectionCls}>
          <p className={labelCls}>Gastos sin asignar — {formatMoney(totales.real_sin_asignar)}</p>
          <table className="w-full text-sm">
            <tbody>
              {sin_asignar.map((g) => (
                <tr key={g.id}>
                  <td className={tdCls}>{g.fecha}</td>
                  <td className={tdCls}>{g.descripcion || "Gasto"}</td>
                  <td className={tdCls}>{formatMoney(g.importe_ars)}</td>
                  <td className={tdCls}>
                    <select
                      className={inputCls}
                      defaultValue=""
                      onChange={(e) => void asignarGasto(g.id, e.target.value || null)}
                    >
                      <option value="">Asignar a ítem…</option>
                      {filas.map((f) => (
                        <option key={f.item.id} value={f.item.id}>
                          {f.item.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
```

Nota: `presupuestoId` queda en la firma por si la asignación pasa a un endpoint; si el linter marca unused, sacarlo de la firma y del call-site.

- [ ] **Step 2: Build + prueba manual**

Run: `npx tsc --noEmit`, después en el dev server: tab Cruce muestra resumen y tabla; asignar un gasto sin asignar desde el selector lo mueve a la fila del ítem y actualiza totales en vivo.

- [ ] **Step 3: Commit**

```bash
git add "src/app/obras/[id]/plan/plan-screen.tsx"
git commit -m "feat: tab cruce cotizado/plan/real con asignación de gastos"
```

---

### Task 7: Selector "ítem del plan" al cargar un gasto

**Files:**
- Modify: `src/app/obras/[id]/gastos/gastos-screen.tsx`

**Interfaces:**
- Consumes: tabla `obra_plan_items`; el form de alta de gastos existente (estado `draft`, `insertPayload` alrededor de la línea 655).
- Produces: gastos nuevos con `plan_item_id` opcional.

- [ ] **Step 1: Cargar los ítems del plan**

Junto a los estados existentes del screen, agregar:

```typescript
const [planItems, setPlanItems] = useState<Array<{ id: string; nombre: string; incluido: boolean }>>([]);
```

Dentro del `load` existente (o un `useEffect` propio sobre `effectivePresupuestoId`):

```typescript
const { data: plan } = await supabase
  .from("obra_plan_items")
  .select("id, nombre, incluido")
  .eq("presupuesto_id", pid)
  .order("creado_at", { ascending: true });
setPlanItems((plan ?? []) as Array<{ id: string; nombre: string; incluido: boolean }>);
```

- [ ] **Step 2: Campo en el draft + select en el form**

Al tipo/estado del `draft` agregar `plan_item_id: string` (vacío = sin asignar; inicializar `""` donde se crea el draft). En el form de alta, después del campo descripción — SOLO si `planItems.length > 0`:

```tsx
<div>
  <label className={labelCls}>Ítem del plan (opcional)</label>
  <select
    className={inputCls}
    value={draft.plan_item_id}
    onChange={(e) => setDraft({ ...draft, plan_item_id: e.target.value })}
  >
    <option value="">Sin asignar</option>
    {planItems.map((p) => (
      <option key={p.id} value={p.id}>
        {p.nombre}{p.incluido ? "" : " (excluido)"}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 3: Incluir en el insert**

En `insertPayload` (junto a los campos condicionales existentes):

```typescript
if (draft.plan_item_id) {
  insertPayload.plan_item_id = draft.plan_item_id;
}
```

- [ ] **Step 4: Build + prueba manual**

Run: `npx tsc --noEmit`. En dev: obra CON plan → el selector aparece y el gasto guardado figura vinculado en el cruce; obra SIN plan → el form se ve idéntico a hoy.

- [ ] **Step 5: Commit**

```bash
git add "src/app/obras/[id]/gastos/gastos-screen.tsx"
git commit -m "feat: vínculo opcional gasto → ítem del plan al cargar gastos"
```

---

### Task 8: Lección enriquecida — contraste por plan al cerrar la obra

**Files:**
- Create: `src/lib/plan-compra/leccion.ts`
- Test: `src/lib/plan-compra/__tests__/leccion.test.ts`
- Modify: `src/lib/cotizador/contraste-obra.ts`

**Interfaces:**
- Consumes: `Cruce` (Task 4).
- Produces: `leccionDesdeCruce(recetaNombre: string, cruce: Cruce): { leccion: string; ajuste: Record<string, unknown> }`. En `correrContrasteObra`: si la obra tiene plan → lección modo plan; si no → fuzzy actual intacto.

- [ ] **Step 1: Test que falla**

```typescript
import { describe, expect, it } from "vitest";
import { leccionDesdeCruce } from "../leccion";
import type { Cruce } from "../cruce";
import type { PlanItemRow } from "../tipos";

function fila(p: {
  id: string; nombre: string; cotizado: number | null; plan: number; real: number;
  cant_gastos?: number; desvio_pct?: number | null; incluido?: boolean; origen?: "cotizacion" | "manual";
}) {
  const item = {
    id: p.id, creado_at: "2026-07-01T00:00:00Z", presupuesto_id: "pres", cotizacion_id: "cot",
    origen: p.origen ?? "cotizacion", tipo: "material", nombre: p.nombre, etapa: null, unidad: null,
    cantidad: 1, precio_unitario: p.plan, incluido: p.incluido ?? true, notas: null,
    cotizado: p.cotizado == null ? null : {
      cantidad: 1, unidad: null, precio_min: p.cotizado, precio_max: p.cotizado,
      subtotal_min: p.cotizado, subtotal_max: p.cotizado, fuente: "test", fecha: "2026-07-01",
    },
  } as PlanItemRow;
  return {
    item, cotizado: p.cotizado, plan: p.incluido === false ? 0 : p.plan,
    real: p.real, cant_gastos: p.cant_gastos ?? (p.real > 0 ? 1 : 0), desvio_pct: p.desvio_pct ?? null,
  };
}

const cruce: Cruce = {
  filas: [
    fila({ id: "a", nombre: "Látex", cotizado: 200000, plan: 200000, real: 160000, desvio_pct: -20 }),
    fila({ id: "b", nombre: "Plato de ducha", cotizado: 180000, plan: 0, real: 0, incluido: false }),
    fila({ id: "c", nombre: "Flete olvidado", cotizado: null, plan: 40000, real: 42000, origen: "manual" }),
  ],
  sin_asignar: [{ id: "g9", descripcion: "varios", importe_ars: 15000, plan_item_id: null, fecha: "2026-07-10" }],
  totales: { cotizado: 380000, plan: 240000, real_asignado: 202000, real_sin_asignar: 15000, real_total: 217000 },
  margen: { cobrado: 600000, margen_ars: 383000, margen_pct: 63.8, margen_plan_ars: 360000 },
};

describe("leccionDesdeCruce", () => {
  it("arma la lección con desvíos relevantes, olvidados y excluidos", () => {
    const { leccion, ajuste } = leccionDesdeCruce("pintura-interior", cruce);
    expect(leccion).toContain("Látex");
    expect(leccion).toContain("-20");
    expect(leccion).toContain("Flete olvidado");
    expect(leccion).toContain("excluido");
    expect(ajuste).toMatchObject({
      modo: "plan",
      total_cotizado: 380000,
      total_real: 217000,
      margen_real_pct: 63.8,
    });
    const a = ajuste as { desviados: unknown[]; sin_cotizar: unknown[]; excluidos: unknown[] };
    expect(a.desviados).toHaveLength(1);
    expect(a.sin_cotizar).toHaveLength(1);
    expect(a.excluidos).toHaveLength(1);
  });

  it("ignora desvíos chicos (|desvío| < 10%)", () => {
    const chico: Cruce = { ...cruce, filas: [fila({ id: "a", nombre: "Látex", cotizado: 200000, plan: 200000, real: 205000, desvio_pct: 2.5 })] };
    const { ajuste } = leccionDesdeCruce("x", chico);
    expect((ajuste as { desviados: unknown[] }).desviados).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/plan-compra/__tests__/leccion.test.ts`
Expected: FAIL — `Cannot find module '../leccion'`.

- [ ] **Step 3: Implementar `leccion.ts`**

```typescript
import type { Cruce } from "./cruce";

const UMBRAL_DESVIO_PCT = 10;

/**
 * Lección tipo contraste_obra a partir del cruce por plan (vínculo exacto
 * gasto↔ítem, sin matching difuso). Se guarda en cotizador_lecciones y el
 * cotizador maestro la lee antes de la próxima cotización de la receta.
 */
export function leccionDesdeCruce(
  recetaNombre: string,
  cruce: Cruce
): { leccion: string; ajuste: Record<string, unknown> } {
  const desviados = cruce.filas.filter(
    (f) => f.desvio_pct != null && Math.abs(f.desvio_pct) >= UMBRAL_DESVIO_PCT
  );
  const sinCotizar = cruce.filas.filter((f) => f.cotizado == null && (f.plan > 0 || f.real > 0));
  const excluidos = cruce.filas.filter((f) => !f.item.incluido);

  const partes: string[] = [];
  for (const f of desviados) {
    partes.push(`${f.item.nombre}: cotizado ${f.cotizado}, real ${f.real} (${f.desvio_pct}%)`);
  }
  for (const f of sinCotizar) {
    partes.push(`${f.item.nombre}: NO estaba cotizado, salió ${f.real || f.plan} — cotizarlo la próxima`);
  }
  for (const f of excluidos) {
    partes.push(`${f.item.nombre}: cotizado ${f.cotizado} pero excluido en obra (no se compró)`);
  }
  if (cruce.totales.real_sin_asignar > 0) {
    partes.push(`Gastos sin asignar por ${cruce.totales.real_sin_asignar}`);
  }
  const margen =
    cruce.margen.margen_pct != null ? ` Margen real ${cruce.margen.margen_pct}%.` : "";
  const leccion =
    (partes.length > 0
      ? `Contraste por plan (${recetaNombre}): ${partes.join("; ")}.`
      : `Contraste por plan (${recetaNombre}): sin desvíos relevantes.`) + margen;

  return {
    leccion,
    ajuste: {
      modo: "plan",
      total_cotizado: cruce.totales.cotizado,
      total_plan: cruce.totales.plan,
      total_real: cruce.totales.real_total,
      margen_real_pct: cruce.margen.margen_pct,
      desviados: desviados.map((f) => ({
        nombre: f.item.nombre, cotizado: f.cotizado, real: f.real, desvio_pct: f.desvio_pct,
      })),
      sin_cotizar: sinCotizar.map((f) => ({ nombre: f.item.nombre, real: f.real || f.plan })),
      excluidos: excluidos.map((f) => ({ nombre: f.item.nombre, cotizado: f.cotizado })),
      sin_asignar_total: cruce.totales.real_sin_asignar,
    },
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/lib/plan-compra/__tests__/leccion.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Enchufar en `correrContrasteObra`**

En `src/lib/cotizador/contraste-obra.ts`, dentro del `try` y ANTES del fetch de cotizaciones actual, agregar el camino plan (si hay plan → lección por plan y listo; si no → sigue el flujo fuzzy existente SIN tocarlo):

```typescript
    // Camino plan (spec 2026-07-03): si la obra tiene plan de compra, el
    // contraste usa el vínculo exacto gasto↔ítem en vez del matching difuso.
    const { data: planItems } = await sb
      .from("obra_plan_items")
      .select("*")
      .eq("presupuesto_id", presupuestoId);
    if (planItems && planItems.length > 0) {
      const { data: gastosPlan } = await sb
        .from("presupuestos_gastos")
        .select("id, descripcion, importe, fecha, plan_item_id")
        .eq("presupuesto_id", presupuestoId);
      const { data: obraRow } = await sb
        .from("obras")
        .select("monto_total_a_cobrar_ars")
        .eq("presupuesto_id", presupuestoId)
        .maybeSingle();
      const { data: cotPlan } = await sb
        .from("cotizaciones")
        .select("id, desglose")
        .eq("presupuesto_id", presupuestoId)
        .in("estado", ["aprobada", "documento_emitido"])
        .limit(1)
        .maybeSingle();

      const cruce = calcularCruce(
        (planItems ?? []) as PlanItemRow[],
        (gastosPlan ?? []).map((g) => ({
          id: String(g.id),
          descripcion: String(g.descripcion ?? ""),
          importe_ars: importeGastoObraArs(g),
          plan_item_id: (g.plan_item_id as string | null) ?? null,
          fecha: String(g.fecha ?? "").slice(0, 10),
        })),
        obraRow?.monto_total_a_cobrar_ars == null ? null : Number(obraRow.monto_total_a_cobrar_ars)
      );
      const recetaNombre =
        ((cotPlan?.desglose as Desglose | null)?.receta_nombre as string | undefined) ?? "sin-receta";
      const { leccion, ajuste } = leccionDesdeCruce(recetaNombre, cruce);
      const { error: eIns } = await sb.from("cotizador_lecciones").insert({
        tipo: "contraste_obra",
        receta_nombre: recetaNombre,
        cotizacion_id: cotPlan?.id ?? null,
        obra_presupuesto_id: presupuestoId,
        leccion,
        ajuste,
      });
      if (eIns) {
        console.error("[contraste-obra] insert lección plan:", eIns.message);
        return 0;
      }
      return 1;
    }
```

Imports nuevos arriba del archivo:

```typescript
import { calcularCruce } from "@/lib/plan-compra/cruce";
import { leccionDesdeCruce } from "@/lib/plan-compra/leccion";
import type { PlanItemRow } from "@/lib/plan-compra/tipos";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
```

- [ ] **Step 6: Tests completos + build**

Run: `npx vitest run && npx tsc --noEmit`
Expected: TODOS los tests del repo PASS (incluidos `contraste.test.ts` — el camino fuzzy no se tocó).

- [ ] **Step 7: Commit**

```bash
git add src/lib/plan-compra/leccion.ts src/lib/plan-compra/__tests__/leccion.test.ts src/lib/cotizador/contraste-obra.ts
git commit -m "feat: lección de cierre por contraste exacto del plan de compra"
```

---

### Task 9: Navegación — acceso al plan desde la obra

**Files:**
- Modify: `src/app/obras/[id]/obra-orbital-screen.tsx` (junto al link existente a `/obras/${presupuestoId}/gastos`, ~línea 252)
- Modify: `src/app/obras/[id]/gastos/gastos-screen.tsx` (link cruzado en el header)

**Interfaces:**
- Consumes: ruta `/obras/[id]/plan` (Task 5).

- [ ] **Step 1: Link en la pantalla orbital**

Copiar el patrón exacto del link a gastos que ya existe (mismas clases) y agregar al lado:

```tsx
<Link href={`/obras/${presupuestoId}/plan`} className={/* mismas clases que el link GASTOS */}>
  PLAN Y CRUCE
</Link>
```

- [ ] **Step 2: Link cruzado en gastos-screen**

En el header de gastos, junto a la navegación existente:

```tsx
<Link
  href={`/obras/${effectivePresupuestoId}/plan`}
  className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted hover:text-cdm-fg"
>
  Plan y cruce →
</Link>
```

- [ ] **Step 3: Build + verificación E2E del circuito completo**

Run: `npx tsc --noEmit && npx vitest run`
Manual en dev (`npm run dev`):
1. Obra existente con cotización (Baño Correa u otra) → orbital → PLAN Y CRUCE → importar → plan poblado.
2. Excluir un ítem, editar un precio, agregar uno manual.
3. Cargar un gasto desde /gastos con el selector → aparece en el cruce.
4. Asignar un gasto viejo desde "sin asignar".
5. Verificar a mano: totales del resumen = cuentas con calculadora.

- [ ] **Step 4: Commit**

```bash
git add "src/app/obras/[id]/obra-orbital-screen.tsx" "src/app/obras/[id]/gastos/gastos-screen.tsx"
git commit -m "feat: navegación a plan y cruce desde la obra"
```

---

## Cobertura de la spec (self-review)

- Tabla `obra_plan_items` + `plan_item_id` → Task 1 (enmienda: presupuesto_id + tipo extra).
- Sembrado al aprobar (loop de oro, best-effort) → Tasks 2–3.
- Import retroactivo → Task 3 + botón en Task 5.
- Plan editable en dos bloques, toggle, alta manual, regla de reemplazos → Task 5.
- Guard de borrado (cotización no se borra, manual sin gastos sí) → Task 5 (`borrarItem`).
- Cruce por ítem + resumen de margen + sin asignar con asignación → Tasks 4 y 6.
- Selector opcional al cargar gasto → Task 7.
- Lección al cierre → Task 8 (vía CERRAR OBRA existente, enmienda 3).
- Navegación → Task 9.
- Fuera de alcance (matching automático, bot, alertas) → no hay tasks, correcto.
