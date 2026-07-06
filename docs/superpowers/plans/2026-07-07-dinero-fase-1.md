# Módulo Dinero — Fase 1 (ledger + libro de deudas + motor de bolsillos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la base de datos del módulo Dinero (ledger `movimientos_plata` + libro de deudas `financiamientos` + vista de bolsillos) y el motor puro de saldos por bolsillo en la app, con chequeo de consistencia contra el motor actual — SIN tocar todavía el flujo del bot ni la UI.

**Architecture:** Ledger central (elegido en la spec sobre "columnas por tabla" y "triggers"): cada operación de plata son 1..n filas con el mismo `grupo_id`; solo `estado='asentado'` suma a saldos; el saldo de un bolsillo es Σ de movimientos asentados por (cuenta, dueño). Durante la convivencia el motor actual (`src/lib/cuentas.ts`) sigue mandando; el nuevo motor (`src/lib/dinero.ts`) calcula en paralelo y un chequeo de consistencia compara ambos. El código suma; la IA no.

**Tech Stack:** Supabase Postgres (migraciones SQL en `supabase/migrations/`, aplicadas con el MCP `apply_migration`), Next.js 15 con lib TS pura, vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-dinero-design.md` (aprobada por Eze 07/07).

## Global Constraints

- El módulo se llama **Dinero** (ruta futura `/dinero`) — NUNCA "Plata".
- Solo movimientos `estado='asentado'` suman a saldos. `borrador` es visible pero no impacta.
- Cada fila del ledger va **en la moneda de su cuenta** (`moneda` redundante con `cuentas.moneda`, valida consistencia). Nunca se convierte con cotización inventada; si la operación cruzó moneda, `cotizacion_ars_por_usd` viene de Eze.
- Dueños: `obra` (con `dueno_obra_id` → `presupuestos.id`), `empresa` (RAVN), `personal` (Eze). `dueno_obra_id` NOT NULL ⟺ `dueno_tipo='obra'`.
- RLS estilo de la casa (ver `20260705090000_cuenta_ajustes.sql`): select/insert `authenticated`; update/delete solo app (`not es_bot()`). El bot escribirá por RPC recién en Fase 2.
- Los gastos históricos NO se tocan: el ledger arranca vacío; la foto inicial es Fase 4.
- Al cierre de la fase: revisión por agente `ravn-code-reviewer` + verificación en vivo (invariante de Eze, spec §Verificación).
- Repo: `~/Documents/ravn`, branch de trabajo actual `home-cards`.

## Roadmap de fases (los planes 2–4 se escriben al cerrar la fase anterior)

1. **(este plan)** Migraciones + vista de bolsillos + motor TS + chequeo de consistencia.
2. Bot: flujo borrador→confirmación (checklist de 8 pasos de la spec), RPCs `security definer` para asentar grupos, espejo al ledger desde cada insert.
3. App: página `/dinero` (cuentas, bolsillos, financiamientos, borradores) + tablero en Salud del Negocio + espejo al ledger desde la app.
4. Foto inicial con Eze + reconstrucción de cruces (siding $450k, volquete $60k) + switch del motor de saldos al ledger.

---

### Task 1: Migración `movimientos_plata` + vista de bolsillos

**Files:**
- Create: `supabase/migrations/20260707100000_dinero_movimientos_plata.sql`

**Interfaces:**
- Produces: tabla `public.movimientos_plata` (columnas exactas abajo) y vista `public.dinero_saldos_bolsillos` con `(cuenta_id, dueno_tipo, dueno_obra_id, moneda, saldo numeric, movimientos bigint)`. Las Tasks 3–4 tipan estas filas en TS; la Fase 2 les inserta.

- [ ] **Step 1: Escribir la migración**

```sql
-- movimientos_plata: LEDGER del módulo Dinero (spec 2026-07-06). Fuente de
-- verdad futura de saldos: cada operación = 1..n filas con el mismo grupo_id
-- (volquete: -90k bolsillo obra Palermo en MP y -60k bolsillo personal en MP).
-- Solo estado='asentado' suma; el bot escribe 'borrador' y el "confirmo" de
-- Eze asienta el grupo entero (RPC en Fase 2). El código suma; la IA no.

