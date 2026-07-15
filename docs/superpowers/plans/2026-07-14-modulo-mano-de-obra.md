# Módulo Mano de Obra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Control de pagos de mano de obra por obra: acuerdos (arreglado) + pagos vinculados (gastos de obra) → saldo derivado, con carga de pagos por bot.

**Architecture:** Tabla nueva `mo_acuerdos` + columna `mo_acuerdo_id` en `presupuestos_gastos`. Un pago ES un gasto de obra común (una sola fila de plata, ledger intacto) que apunta al acuerdo. Saldo SIEMPRE derivado. Pantalla por obra (`/obras/[id]/mano-obra`) + global (`/mano-obra`). Bot: paso nuevo en la máquina de pasos de `dineroFlujo.js`.

**Tech Stack:** Next.js 15 (App Router, client screens con `createClient` de `@/lib/supabase/client`), Supabase (migraciones vía MCP `apply_migration` + archivo en `supabase/migrations/`), vitest, bot Node (repo `~/Documents/ravn-bots`, deploy Railway).

**Spec:** `docs/superpowers/specs/2026-07-14-modulo-mano-de-obra-design.md`

## Global Constraints

- Importes LITERALES — nunca reinterpretar escala.
- `presupuestos_gastos.importe` viaja SIEMPRE en ARS (convención existente).
- El bot NUNCA crea/edita/borra acuerdos (RLS lo bloquea) y NUNCA vincula un pago sin matcheo claro o confirmación.
- Saldo nunca se persiste: `monto_arreglado − Σ pagos vinculados`.
- Acuerdo con pagos vinculados no se borra (FK sin cascade lo garantiza a nivel DB; la UI ofrece "saldar" o desvincular primero).
- Estética: misma familia visual cdm-* / font-mono-hud de `/obras/[id]` (ver `obra-orbital-screen.tsx`).
- Estilo de comentarios del repo: comentarios en castellano que explican el POR QUÉ.
- IDs reales (verificados 14/07 en prod):
  - Baño Correa = presupuesto `762f49eb-a364-4bed-a9c7-3f31062a5f64`
  - Siding container Glorietas = `36dfddb0-e113-46dc-984c-dbf63f9c163c` (OJO: existe un decoy "Sliding de Fibrocemento en Container" `d21edde6…` sin gastos — NO usarlo)
  - Pueyrredón 1100 = `9a3c7543-d4b6-43d9-a202-a4259d5c1fa9`

---

### Task 1: Migración `mo_acuerdos` + `presupuestos_gastos.mo_acuerdo_id`

**Files:**
- Create: `supabase/migrations/20260714120000_mo_acuerdos.sql`