create table public.movimientos_plata (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  cuenta_id uuid not null references public.cuentas (id),
  -- Dueño del bolsillo: de quién es esta plata DENTRO de la cuenta.
  dueno_tipo text not null check (dueno_tipo in ('obra', 'empresa', 'personal')),
  dueno_obra_id uuid references public.presupuestos (id),
  -- Con signo, SIEMPRE en la moneda de la cuenta. moneda es redundante a
  -- propósito: valida consistencia (Task 4 y un check acá abajo vía trigger NO
  -- — se valida en app/RPC; el check duro de BD es dueño-coherencia).
  monto numeric not null check (monto <> 0),
  moneda text not null check (moneda in ('ARS', 'USD')),
  -- Solo si la operación cruzó moneda (la declara Eze, nunca se inventa).
  cotizacion_ars_por_usd numeric check (cotizacion_ars_por_usd > 0),
  -- Agrupa las patas de una misma operación; se asienta ATÓMICO por grupo.
  grupo_id uuid not null,
  origen_tipo text not null check (origen_tipo in (
    'gasto_obra', 'gasto_empresa', 'gasto_personal', 'cobro', 'transferencia',
    'financiamiento_devolucion', 'retiro', 'ajuste', 'foto_inicial', 'cierre_obra'
  )),
  -- Fila de la tabla de detalle que espeja (presupuestos_gastos, gastos_empresa,
  -- gastos_personales, cashflow_items, transferencias, retiros_socio,
  -- cuenta_ajustes). Sin FK: apunta a tablas distintas según origen_tipo.
  origen_id uuid,
  estado text not null default 'borrador' check (estado in ('borrador', 'asentado')),
  descripcion text not null default '',
  -- Trazabilidad WhatsApp (mensaje que originó la operación).
  evento_id uuid references public.eventos (id),
  created_at timestamptz not null default now(),
  constraint movimientos_plata_dueno_obra_coherente
    check ((dueno_tipo = 'obra') = (dueno_obra_id is not null))
);

comment on table public.movimientos_plata is
  'Ledger del módulo Dinero: bolsillos por dueño (obra/empresa/personal) dentro de cada cuenta. Solo asentado suma a saldos; grupo_id agrupa las patas de una operación y se asienta atómico.';

create index movimientos_plata_cuenta_estado_idx
  on public.movimientos_plata (cuenta_id, estado);
create index movimientos_plata_grupo_idx
  on public.movimientos_plata (grupo_id);
create index movimientos_plata_dueno_idx
  on public.movimientos_plata (dueno_tipo, dueno_obra_id);

alter table public.movimientos_plata enable row level security;

-- Estilo de la casa (cuenta_ajustes): leer/insertar cualquiera autenticado;
-- editar/borrar solo la app. El bot ASIENTA por RPC security definer (Fase 2),
-- nunca por UPDATE directo.
create policy movimientos_plata_select_auth on public.movimientos_plata
  for select to authenticated using (true);
create policy movimientos_plata_insert_auth on public.movimientos_plata
  for insert to authenticated with check (true);
create policy movimientos_plata_update_no_bot on public.movimientos_plata
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy movimientos_plata_delete_no_bot on public.movimientos_plata
  for delete to authenticated using (not es_bot());

-- Vista de bolsillos: saldo vivo por (cuenta, dueño). Solo asentados.
create view public.dinero_saldos_bolsillos
  with (security_invoker = true) as
select
  cuenta_id,
  dueno_tipo,
  dueno_obra_id,
  moneda,
  sum(monto) as saldo,
  count(*) as movimientos
from public.movimientos_plata
where estado = 'asentado'
group by cuenta_id, dueno_tipo, dueno_obra_id, moneda;

comment on view public.dinero_saldos_bolsillos is
  'Saldo por bolsillo (cuenta × dueño), solo movimientos asentados. El saldo de una cuenta es la suma de sus bolsillos.';
```

- [ ] **Step 2: Aplicar en prod con el MCP de Supabase**

Llamar `mcp__supabase__apply_migration` con `name: "dinero_movimientos_plata"` y el SQL de arriba (queda registrado en `supabase/migrations` remoto; guardar el mismo SQL en el archivo local del repo).

Expected: éxito sin error.

- [ ] **Step 3: Verificar constraints con inserts de prueba (y limpiarlos)**

Vía `mcp__supabase__execute_sql`, usando una cuenta real (`select id from cuentas limit 1`) y una obra real (`select id from presupuestos limit 1`):

```sql
-- 1) Insert válido de grupo borrador (2 patas) → debe pasar:
with c as (select id from public.cuentas where activa limit 1),
     p as (select id from public.presupuestos limit 1),
     g as (select gen_random_uuid() as gid)
insert into public.movimientos_plata
  (cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, grupo_id, origen_tipo, descripcion)
select c.id, 'obra', p.id, -90000, 'ARS', g.gid, 'gasto_obra', 'TEST volquete pata obra' from c, p, g
union all
select c.id, 'personal', null, -60000, 'ARS', g.gid, 'gasto_obra', 'TEST volquete pata Eze' from c, p, g;

-- 2) dueno_tipo='obra' sin dueno_obra_id → debe FALLAR con
--    "movimientos_plata_dueno_obra_coherente":
insert into public.movimientos_plata (cuenta_id, dueno_tipo, monto, moneda, grupo_id, origen_tipo)
select id, 'obra', -1000, 'ARS', gen_random_uuid(), 'gasto_obra' from public.cuentas limit 1;

-- 3) La vista NO muestra borradores → debe devolver 0 filas:
select * from public.dinero_saldos_bolsillos;

-- 4) Limpieza de los TEST:
delete from public.movimientos_plata where descripcion like 'TEST %';
```

Expected: (1) 2 filas insertadas · (2) error de check constraint · (3) 0 filas · (4) 2 filas borradas.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/ravn
git add supabase/migrations/20260707100000_dinero_movimientos_plata.sql
git commit -m "feat(dinero): ledger movimientos_plata + vista de bolsillos (Fase 1)"
```

---

### Task 2: Migración `financiamientos` (libro de deudas)

**Files:**
- Create: `supabase/migrations/20260707110000_dinero_financiamientos.sql`

**Interfaces:**
- Consumes: `movimientos_plata.grupo_id` (Task 1) como `origen_grupo_id`.
- Produces: tabla `public.financiamientos` (columnas exactas abajo). Fase 2 la crea junto al gasto cruzado; Fase 3 la lista en `/dinero`.

- [ ] **Step 1: Escribir la migración**