**Interfaces:**
- Produces: tabla `public.mo_acuerdos (id, presupuesto_id, persona, trabajo, monto_arreglado, moneda, estado, notas, created_at, updated_at)`; columna `public.presupuestos_gastos.mo_acuerdo_id uuid null`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Módulo Mano de Obra (spec 2026-07-14): acuerdos por obra. El saldo NUNCA se
-- guarda — se deriva de presupuestos_gastos.mo_acuerdo_id (un pago ES un gasto
-- de obra común, una sola fila de plata). Alta/edición SOLO app: el bot lee
-- acuerdos y vincula pagos, nada más (mismo criterio que financiamientos).
create table public.mo_acuerdos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  persona text,
  trabajo text not null,
  monto_arreglado numeric not null check (monto_arreglado >= 0),
  moneda text not null default 'ARS' check (moneda in ('ARS','USD')),
  estado text not null default 'abierto' check (estado in ('abierto','saldado')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.mo_acuerdos is
  'Acuerdos de mano de obra por obra (persona opcional + trabajo + monto arreglado). Saldo = arreglado − suma de presupuestos_gastos con mo_acuerdo_id. Alta solo app; bot solo lee.';

create index mo_acuerdos_presupuesto_idx on public.mo_acuerdos (presupuesto_id);

alter table public.mo_acuerdos enable row level security;
create policy mo_acuerdos_select_auth on public.mo_acuerdos
  for select to authenticated using (true);
create policy mo_acuerdos_insert_no_bot on public.mo_acuerdos
  for insert to authenticated with check (not es_bot());
create policy mo_acuerdos_update_no_bot on public.mo_acuerdos
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy mo_acuerdos_delete_no_bot on public.mo_acuerdos
  for delete to authenticated using (not es_bot());

-- El pago apunta al acuerdo. FK SIN cascade a propósito: borrar un acuerdo
-- con pagos vinculados debe FALLAR (spec: se salda o se desvincula primero).
alter table public.presupuestos_gastos
  add column mo_acuerdo_id uuid references public.mo_acuerdos(id);
create index presupuestos_gastos_mo_acuerdo_idx
  on public.presupuestos_gastos (mo_acuerdo_id) where mo_acuerdo_id is not null;
```

- [ ] **Step 2: Aplicar contra prod** con MCP `apply_migration` (name: `mo_acuerdos`, mismo SQL) y guardar el archivo local con el mismo contenido.

- [ ] **Step 3: Verificar**

Run (MCP `execute_sql`): `select count(*) from mo_acuerdos; select mo_acuerdo_id from presupuestos_gastos limit 1;`
Expected: `0` y columna existente sin error. Además: `delete from mo_acuerdos` NO se prueba en prod; la política del bot se verifica en Task 6 (insert del bot debe rebotar → probarlo con un insert vía cliente del bot en staging manual es opcional, la política replica el patrón `financiamientos_update_no_bot` ya probado).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260714120000_mo_acuerdos.sql
git commit -m "feat(mo): tabla mo_acuerdos + mo_acuerdo_id en presupuestos_gastos"
```

---

### Task 2: Lib pura `src/lib/mano-obra.ts` (TDD)

**Files:**
- Create: `src/lib/mano-obra.ts`
- Test: `src/lib/mano-obra.test.ts` (colocado, como `dinero.test.ts`)

**Interfaces:**
- Produces:
  - `type AcuerdoMO = { id: string; presupuesto_id: string; persona: string | null; trabajo: string; monto_arreglado: number; moneda: "ARS" | "USD"; estado: "abierto" | "saldado"; notas: string | null; created_at: string }`
  - `type PagoMO = { id: string; mo_acuerdo_id: string | null; importe: number; fecha: string; descripcion: string | null; cotizacion_venta_ars_por_usd: number | null }`
  - `type ResumenAcuerdo = { acuerdo: AcuerdoMO; pagado: number; saldo: number; pagos: PagoMO[]; ultimoPago: string | null; pagosSinCotizacion: number }`
  - `function resumirAcuerdo(acuerdo: AcuerdoMO, pagos: PagoMO[]): ResumenAcuerdo`
  - `function resumirAcuerdos(acuerdos: AcuerdoMO[], pagos: PagoMO[]): ResumenAcuerdo[]` (filtra pagos por `mo_acuerdo_id`, ordena pagos nuevo→viejo por fecha)

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from "vitest";
import { resumirAcuerdo, resumirAcuerdos, type AcuerdoMO, type PagoMO } from "./mano-obra";

const acuerdo = (over: Partial<AcuerdoMO> = {}): AcuerdoMO => ({
  id: "a1", presupuesto_id: "p1", persona: "Juan", trabajo: "Filtración",
  monto_arreglado: 700000, moneda: "ARS", estado: "abierto", notas: null,
  created_at: "2026-07-14T00:00:00Z", ...over,
});
const pago = (over: Partial<PagoMO> = {}): PagoMO => ({
  id: "g1", mo_acuerdo_id: "a1", importe: 100000, fecha: "2026-07-10",
  descripcion: null, cotizacion_venta_ars_por_usd: null, ...over,
});

describe("resumirAcuerdo", () => {
  it("saldo = arreglado − pagos, ultimoPago = fecha más nueva", () => {
    const r = resumirAcuerdo(acuerdo(), [pago(), pago({ id: "g2", importe: 200000, fecha: "2026-07-12" })]);
    expect(r.pagado).toBe(300000);
    expect(r.saldo).toBe(400000);
    expect(r.ultimoPago).toBe("2026-07-12");
    expect(r.pagos[0].id).toBe("g2"); // nuevo → viejo
  });
  it("sin pagos: pagado 0, saldo completo, ultimoPago null", () => {
    const r = resumirAcuerdo(acuerdo(), []);
    expect(r.pagado).toBe(0);
    expect(r.saldo).toBe(700000);
    expect(r.ultimoPago).toBeNull();
  });
  it("pago que supera el saldo se permite: saldo negativo", () => {
    const r = resumirAcuerdo(acuerdo({ monto_arreglado: 100000 }), [pago({ importe: 150000 })]);
    expect(r.saldo).toBe(-50000);
  });
  it("acuerdo USD: pagado convierte por cotización; sin cotización NO suma y se cuenta", () => {
    const r = resumirAcuerdo(acuerdo({ moneda: "USD", monto_arreglado: 1000 }), [
      pago({ importe: 148000, cotizacion_venta_ars_por_usd: 1480 }), // = US$100
      pago({ id: "g2", importe: 50000 }), // sin cotización → no suma
    ]);
    expect(r.pagado).toBe(100);
    expect(r.saldo).toBe(900);
    expect(r.pagosSinCotizacion).toBe(1);
  });
});

describe("resumirAcuerdos", () => {
  it("reparte pagos por mo_acuerdo_id e ignora los no vinculados", () => {
    const rs = resumirAcuerdos(
      [acuerdo(), acuerdo({ id: "a2", trabajo: "Cielorraso", monto_arreglado: 300000 })],
      [pago(), pago({ id: "g2", mo_acuerdo_id: "a2", importe: 300000 }), pago({ id: "g3", mo_acuerdo_id: null })],
    );
    expect(rs[0].pagado).toBe(100000);
    expect(rs[1].saldo).toBe(0);
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/lib/mano-obra.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementación mínima**

```ts
/**
 * Lógica PURA del módulo Mano de Obra — testeable sin DB.
 * Un "pago" es una fila de presupuestos_gastos con mo_acuerdo_id (una sola
 * fila de plata). El saldo NUNCA se persiste: siempre sale de acá.
 * Acuerdo USD: el importe del gasto viaja en ARS (convención), así que el
 * pagado se reconstruye con la cotización del gasto; sin cotización el pago
 * NO suma y se cuenta en pagosSinCotizacion (la pantalla lo marca — nunca
 * en silencio).
 */

export type AcuerdoMO = {
  id: string;
  presupuesto_id: string;
  persona: string | null;
  trabajo: string;
  monto_arreglado: number;
  moneda: "ARS" | "USD";
  estado: "abierto" | "saldado";
  notas: string | null;
  created_at: string;
};

export type PagoMO = {
  id: string;
  mo_acuerdo_id: string | null;
  importe: number;
  fecha: string;
  descripcion: string | null;
  cotizacion_venta_ars_por_usd: number | null;
};

export type ResumenAcuerdo = {
  acuerdo: AcuerdoMO;
  pagado: number;
  saldo: number;
  pagos: PagoMO[];
  ultimoPago: string | null;
  pagosSinCotizacion: number;
};

export function resumirAcuerdo(acuerdo: AcuerdoMO, pagos: PagoMO[]): ResumenAcuerdo {
  const propios = pagos
    .filter((p) => p.mo_acuerdo_id === acuerdo.id)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  let pagado = 0;
  let pagosSinCotizacion = 0;
  for (const p of propios) {
    const importe = Number(p.importe) || 0;
    if (acuerdo.moneda === "USD") {
      const cot = Number(p.cotizacion_venta_ars_por_usd);
      if (cot > 0) pagado += importe / cot;
      else pagosSinCotizacion += 1;
    } else {
      pagado += importe;
    }
  }
  pagado = Math.round(pagado * 100) / 100;
  return {
    acuerdo,
    pagado,
    saldo: Math.round((Number(acuerdo.monto_arreglado) - pagado) * 100) / 100,
    pagos: propios,
    ultimoPago: propios[0]?.fecha ?? null,
    pagosSinCotizacion,
  };
}

export function resumirAcuerdos(acuerdos: AcuerdoMO[], pagos: PagoMO[]): ResumenAcuerdo[] {
  return acuerdos.map((a) => resumirAcuerdo(a, pagos));
}
```

- [ ] **Step 4: Correr tests** — `npx vitest run src/lib/mano-obra.test.ts` → PASS (5 tests).

- [ ] **Step 5: Commit** — `git add src/lib/mano-obra.ts src/lib/mano-obra.test.ts && git commit -m "feat(mo): lib pura de resúmenes de acuerdos"`

---

### Task 3: Pantalla por obra `/obras/[id]/mano-obra`

**Files:**
- Create: `src/app/obras/[id]/mano-obra/page.tsx` (espejo exacto de `src/app/obras/[id]/gastos/page.tsx`, cambiando el screen importado)
- Create: `src/app/obras/[id]/mano-obra/mano-obra-screen.tsx`

**Interfaces:**
- Consumes: `resumirAcuerdos`, tipos de Task 2; `createClient` de `@/lib/supabase/client`; `useRealtimeTable` de `@/hooks/use-realtime-table`.
- Produces: ruta `/obras/[id]/mano-obra` (id = presupuesto_id, misma convención que `/gastos`).

- [ ] **Step 1: page.tsx** — copiar `gastos/page.tsx` reemplazando el import/JSX por `ManoObraScreen`.

- [ ] **Step 2: mano-obra-screen.tsx** — client component con este contenido (estética cdm-* como el orbital):

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { createClient } from "@/lib/supabase/client";
import {
  resumirAcuerdos,
  type AcuerdoMO,
  type PagoMO,
  type ResumenAcuerdo,
} from "@/lib/mano-obra";

/**
 * Mano de obra de la obra (/obras/[id]/mano-obra, id = presupuesto_id).
 * Acuerdos (arreglado/pagado/saldo) + alta/edición (ÚNICA vía de alta — el
 * bot solo paga) + vincular pagos ya cargados (gastos sin mo_acuerdo_id).
 */

const fmt = (n: number, moneda = "ARS") =>
  `${moneda === "USD" ? "US$" : "$"}${Math.round(n).toLocaleString("es-AR")}`;

export function ManoObraScreen({ presupuestoId }: { presupuestoId: string }) {
  const [nombre, setNombre] = useState("Obra");
  const [acuerdos, setAcuerdos] = useState<AcuerdoMO[] | null>(null);
  const [pagos, setPagos] = useState<PagoMO[]>([]);
  const [sueltos, setSueltos] = useState<PagoMO[]>([]); // gastos sin acuerdo, para vincular
  const [error, setError] = useState<string | null>(null);
  // Alta / edición inline
  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Vincular pagos existentes: id del acuerdo en modo "elegir pagos"
  const [vinculando, setVinculando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [pres, acs, gs] = await Promise.all([
        supabase.from("presupuestos").select("nombre_obra, nombre_cliente").eq("id", presupuestoId).maybeSingle(),
        supabase.from("mo_acuerdos").select("*").eq("presupuesto_id", presupuestoId).order("created_at", { ascending: true }),
        supabase
          .from("presupuestos_gastos")
          .select("id, mo_acuerdo_id, importe, fecha, descripcion, cotizacion_venta_ars_por_usd")
          .eq("presupuesto_id", presupuestoId)
          .order("fecha", { ascending: false }),
      ]);
      if (acs.error) { setError(acs.error.message); return; }
      setError(null);
      setNombre(pres.data?.nombre_obra?.trim() || pres.data?.nombre_cliente?.trim() || "Obra");
      setAcuerdos((acs.data ?? []) as AcuerdoMO[]);
      const todos = (gs.data ?? []) as PagoMO[];
      setPagos(todos.filter((g) => g.mo_acuerdo_id));
      setSueltos(todos.filter((g) => !g.mo_acuerdo_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, [presupuestoId]);

  useEffect(() => { void cargar(); }, [cargar]);
  // Un pago por bot aparece al toque (mismo criterio vivo que el orbital).
  useRealtimeTable("presupuestos_gastos", cargar);
  useRealtimeTable("mo_acuerdos", cargar);

  const resumenes: ResumenAcuerdo[] = useMemo(
    () => resumirAcuerdos(acuerdos ?? [], pagos),
    [acuerdos, pagos],
  );
  const totales = useMemo(() => {
    const abiertos = resumenes.filter((r) => r.acuerdo.estado === "abierto" && r.acuerdo.moneda === "ARS");
    return {
      arreglado: abiertos.reduce((a, r) => a + Number(r.acuerdo.monto_arreglado), 0),
      pagado: abiertos.reduce((a, r) => a + r.pagado, 0),
      saldo: abiertos.reduce((a, r) => a + r.saldo, 0),
    };
  }, [resumenes]);

  const abrirAlta = () => { setEditandoId(null); setPersona(""); setTrabajo(""); setMonto(""); setFormAbierto(true); };
  const abrirEdicion = (a: AcuerdoMO) => {
    setEditandoId(a.id); setPersona(a.persona ?? ""); setTrabajo(a.trabajo);
    setMonto(String(a.monto_arreglado)); setFormAbierto(true);
  };

  const guardar = useCallback(async () => {
    const montoNum = Number(monto.replace(/\./g, "").replace(",", "."));
    if (!trabajo.trim() || !(montoNum >= 0) || guardando) return;
    setGuardando(true);
    try {
      const supabase = createClient();
      const fila = { persona: persona.trim() || null, trabajo: trabajo.trim(), monto_arreglado: montoNum };
      const { error } = editandoId
        ? await supabase.from("mo_acuerdos").update({ ...fila, updated_at: new Date().toISOString() }).eq("id", editandoId)
        : await supabase.from("mo_acuerdos").insert({ ...fila, presupuesto_id: presupuestoId });
      if (error) { setError(error.message); return; }
      setFormAbierto(false);
      await cargar();
    } finally { setGuardando(false); }
  }, [persona, trabajo, monto, editandoId, guardando, presupuestoId, cargar]);

  const setEstado = useCallback(async (a: AcuerdoMO, estado: "abierto" | "saldado") => {
    const supabase = createClient();
    const { error } = await supabase.from("mo_acuerdos")
      .update({ estado, updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) setError(error.message); else await cargar();
  }, [cargar]);

  const vincular = useCallback(async (gastoId: string, acuerdoId: string | null) => {
    const supabase = createClient();
    const { error } = await supabase.from("presupuestos_gastos")
      .update({ mo_acuerdo_id: acuerdoId }).eq("id", gastoId);
    if (error) setError(error.message); else await cargar();
  }, [cargar]);

  return (
    <div className="font-grotesk relative flex min-h-dvh flex-col bg-cdm-bg p-4 text-cdm-fg">
      <WavesBackdrop />
      <header className="relative z-10 flex items-baseline justify-between gap-3 px-1">
        <div className="flex items-baseline gap-4">
          <Link href={`/obras/${presupuestoId}`} className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent">
            [← OBRA]
          </Link>
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            MANO DE OBRA — {nombre}
          </h1>
        </div>
        <button type="button" onClick={abrirAlta} className="font-mono-hud border border-cdm-accent/50 bg-cdm-accent/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg">
          + ACUERDO
        </button>
      </header>

      <div className="relative z-10 mt-4 flex flex-col gap-3 px-1">
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {!acuerdos && <SkeletonGlass filas={3} anchos={["w-1/2", "w-1/3", "w-2/5"]} />}

        {formAbierto && (
          <div className="flex flex-col gap-2 border border-cdm-line p-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-widest text-cdm-muted">
              Persona / gremio (opcional)
              <input value={persona} onChange={(e) => setPersona(e.target.value)} className="border border-cdm-line bg-transparent px-2 py-1.5 text-[13px] normal-case tracking-normal text-cdm-fg focus:border-cdm-accent focus:outline-none" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[10px] uppercase tracking-widest text-cdm-muted">
              Trabajo
              <input value={trabajo} onChange={(e) => setTrabajo(e.target.value)} className="border border-cdm-line bg-transparent px-2 py-1.5 text-[13px] normal-case tracking-normal text-cdm-fg focus:border-cdm-accent focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-cdm-muted">
              Arreglado ($)
              <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" className="w-36 border border-cdm-line bg-transparent px-2 py-1.5 text-[13px] text-cdm-fg focus:border-cdm-accent focus:outline-none" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => void guardar()} disabled={guardando || !trabajo.trim() || !monto.trim()} className="font-mono-hud border border-emerald-400/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-emerald-400 hover:bg-emerald-400 hover:text-cdm-bg disabled:opacity-30">
                {guardando ? "…" : "Guardar"}
              </button>
              <button type="button" onClick={() => setFormAbierto(false)} className="font-mono-hud px-2 text-[10px] uppercase tracking-widest text-cdm-muted hover:text-cdm-fg">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {resumenes.map((r) => (
          <div key={r.acuerdo.id} className={`border p-3 ${r.acuerdo.estado === "saldado" ? "border-cdm-line/50 opacity-60" : "border-cdm-line"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-3">
                <span className="text-[14px] font-medium">{r.acuerdo.trabajo}</span>
                {r.acuerdo.persona && <span className="text-[12px] text-cdm-muted">{r.acuerdo.persona}</span>}
                {r.acuerdo.estado === "saldado" && <span className="font-mono-hud text-[10px] uppercase tracking-widest text-emerald-400">✓ saldado</span>}
              </div>
              <div className="font-mono-hud flex items-baseline gap-4 text-[12px]">
                <span className="text-cdm-muted">arreglado {fmt(Number(r.acuerdo.monto_arreglado), r.acuerdo.moneda)}</span>
                <span className="text-cdm-muted">pagado {fmt(r.pagado, r.acuerdo.moneda)}</span>
                <span className={r.saldo < 0 ? "text-red-400" : r.saldo === 0 ? "text-emerald-400" : "text-cdm-accent"}>
                  falta {fmt(r.saldo, r.acuerdo.moneda)}
                </span>
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span className="text-[11px] text-cdm-muted">
                {r.pagos.length ? `${r.pagos.length} pago${r.pagos.length > 1 ? "s" : ""} · último ${r.ultimoPago}` : "sin pagos todavía"}
                {r.pagosSinCotizacion > 0 && <span className="text-amber-300"> · {r.pagosSinCotizacion} pago(s) USD sin cotización — no suman</span>}
              </span>
              <button type="button" onClick={() => abrirEdicion(r.acuerdo)} className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-cdm-accent">editar</button>
              <button type="button" onClick={() => setVinculando(vinculando === r.acuerdo.id ? null : r.acuerdo.id)} className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-cdm-accent">
                {vinculando === r.acuerdo.id ? "cerrar" : "vincular pagos"}
              </button>
              {r.acuerdo.estado === "abierto"
                ? <button type="button" onClick={() => void setEstado(r.acuerdo, "saldado")} className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-emerald-400">saldar</button>
                : <button type="button" onClick={() => void setEstado(r.acuerdo, "abierto")} className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted hover:text-amber-300">reabrir</button>}
            </div>

            {/* Pagos vinculados (desvincular = mo_acuerdo_id → null, el gasto NO se borra) */}
            {r.pagos.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 border-t border-cdm-line/50 pt-2">
                {r.pagos.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="text-cdm-muted">{p.fecha} · {p.descripcion || "pago"}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono-hud">{fmt(Number(p.importe))}</span>
                      <button type="button" onClick={() => void vincular(p.id, null)} className="font-mono-hud text-[9px] uppercase tracking-widest text-cdm-muted hover:text-red-400">quitar</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Vincular gastos ya cargados (Baño Correa tiene pagos previos al módulo) */}
            {vinculando === r.acuerdo.id && (
              <ul className="mt-2 flex flex-col gap-1 border-t border-cdm-accent/30 pt-2">
                {sueltos.length === 0 && <li className="text-[11px] text-cdm-muted">No hay gastos sin acuerdo en esta obra.</li>}
                {sueltos.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="text-cdm-muted">{p.fecha} · {p.descripcion || "gasto"} · {fmt(Number(p.importe))}</span>
                    <button type="button" onClick={() => void vincular(p.id, r.acuerdo.id)} className="font-mono-hud text-[9px] uppercase tracking-widest text-cdm-accent hover:text-emerald-400">+ vincular</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {acuerdos && acuerdos.length === 0 && !formAbierto && (
          <p className="text-[12px] text-cdm-muted">Sin acuerdos todavía — cargá el primero con + ACUERDO.</p>
        )}

        {acuerdos && acuerdos.length > 0 && (
          <footer className="font-mono-hud flex items-baseline gap-4 border-t border-cdm-line px-1 pt-3 text-[12px]">
            <span className="text-cdm-muted">TOTAL ABIERTO (ARS):</span>
            <span className="text-cdm-muted">arreglado {fmt(totales.arreglado)}</span>
            <span className="text-cdm-muted">pagado {fmt(totales.pagado)}</span>
            <span className={totales.saldo < 0 ? "text-red-400" : "text-cdm-accent"}>falta {fmt(totales.saldo)}</span>
          </footer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Link de entrada en el orbital** — Modify `src/app/obras/[id]/obra-orbital-screen.tsx:258-264`: agregar entre "PLAN Y CRUCE ↑" y "[GASTOS] ↑":

```tsx
<Link
  href={`/obras/${presupuestoId}/mano-obra`}
  className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
>
  [MANO DE OBRA] ↑
</Link>
```

(Nota: el spec decía "nodo en el orbital"; se implementa como link de header — mismo patrón que GASTOS y PLAN, que también son artefactos de obra y viven como links. Avisado a Eze en el resumen final.)

- [ ] **Step 4: Verificar build + tests** — `npx vitest run && npm run lint` → PASS. Después `npm run dev` y abrir `http://localhost:3000/obras/762f49eb-a364-4bed-a9c7-3f31062a5f64/mano-obra`: carga vacía sin error.

- [ ] **Step 5: Commit** — `git add src/app/obras/ && git commit -m "feat(mo): pantalla mano de obra por obra + link en orbital"`

---

### Task 4: Página global `/mano-obra`

**Files:**
- Create: `src/app/mano-obra/page.tsx` (mismo espejo fino que Task 3 Step 1, sin params: `export default function Page() { return <ManoObraGlobalScreen />; }`)
- Create: `src/app/mano-obra/mano-obra-global-screen.tsx`
- Modify: `src/app/obras/obras-screen.tsx` (link de entrada en el header, mismo estilo `[...]` que los existentes — ubicar con `grep -n "font-mono-hud" src/app/obras/obras-screen.tsx | head`)

**Interfaces:**
- Consumes: `resumirAcuerdos` (Task 2). Query global: `mo_acuerdos` (todas) + `presupuestos_gastos` con `mo_acuerdo_id not is null` + nombres de `presupuestos`.

- [ ] **Step 1: Screen global** — mismo esqueleto visual que Task 3 (header con `[← HOME]` a `/`, WavesBackdrop, SkeletonGlass). Datos:

```tsx
const [acs, gs, pres] = await Promise.all([
  supabase.from("mo_acuerdos").select("*").order("created_at", { ascending: true }),
  supabase.from("presupuestos_gastos")
    .select("id, mo_acuerdo_id, importe, fecha, descripcion, cotizacion_venta_ars_por_usd")
    .not("mo_acuerdo_id", "is", null),
  supabase.from("presupuestos").select("id, nombre_obra, nombre_cliente"),
]);
```

Render: agrupar `resumirAcuerdos(...)` por `presupuesto_id` (nombre de la obra como título de grupo, cada acuerdo una fila persona · trabajo · falta X · último pago hace N días — `Math.floor((Date.now() − new Date(ultimoPago)) / 86400000)` con guard null → "nunca"), solo estado `abierto` por defecto con toggle "ver saldados". Footer: TOTAL ADEUDADO (ARS) = Σ saldos abiertos ARS. Cada grupo linkea a `/obras/[presupuesto_id]/mano-obra`.

- [ ] **Step 2: Verificar** — `npx vitest run && npm run lint` → PASS; `/mano-obra` en dev muestra los grupos.

- [ ] **Step 3: Commit** — `git add src/app/mano-obra src/app/obras/obras-screen.tsx && git commit -m "feat(mo): vista global /mano-obra"`

---

### Task 5: Seed de acuerdos (prod)

**Files:** ninguno (SQL vía MCP `execute_sql`).

- [ ] **Step 1: Insertar los 6 acuerdos** (importes LITERALES pasados por Eze 14/07):

```sql
insert into mo_acuerdos (presupuesto_id, trabajo, monto_arreglado) values
  ('762f49eb-a364-4bed-a9c7-3f31062a5f64', 'Filtración', 700000),
  ('762f49eb-a364-4bed-a9c7-3f31062a5f64', 'Cielorraso', 300000),
  ('762f49eb-a364-4bed-a9c7-3f31062a5f64', '2 extractores', 100000),
  ('36dfddb0-e113-46dc-984c-dbf63f9c163c', 'Mano de obra siding', 1250000),
  ('9a3c7543-d4b6-43d9-a202-a4259d5c1fa9', 'Obra', 2750000),
  ('9a3c7543-d4b6-43d9-a202-a4259d5c1fa9', 'Plomería', 250000);
```

- [ ] **Step 2: Verificar** — `select p.nombre_obra, a.trabajo, a.monto_arreglado from mo_acuerdos a join presupuestos p on p.id = a.presupuesto_id order by p.nombre_obra;` → 6 filas con los montos exactos de arriba.

- [ ] **Step 3: Candidatos a vincular en Baño Correa** — listar para EZE (no vincular solo — ley: el vínculo lo confirma él o se hace por la UI):

```sql
select id, fecha, descripcion, importe from presupuestos_gastos
where presupuesto_id = '762f49eb-a364-4bed-a9c7-3f31062a5f64' and mo_acuerdo_id is null
order by fecha;
```

Mostrar la lista en el resumen final para que Eze vincule desde la pantalla nueva (o confirme y se vincula por SQL).

---

### Task 6: Bot — pago de MO por WhatsApp

**Files (repo `~/Documents/ravn-bots`):**
- Modify: `src/supabaseService.js` (2 funciones nuevas + `insertGastoObra` acepta `mo_acuerdo_id`; exportarlas en el `module.exports` del final, junto a `insertGastoObra`)
- Modify: `src/dineroFlujo.js` (paso nuevo `mo` + resumen + confirmación)

**Interfaces:**
- Consumes: tabla `mo_acuerdos` (Task 1; el bot puede SELECT, no INSERT/UPDATE/DELETE).
- Produces: `sb.listarAcuerdosMOAbiertos(presupuestoId) → [{id, persona, trabajo, monto_arreglado, moneda}]`; `sb.pagadoPorAcuerdoMO(ids) → {acuerdoId: totalARS}`; `insertGastoObra({..., mo_acuerdo_id})`; `op.mo_acuerdo_id` (undefined = pendiente, null = "no es MO", uuid = vinculado) y `op.mo_etiqueta` (texto para el resumen).

- [ ] **Step 1: supabaseService.js** — junto a `insertGastoObra` (línea ~914):

```js
// ── Módulo Mano de Obra ──────────────────────────────────────────────────────
// Acuerdos ABIERTOS de una obra. El bot solo LEE (RLS mo_acuerdos_*_no_bot);
// vincular un pago = mo_acuerdo_id en presupuestos_gastos, nada más.
async function listarAcuerdosMOAbiertos(presupuestoId) {
  try {
    const ok = await ensureAuth();
    if (!ok) return [];
    const { data, error } = await client()
      .from('mo_acuerdos')
      .select('id, persona, trabajo, monto_arreglado, moneda')
      .eq('presupuesto_id', presupuestoId)
      .eq('estado', 'abierto');
    if (error) { console.error('[Supabase] listarAcuerdosMOAbiertos err:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.error('[Supabase] listarAcuerdosMOAbiertos err:', e.message);
    return [];
  }
}

// Total pagado (ARS, convención presupuestos_gastos.importe) por acuerdo —
// para mostrar "falta $X" en el menú y el resumen del borrador.
async function pagadoPorAcuerdoMO(acuerdoIds) {
  try {
    const ok = await ensureAuth();
    if (!ok || !acuerdoIds.length) return {};
    const { data, error } = await client()
      .from('presupuestos_gastos')
      .select('mo_acuerdo_id, importe')
      .in('mo_acuerdo_id', acuerdoIds);
    if (error) { console.error('[Supabase] pagadoPorAcuerdoMO err:', error.message); return {}; }
    const tot = {};
    for (const g of data || []) {
      tot[g.mo_acuerdo_id] = (tot[g.mo_acuerdo_id] || 0) + (Number(g.importe) || 0);
    }
    return tot;
  } catch (e) {
    console.error('[Supabase] pagadoPorAcuerdoMO err:', e.message);
    return {};
  }
}
```

En `insertGastoObra`: agregar `mo_acuerdo_id` al destructuring y `mo_acuerdo_id: mo_acuerdo_id || null,` al `.insert({...})`. Exportar las dos funciones nuevas.

- [ ] **Step 2: dineroFlujo.js — paso `mo`** — en `pasoSiguiente` (línea ~73), después del paso obra:

```js
if (esGastoDeObra(op) && !op.presupuesto_id) return 'obra';
// Módulo MO: undefined = todavía no se miró; null = mirado, "no es MO".
if (esGastoDeObra(op) && op.mo_acuerdo_id === undefined) return 'mo';
```

y en `avanzar` (línea ~428): `if (paso === 'mo') return pasoMO(op, ctx);`

Función nueva (junto a `pasoObra`):

```js
// ── Paso MO (módulo Mano de Obra): si la obra tiene acuerdos ABIERTOS y el
// gasto huele a pago de mano de obra, engancharlo. 1 candidato claro (persona
// o trabajo nombrados en el texto) → se auto-propone y el resumen lo muestra;
// 0 claros pero huele a MO → menú; no huele → null directo, sin molestar.
// El bot NUNCA inventa el vínculo (spec 2026-07-14).
const RE_MO = /\b(pag(u[eé]|o|ué)|adelanto|jornal|mano de obra|gremio|plomero|electricista|pintor|albañil)\b/i;

async function pasoMO(op, ctx) {
  const { sb } = ctx;
  const g = op.gasto || {};
  const acuerdos = sb.listarAcuerdosMOAbiertos ? await sb.listarAcuerdosMOAbiertos(op.presupuesto_id) : [];
  const texto = `${g.concepto || ''} ${g.proveedor || ''}`.toLowerCase();
  if (!acuerdos.length) {
    op.mo_acuerdo_id = null;
    return avanzar(op, ctx);
  }
  const pagados = sb.pagadoPorAcuerdoMO ? await sb.pagadoPorAcuerdoMO(acuerdos.map((a) => a.id)) : {};
  const etiquetaAcuerdo = (a) => {
    const saldo = Number(a.monto_arreglado) - (pagados[a.id] || 0);
    return `${a.persona ? `${a.persona} — ` : ''}${a.trabajo} (falta ${fmtMonto(saldo, a.moneda)})`;
  };
  // Matcheo: la persona o una palabra del trabajo (≥4 letras) nombradas en el texto.
  const matches = acuerdos.filter((a) =>
    (a.persona && texto.includes(String(a.persona).toLowerCase())) ||
    String(a.trabajo || '').toLowerCase().split(/\s+/).some((w) => w.length >= 4 && texto.includes(w)));
  if (matches.length === 1) {
    op.mo_acuerdo_id = matches[0].id;
    op.mo_etiqueta = etiquetaAcuerdo(matches[0]);
    return avanzar(op, ctx);
  }
  if (!matches.length && !RE_MO.test(texto)) {
    op.mo_acuerdo_id = null;
    return avanzar(op, ctx);
  }
  const candidatos = matches.length ? matches : acuerdos;
  return {
    pregunta: {
      texto: `¿"${formatGasto(g)}" es un pago de mano de obra de ${op.obra_nombre || 'la obra'}? ¿De qué arreglo?`,
      opciones: [
        ...candidatos.map((a) => ({
          etiqueta: etiquetaAcuerdo(a),
          accion: { clase: 'dinero_paso', op: { ...op, mo_etiqueta: etiquetaAcuerdo(a) }, campo: 'mo_acuerdo_id', valor: a.id },
        })),
        { etiqueta: 'No es mano de obra', accion: { clase: 'dinero_paso', op: { ...op, mo_acuerdo_id: null } } },
      ],
    },
  };
}
```

- [ ] **Step 3: resumen + confirmación** — en `pasoResumen` (línea ~271), el texto muestra el vínculo:

```js
texto: textoResumen(op) + (op.mo_etiqueta ? `\n👷 Mano de obra: ${op.mo_etiqueta}` : ''),
```

En `confirmarGasto` (rama gasto de obra, línea ~499): pasar `mo_acuerdo_id: op.mo_acuerdo_id || null` a `sb.insertGastoObra({...})`. Después del insert, si `op.mo_acuerdo_id`, recalcular y avisar el saldo vivo:

```js
if (op.mo_acuerdo_id && sb.listarAcuerdosMOAbiertos) {
  const acs = await sb.listarAcuerdosMOAbiertos(op.presupuesto_id);
  const a = acs.find((x) => x.id === op.mo_acuerdo_id);
  if (a) {
    const pagados = await sb.pagadoPorAcuerdoMO([a.id]);
    const saldo = Number(a.monto_arreglado) - (pagados[a.id] || 0);
    confBase += saldo > 0
      ? `\n👷 ${a.persona ? `${a.persona} — ` : ''}${a.trabajo}: le falta cobrar ${fmtMonto(saldo, a.moneda)}.`
      : `\n👷 ${a.persona ? `${a.persona} — ` : ''}${a.trabajo}: quedó al día${saldo < 0 ? ` (pagado ${fmtMonto(-saldo, a.moneda)} de más — revisá el arreglo en la app)` : ''}.`;
  }
}
```

- [ ] **Step 4: Guardia de moneda (borde del spec)** — en `pasoMO`, si `g.moneda === 'USD'`, NO ofrecer acuerdos ARS: filtrar `acuerdos = acuerdos.filter((a) => a.moneda === (g.moneda === 'USD' ? 'USD' : 'ARS'))` como primera línea después del fetch. (Fase 1 no cruza monedas; si no quedan acuerdos, sigue como gasto normal sin vincular.)

- [ ] **Step 5: Consulta de lectura ("¿cuánto le debo a Juan?" / "¿cómo vengo con la mano de obra de Correa?")** — crear `src/manoObra.js`:

```js
// Consulta de lectura del módulo Mano de Obra: arma la respuesta de
// "¿cuánto le debo a X?" / "¿cómo vengo con la MO de <obra>?" desde
// mo_acuerdos + pagos vinculados. Solo LECTURA — los pagos van por el
// flujo de gasto (dineroFlujo pasoMO).
const fmtMonto = (n, moneda = 'ARS') =>
  `${moneda === 'USD' ? 'US$' : '$'}${Math.round(Math.abs(Number(n) || 0)).toLocaleString('es-AR')}`;

async function respuestaManoObra(sb, { presupuestoId, filtroTexto }) {
  const acuerdos = await sb.listarAcuerdosMOAbiertos(presupuestoId);
  if (!acuerdos.length) return null;
  const t = String(filtroTexto || '').toLowerCase();
  const filtrados = t
    ? acuerdos.filter((a) =>
        (a.persona && t.includes(String(a.persona).toLowerCase())) ||
        String(a.trabajo || '').toLowerCase().split(/\s+/).some((w) => w.length >= 4 && t.includes(w)))
    : acuerdos;
  const lista = filtrados.length ? filtrados : acuerdos;
  const pagados = await sb.pagadoPorAcuerdoMO(lista.map((a) => a.id));
  const lineas = lista.map((a) => {
    const saldo = Number(a.monto_arreglado) - (pagados[a.id] || 0);
    const quien = a.persona ? `${a.persona} — ` : '';
    return `• ${quien}${a.trabajo}: falta ${fmtMonto(saldo, a.moneda)} (de ${fmtMonto(a.monto_arreglado, a.moneda)})`;
  });
  return lineas.join('\n');
}

module.exports = { respuestaManoObra };
```

Cablearlo en `advisorService.js` donde se resuelven las consultas de saldo/lectura (ubicar con `grep -n "remanenteCuentas\|saldos" src/advisorService.js`): si el texto matchea `/(cu[aá]nto le debo|mano de obra|cu[aá]nto le falta)/i` y hay obra resuelta (o una sola activa), responder con `respuestaManoObra`. Si el intent de lectura no tiene un lugar natural en el advisor (es el clasificador Haiku), dejarlo para un follow-up chico y ANOTARLO en el resumen final — no forzar un hack.

- [ ] **Step 6: Smoke test local** — `node -e "const f=require('./src/dineroFlujo.js'); const op={gasto:{concepto:'pago filtración',monto:100000},presupuesto_id:'x'}; console.log(f.pasoSiguiente(op))"` desde `~/Documents/ravn-bots` → imprime `mo`. Y con `op.mo_acuerdo_id=null` → imprime `cuenta`.

- [ ] **Step 7: Commit + deploy Railway** — en `~/Documents/ravn-bots`: `git add src/supabaseService.js src/dineroFlujo.js && git commit -m "feat(mo): pago de mano de obra vincula acuerdo (módulo MO)" && git push` (Railway deploya del push — verificar con `git remote -v` que el remote es el del proyecto Railway).

---

### Task 7: Deploy app + verificación end-to-end

- [ ] **Step 1: Push + promote** — `git push origin home-cards`. GOTCHA conocido: prod branch es `main` → el push a `home-cards` es solo Preview. Promover: `vercel promote <deployment-url> --scope <team>` o merge a `main` según cómo se venía haciendo (ver memoria: proyecto Vercel `ravn-app-one`, verificar alias `ravn-app-one-five.vercel.app` DESPUÉS del promote).

- [ ] **Step 2: Verificación end-to-end (spec)** —
  1. En prod: `/obras/762f49eb-a364-4bed-a9c7-3f31062a5f64/mano-obra` muestra los 3 acuerdos de Correa con saldo = arreglado (aún sin vincular).
  2. `/mano-obra` muestra los 6 acuerdos agrupados en 3 obras, total adeudado $5.350.000.
  3. Por WhatsApp: "pagué 10000 de filtración del baño correa" → el borrador ofrece/propone el acuerdo Filtración y al confirmar: el gasto aparece en `/obras/.../gastos`, el saldo del acuerdo baja a $690.000 en la pantalla, el ledger descuenta UNA sola vez de la cuenta.
  4. Deshacer el pago de prueba (borrar el gasto desde la app como cualquier gasto) y verificar que el saldo vuelve a $700.000.

- [ ] **Step 3: Cierre** — actualizar memoria del proyecto + avisar a Eze la lista de gastos MO de Correa para vincular (Task 5 Step 3).