```sql
-- financiamientos: LIBRO DE DEUDAS entre dueños (spec 2026-07-06). Se crea en
-- la MISMA confirmación que el gasto cruzado ("gasto de Glorietas pagado con
-- bolsillo Pueyrredón → financiamiento Glorietas←Pueyrredón $450k"). La
-- devolución es manual (operación financiamiento_devolucion en el ledger que
-- baja saldo_pendiente); al cierre de la obra lo abierto se netea → absorbido
-- (queda asentado, no desaparece). El tablero muestra la deuda SIEMPRE.

create table public.financiamientos (
  id uuid primary key default gen_random_uuid(),
  deudor_tipo text not null check (deudor_tipo in ('obra', 'empresa', 'personal')),
  deudor_obra_id uuid references public.presupuestos (id),
  acreedor_tipo text not null check (acreedor_tipo in ('obra', 'empresa', 'personal')),
  acreedor_obra_id uuid references public.presupuestos (id),
  monto_original numeric not null check (monto_original > 0),
  saldo_pendiente numeric not null check (saldo_pendiente >= 0),
  moneda text not null check (moneda in ('ARS', 'USD')),
  estado text not null default 'abierto' check (estado in ('abierto', 'devuelto', 'absorbido')),
  -- La operación del ledger que lo creó (grupo entero, no una pata).
  origen_grupo_id uuid not null,
  notas text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financiamientos_deudor_obra_coherente
    check ((deudor_tipo = 'obra') = (deudor_obra_id is not null)),
  constraint financiamientos_acreedor_obra_coherente
    check ((acreedor_tipo = 'obra') = (acreedor_obra_id is not null)),
  constraint financiamientos_pendiente_max
    check (saldo_pendiente <= monto_original)
);

comment on table public.financiamientos is
  'Libro de deudas entre dueños (obra/RAVN/Eze). Nace con el gasto cruzado; devolución manual vía ledger; al cierre de obra lo abierto pasa a absorbido.';

create index financiamientos_deudor_idx
  on public.financiamientos (deudor_tipo, deudor_obra_id) where estado = 'abierto';
create index financiamientos_acreedor_idx
  on public.financiamientos (acreedor_tipo, acreedor_obra_id) where estado = 'abierto';

alter table public.financiamientos enable row level security;

create policy financiamientos_select_auth on public.financiamientos
  for select to authenticated using (true);
create policy financiamientos_insert_auth on public.financiamientos
  for insert to authenticated with check (true);
create policy financiamientos_update_no_bot on public.financiamientos
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy financiamientos_delete_no_bot on public.financiamientos
  for delete to authenticated using (not es_bot());
```

- [ ] **Step 2: Aplicar con `mcp__supabase__apply_migration`** (`name: "dinero_financiamientos"`) y guardar el archivo local.

Expected: éxito sin error.

- [ ] **Step 3: Verificar constraints**

Vía `mcp__supabase__execute_sql`:

```sql
-- 1) Deudor y acreedor obra↔obra válido → debe pasar (y se borra al final):
with p as (select id from public.presupuestos limit 2)
insert into public.financiamientos
  (deudor_tipo, deudor_obra_id, acreedor_tipo, acreedor_obra_id,
   monto_original, saldo_pendiente, moneda, origen_grupo_id, notas)
select 'obra', (select id from p limit 1), 'obra', (select id from p offset 1 limit 1),
       450000, 450000, 'ARS', gen_random_uuid(), 'TEST siding';

-- 2) saldo_pendiente > monto_original → debe FALLAR (financiamientos_pendiente_max):
insert into public.financiamientos
  (deudor_tipo, acreedor_tipo, monto_original, saldo_pendiente, moneda, origen_grupo_id)
values ('personal', 'empresa', 100, 200, 'ARS', gen_random_uuid());

-- 3) Limpieza:
delete from public.financiamientos where notas = 'TEST siding';
```

Expected: (1) 1 fila · (2) error de check · (3) 1 borrada.

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/ravn
git add supabase/migrations/20260707110000_dinero_financiamientos.sql
git commit -m "feat(dinero): libro de deudas financiamientos (Fase 1)"
```

---

### Task 3: Motor de bolsillos en la app — `saldosBolsillos` + `saldosCuentasDesdeLedger`

**Files:**
- Create: `src/lib/dinero.ts`
- Test: `src/lib/dinero.test.ts`

**Interfaces:**
- Consumes: `Moneda`, `parseNum` de `@/lib/cashflow-compute`, `roundArs2` de `@/lib/format-currency` (mismas herramientas que `src/lib/cuentas.ts`).
- Produces (para Task 4 y Fases 3–4):
  - `type DuenoTipo = "obra" | "empresa" | "personal"`
  - `type MovimientoPlataRow = { id: string; cuenta_id: string; dueno_tipo: DuenoTipo; dueno_obra_id: string | null; monto: unknown; moneda: Moneda; grupo_id: string; origen_tipo: string; estado: "borrador" | "asentado" }`
  - `type Bolsillo = { cuenta_id: string; dueno_tipo: DuenoTipo; dueno_obra_id: string | null; moneda: Moneda; saldo: number; movimientos: number }`
  - `claveBolsillo(cuentaId: string, duenoTipo: DuenoTipo, duenoObraId: string | null): string`
  - `saldosBolsillos(movimientos: MovimientoPlataRow[]): Bolsillo[]`
  - `saldosCuentasDesdeLedger(movimientos: MovimientoPlataRow[]): Map<string, number>` (cuenta_id → saldo = Σ bolsillos)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/lib/dinero.test.ts
import { describe, expect, it } from "vitest";
import {
  claveBolsillo,
  saldosBolsillos,
  saldosCuentasDesdeLedger,
  type MovimientoPlataRow,
} from "@/lib/dinero";

const mov = (m: Partial<MovimientoPlataRow>): MovimientoPlataRow => ({
  id: "m-1",
  cuenta_id: "c-mp",
  dueno_tipo: "personal",
  dueno_obra_id: null,
  monto: 0,
  moneda: "ARS",
  grupo_id: "g-1",
  origen_tipo: "gasto_personal",
  estado: "asentado",
  ...m,
});

describe("saldosBolsillos", () => {
  it("suma por (cuenta, dueño) y SOLO movimientos asentados", () => {
    const bolsillos = saldosBolsillos([
      // Caso volquete real: -90k bolsillo obra Palermo + -60k bolsillo Eze, en MP.
      mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-palermo", monto: 200000, origen_tipo: "cobro" }),
      mov({ id: "m-2", dueno_tipo: "obra", dueno_obra_id: "p-palermo", monto: -90000 }),
      mov({ id: "m-3", dueno_tipo: "personal", monto: -60000 }),
      mov({ id: "m-4", dueno_tipo: "personal", monto: -99999, estado: "borrador" }),
    ]);
    const obra = bolsillos.find((b) => b.dueno_tipo === "obra");
    const eze = bolsillos.find((b) => b.dueno_tipo === "personal");
    expect(obra).toMatchObject({ cuenta_id: "c-mp", dueno_obra_id: "p-palermo", saldo: 110000, movimientos: 2 });
    expect(eze).toMatchObject({ cuenta_id: "c-mp", dueno_obra_id: null, saldo: -60000, movimientos: 1 });
    expect(bolsillos).toHaveLength(2); // el borrador no crea bolsillo
  });

  it("separa la misma obra en cuentas distintas (bolsillo = cuenta × dueño)", () => {
    const bolsillos = saldosBolsillos([
      mov({ id: "m-1", cuenta_id: "c-mp", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 100, origen_tipo: "cobro" }),
      mov({ id: "m-2", cuenta_id: "c-efe", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 50, origen_tipo: "cobro" }),
    ]);
    expect(bolsillos).toHaveLength(2);
  });

  it("montos llegan como unknown (numeric de Supabase viene string) y redondea a 2", () => {
    const [b] = saldosBolsillos([
      mov({ id: "m-1", monto: "100.1" as unknown }),
      mov({ id: "m-2", monto: "0.01" as unknown }),
    ]);
    expect(b.saldo).toBe(100.11);
  });
});

describe("claveBolsillo", () => {
  it("es estable y distingue dueño con y sin obra", () => {
    expect(claveBolsillo("c-1", "obra", "p-1")).not.toBe(claveBolsillo("c-1", "personal", null));
    expect(claveBolsillo("c-1", "obra", "p-1")).toBe(claveBolsillo("c-1", "obra", "p-1"));
  });
});

describe("saldosCuentasDesdeLedger", () => {
  it("saldo de cuenta = suma de sus bolsillos (invariante de la spec)", () => {
    const saldos = saldosCuentasDesdeLedger([
      mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 300000, origen_tipo: "cobro" }),
      mov({ id: "m-2", dueno_tipo: "personal", monto: -60000 }),
      mov({ id: "m-3", cuenta_id: "c-bbva", dueno_tipo: "empresa", monto: 500, origen_tipo: "cobro" }),
    ]);
    expect(saldos.get("c-mp")).toBe(240000);
    expect(saldos.get("c-bbva")).toBe(500);
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `cd ~/Documents/ravn && npx vitest run src/lib/dinero.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dinero'` (o equivalente).

- [ ] **Step 3: Implementación mínima**

```ts
// src/lib/dinero.ts
import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import type { Moneda } from "@/lib/cuentas";

/**
 * Módulo DINERO (spec 2026-07-06) — motor de BOLSILLOS sobre el ledger
 * movimientos_plata. Un bolsillo es (cuenta × dueño): de quién es la plata
 * dentro de cada cuenta. Solo movimientos asentados suman. Durante la
 * convivencia el motor actual (cuentas.ts) sigue mandando; este calcula en
 * paralelo y el chequeo de consistencia compara.
 */

export type DuenoTipo = "obra" | "empresa" | "personal";
export type EstadoMovimiento = "borrador" | "asentado";

export type MovimientoPlataRow = {
  id: string;
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  monto: unknown; // numeric de Supabase llega como string
  moneda: Moneda;
  grupo_id: string;
  origen_tipo: string;
  estado: EstadoMovimiento;
};

export type Bolsillo = {
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  moneda: Moneda;
  saldo: number;
  movimientos: number;
};

export function claveBolsillo(
  cuentaId: string,
  duenoTipo: DuenoTipo,
  duenoObraId: string | null
): string {
  return `${cuentaId}|${duenoTipo}|${duenoObraId ?? ""}`;
}

/** Saldo por bolsillo: Σ movimientos ASENTADOS por (cuenta, dueño). */
export function saldosBolsillos(movimientos: MovimientoPlataRow[]): Bolsillo[] {
  const porClave = new Map<string, Bolsillo>();
  for (const m of movimientos) {
    if (m.estado !== "asentado") continue;
    const clave = claveBolsillo(m.cuenta_id, m.dueno_tipo, m.dueno_obra_id);
    const acc = porClave.get(clave) ?? {
      cuenta_id: m.cuenta_id,
      dueno_tipo: m.dueno_tipo,
      dueno_obra_id: m.dueno_obra_id,
      moneda: m.moneda,
      saldo: 0,
      movimientos: 0,
    };
    acc.saldo = roundArs2(acc.saldo + roundArs2(parseNum(m.monto)));
    acc.movimientos += 1;
    porClave.set(clave, acc);
  }
  return [...porClave.values()];
}

/** Saldo de cada cuenta según el ledger = Σ de sus bolsillos (invariante). */
export function saldosCuentasDesdeLedger(
  movimientos: MovimientoPlataRow[]
): Map<string, number> {
  const porCuenta = new Map<string, number>();
  for (const b of saldosBolsillos(movimientos)) {
    porCuenta.set(b.cuenta_id, roundArs2((porCuenta.get(b.cuenta_id) ?? 0) + b.saldo));
  }
  return porCuenta;
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run src/lib/dinero.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dinero.ts src/lib/dinero.test.ts
git commit -m "feat(dinero): motor de bolsillos (saldosBolsillos + saldosCuentasDesdeLedger)"
```

---

### Task 4: Invariantes de grupo + chequeo de consistencia contra el motor actual

**Files:**
- Modify: `src/lib/dinero.ts` (agregar al final)
- Test: `src/lib/dinero.test.ts` (agregar al final)

**Interfaces:**
- Consumes: `Bolsillo`, `MovimientoPlataRow`, `saldosCuentasDesdeLedger` (Task 3); `Cuenta` de `@/lib/cuentas`.
- Produces (las usan la Fase 2 —validar antes de asentar— y la Fase 4 —convivencia—):
  - `validarGrupo(filas: MovimientoPlataRow[], cuentas: Pick<Cuenta, "id" | "moneda">[]): string[]` — lista de errores; `[]` = grupo válido.
  - `type Divergencia = { cuenta_id: string; saldoLedger: number; saldoMotor: number; delta: number }`
  - `chequeoConsistencia(movimientos: MovimientoPlataRow[], saldosMotor: Map<string, number>): Divergencia[]` — SOLO cuentas presentes en el ledger (antes de la foto inicial el ledger está vacío y no diverge nada).

- [ ] **Step 1: Escribir los tests que fallan** (agregar a `src/lib/dinero.test.ts`)

```ts
import { chequeoConsistencia, validarGrupo } from "@/lib/dinero";

const CUENTAS = [
  { id: "c-mp", moneda: "ARS" as const },
  { id: "c-usd", moneda: "USD" as const },
];

describe("validarGrupo (invariantes de la spec)", () => {
  it("grupo válido → sin errores", () => {
    expect(
      validarGrupo(
        [
          mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: -90000 }),
          mov({ id: "m-2", dueno_tipo: "personal", monto: -60000 }),
        ],
        CUENTAS
      )
    ).toEqual([]);
  });

  it("detecta grupo_id mezclado, estado mixto, moneda que no es la de la cuenta, monto 0 y dueño incoherente", () => {
    const errores = validarGrupo(
      [
        mov({ id: "m-1", grupo_id: "g-1", monto: 100 }),
        mov({ id: "m-2", grupo_id: "g-OTRO", monto: 100 }), // otro grupo
        mov({ id: "m-3", estado: "borrador", monto: 100 }), // estado mixto
        mov({ id: "m-4", cuenta_id: "c-usd", moneda: "ARS", monto: 100 }), // c-usd es USD
        mov({ id: "m-5", monto: 0 }), // monto cero
        mov({ id: "m-6", dueno_tipo: "obra", dueno_obra_id: null, monto: 100 }), // obra sin obra_id
      ],
      CUENTAS
    );
    expect(errores.length).toBeGreaterThanOrEqual(5);
  });

  it("grupo vacío es inválido", () => {
    expect(validarGrupo([], CUENTAS)).not.toEqual([]);
  });
});

describe("chequeoConsistencia", () => {
  it("compara ledger vs motor actual SOLO en cuentas que el ledger conoce", () => {
    const movs = [
      mov({ id: "m-1", monto: 100000, origen_tipo: "cobro" }),
      mov({ id: "m-2", monto: -40000 }),
    ];
    const motor = new Map([
      ["c-mp", 60000], // coincide → sin divergencia
      ["c-bbva", 999999], // no está en el ledger → se ignora
    ]);
    expect(chequeoConsistencia(movs, motor)).toEqual([]);
  });

  it("reporta la divergencia con el delta exacto", () => {
    const movs = [mov({ id: "m-1", monto: 60000, origen_tipo: "cobro" })];
    const motor = new Map([["c-mp", 61000]]);
    expect(chequeoConsistencia(movs, motor)).toEqual([
      { cuenta_id: "c-mp", saldoLedger: 60000, saldoMotor: 61000, delta: -1000 },
    ]);
  });
});
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/dinero.test.ts`
Expected: FAIL — `validarGrupo is not a function` (o import inexistente).

- [ ] **Step 3: Implementación mínima** (agregar a `src/lib/dinero.ts`)

```ts
/** Invariantes de un grupo ANTES de asentarlo (spec §Verificación): mismo
 * grupo_id, estado homogéneo, moneda = moneda de la cuenta, monto ≠ 0, dueño
 * obra ⟺ dueno_obra_id. Devuelve la lista de errores; [] = válido. */
export function validarGrupo(
  filas: MovimientoPlataRow[],
  cuentas: Pick<import("@/lib/cuentas").Cuenta, "id" | "moneda">[]
): string[] {
  const errores: string[] = [];
  if (!filas.length) return ["grupo vacío"];
  const monedaDe = new Map(cuentas.map((c) => [c.id, c.moneda]));
  const grupo = filas[0].grupo_id;
  const estado = filas[0].estado;
  for (const f of filas) {
    if (f.grupo_id !== grupo) errores.push(`fila ${f.id}: grupo_id distinto (${f.grupo_id} ≠ ${grupo})`);
    if (f.estado !== estado) errores.push(`fila ${f.id}: estado mixto en el grupo`);
    const monedaCuenta = monedaDe.get(f.cuenta_id);
    if (monedaCuenta && f.moneda !== monedaCuenta)
      errores.push(`fila ${f.id}: moneda ${f.moneda} pero la cuenta es ${monedaCuenta}`);
    if (roundArs2(parseNum(f.monto)) === 0) errores.push(`fila ${f.id}: monto cero`);
    if ((f.dueno_tipo === "obra") !== (f.dueno_obra_id !== null))
      errores.push(`fila ${f.id}: dueño obra sin obra_id (o al revés)`);
  }
  return errores;
}

export type Divergencia = {
  cuenta_id: string;
  saldoLedger: number;
  saldoMotor: number;
  delta: number;
};

/** Convivencia (spec): el saldo por ledger debe igualar el del motor actual
 * en toda cuenta que el ledger conozca. Devuelve las que divergen. */
export function chequeoConsistencia(
  movimientos: MovimientoPlataRow[],
  saldosMotor: Map<string, number>
): Divergencia[] {
  const divergencias: Divergencia[] = [];
  for (const [cuentaId, saldoLedger] of saldosCuentasDesdeLedger(movimientos)) {
    const saldoMotor = saldosMotor.get(cuentaId);
    if (saldoMotor === undefined) continue;
    const delta = roundArs2(saldoLedger - saldoMotor);
    if (delta !== 0) {
      divergencias.push({ cuenta_id: cuentaId, saldoLedger, saldoMotor, delta });
    }
  }
  return divergencias;
}
```

- [ ] **Step 4: Correr TODA la suite del repo**

Run: `npx vitest run`
Expected: PASS completo (los tests previos del repo siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dinero.ts src/lib/dinero.test.ts
git commit -m "feat(dinero): invariantes de grupo + chequeo de consistencia ledger vs motor"
```

---

### Task 5: Cierre de fase — revisión + verificación en vivo + handoff

**Files:**
- Modify: `handoff.md` (raíz del repo `~/Documents/ravn`)

- [ ] **Step 1: Revisión por `ravn-code-reviewer`** (pedido explícito de Eze, spec §Verificación)

Lanzar el agente `ravn-code-reviewer` sobre los commits de la fase (las 2 migraciones + `src/lib/dinero.ts` + tests). Aplicar lo que confirme como bug real; lo discutible se conversa con Eze.

- [ ] **Step 2: Verificación en vivo contra prod**

Vía `mcp__supabase__execute_sql`: repetir el insert de grupo del Task 1 Step 3 (2 patas TEST), asentarlo (`update ... set estado='asentado' where descripcion like 'TEST %'` — como app, no bot), confirmar que `dinero_saldos_bolsillos` muestra los 2 bolsillos con los saldos exactos, y borrar los TEST. Además: `mcp__supabase__get_advisors` (security) para confirmar que las tablas nuevas no levantan avisos de RLS.

Expected: bolsillos correctos en la vista; advisors sin findings nuevos.

- [ ] **Step 3: Actualizar `handoff.md`** — Fase 1 HECHA (commits + qué quedó en prod), siguiente paso = plan de Fase 2 (bot borrador→confirmo, RPC de asiento, espejo al ledger).

- [ ] **Step 4: Commit final**

```bash
git add handoff.md docs/superpowers/plans/2026-07-07-dinero-fase-1.md
git commit -m "docs(dinero): cierre Fase 1 — plan ejecutado + handoff"
```
