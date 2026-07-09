# Cotizadora autoalimentada — Capítulo 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El loop entero de la cotizadora en dos casos: panel exploratorio `/cotizar` con take-off vivo desde recetas (Caso A), y soporte de recetas CANDIDATAS con fuente+confianza por ítem y preguntas abiertas (Caso B), más la capa fina de precios fechados (cache en Supabase + refresh on-demand + job del daemon).

**Architecture:** No se toca el motor (`cotizar.ts`/`instanciar.ts`/`retail.ts`) — se le agrega la CONECTIVA: una tabla `precios_items` con precios fechados por ítem, una lib que arma `PrecioItem` desde ese cache, un validador de recetas candidatas que hace cumplir la ley 1 (nunca inventar), API routes finas bajo `/api/cotizar/*`, y una página `/cotizar` funcional (el diseño final se hace después CON Eze).

**Tech Stack:** Next.js 15 (App Router, route handlers), Supabase (tabla nueva + migraciones), TypeScript estricto, Vitest, Python 3 (job del daemon).

## Global Constraints

- **Ley 1 (Eze):** el sistema NUNCA inventa un número. Ítem sin precio → `sin_precio: true` y se muestra como PREGUNTA; cantidad sin fuente en una candidata → violación del validador. Jamás un default numérico silencioso.
- **Ley 2 (Eze):** los presupuestos se construyen juntos — las preguntas abiertas de una receta candidata son un campo de primera clase (`preguntas_abiertas`), no un comentario.
- Todo precio lleva traza `PrecioFechado` (valor + fuente + fecha). Todo dato de receta candidata lleva `origen` (fuente + confianza `verificado|estimado`).
- La IA NUNCA suma: toda aritmética pasa por `cotizar()` (`src/lib/cotizador/cotizar.ts`).
- NO tocar: `src/lib/cotizador/{cotizar,instanciar,retail,formula,totales,sanidad,checklist,vencimiento}.ts` ni la mesa de revisión `src/app/cotizaciones/[id]/revision/revision-screen.tsx` (salvo el union de estado si TypeScript lo exige — ver Task 1).
- Comentarios y strings de UI en castellano rioplatense, mismo estilo del repo (comentarios que explican POR QUÉ).
- Migraciones: archivo en `supabase/migrations/` con timestamp `202607091*`; las aplica el ORQUESTADOR vía MCP de Supabase (el subagente NO aplica migraciones, solo deja el archivo).
- Tests con Vitest (`npm test -- <archivo>` corre uno). Antes de commitear cada task: `npx tsc --noEmit` limpio.
- Rama de trabajo: `home-cards` (ya estamos parados ahí). Commits chicos por task.

---

### Task 1: Migraciones + tipos (precios fechados y receta candidata)

**Files:**
- Create: `supabase/migrations/20260709120000_precios_items.sql`
- Create: `supabase/migrations/20260709121000_recetas_candidata.sql`
- Modify: `src/lib/cotizador/tipos.ts` (agregar tipos al final de la sección de recetas, línea ~78)
- Modify (solo si `tsc` lo exige): `src/app/cotizaciones/[id]/revision/revision-screen.tsx:26` — widen del union local de estado

**Interfaces:**
- Produces (para Tasks 2-6): tabla `public.precios_items`; tipos `ConfianzaDato`, `OrigenDato`, `PrecioItemRow`; `Receta.estado` ahora incluye `"candidata"`; `Receta.preguntas_abiertas?: string[]`; `ItemReceta.origen?: OrigenDato`.

- [ ] **Step 1: Migración `precios_items`**

```sql
-- precios_items: cache FECHADO de precios por ítem de receta (capa fina del
-- Capítulo 1 de la cotizadora autoalimentada, spec 2026-07-09).
-- Un precio por (item, origen). `fecha` es la traza PrecioFechado (de cuándo es
-- el dato); `revisado_at` es cuándo lo escribió el sistema (para "revisado hace 2 h").
-- La escriben: el seed desde cotizaciones viejas, el botón "refrescar" del panel
-- y el job diario del daemon. La ley 1 vive acá: si un ítem no tiene fila, el
-- take-off lo muestra SIN PRECIO como pregunta — nunca se rellena.

create table if not exists public.precios_items (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  item text not null,
  origen text not null check (origen in ('sismat', 'internet', 'retail')),
  valor numeric not null check (valor > 0),
  fuente text not null,
  fecha date not null,
  revisado_at timestamptz not null default now(),
  unique (item, origen)
);

comment on table public.precios_items is
  'Cache fechado de precios por ítem de receta (sismat/internet/retail). Alimenta el panel /cotizar. Sin fila = sin precio = pregunta (ley 1: nunca inventar).';

alter table public.precios_items enable row level security;
revoke all on public.precios_items from anon;

drop policy if exists "precios_items_all_no_bot" on public.precios_items;
create policy "precios_items_all_no_bot" on public.precios_items
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());
```

- [ ] **Step 2: Migración recetas candidata**

```sql
-- Recetas CANDIDATAS (Capítulo 1, Caso B): una receta que el sistema investigó
-- y armó pero que Eze todavía no aprobó. Nace con preguntas abiertas (ley 2:
-- se construye JUNTOS) y pasa a 'investigada' cuando Eze la revisa/completa.

alter table public.recetas
  drop constraint if exists recetas_estado_check;
alter table public.recetas
  add constraint recetas_estado_check
  check (estado in ('candidata', 'investigada', 'confiable'));

alter table public.recetas
  add column if not exists preguntas_abiertas jsonb not null default '[]'::jsonb;

comment on column public.recetas.preguntas_abiertas is
  'Preguntas abiertas de una receta candidata (datos que el sistema NO pudo determinar y le pide a Eze — ley 1: dato faltante = pregunta, no invento).';
```

Nota: verificar el nombre real del check con `select conname from pg_constraint where conrelid = 'public.recetas'::regclass;` — si no se llama `recetas_estado_check`, ajustar el `drop constraint` al nombre real. (Esto lo corre el orquestador al aplicar; dejar el SQL con el nombre por defecto de Postgres para un check inline: `recetas_estado_check`.)

- [ ] **Step 3: Tipos en `src/lib/cotizador/tipos.ts`**

Agregar arriba de `ItemReceta` (después de `RangoFisico`):

```ts
/** Confianza de un dato de receta candidata (ley 1: todo número con traza). */
export type ConfianzaDato = "verificado" | "estimado";

/**
 * De dónde salió una cantidad/fórmula de una receta candidata y con qué
 * confianza. Obligatorio en candidatas (lo exige validarRecetaCandidata):
 * un ítem sin origen es un número inventado, y eso está prohibido.
 */
export type OrigenDato = {
  fuente: string; // "ficha Superboard (Eternit)", "Seia: revestimientos", "SISMAT 4721"
  confianza: ConfianzaDato;
};
```

En `ItemReceta` agregar el campo opcional (después de `rango_fisico`):

```ts
  /** Traza del dato en recetas candidatas: fuente + confianza (ley 1). */
  origen?: OrigenDato;
```

En `Receta` cambiar `estado` y agregar `preguntas_abiertas`:

```ts
  estado: "candidata" | "investigada" | "confiable";
  /** Solo candidatas: lo que el sistema NO pudo determinar y le pregunta a Eze. */
  preguntas_abiertas?: string[];
```

Al final de la sección de precios (después de `PrecioItem`), la fila de la tabla nueva:

```ts
/** Fila de `precios_items` — cache fechado que alimenta el panel /cotizar. */
export type PrecioItemRow = {
  item: string;
  origen: "sismat" | "internet" | "retail";
  valor: number;
  fuente: string;
  fecha: string; // YYYY-MM-DD
  revisado_at: string; // ISO — cuándo lo escribió el sistema
};
```

- [ ] **Step 4: `npx tsc --noEmit`** — si `revision-screen.tsx:26` rompe por el union local `"investigada" | "confiable"`, widen a `"candidata" | "investigada" | "confiable"` (una candidata nunca llega a la mesa formal, pero el tipo espejo no puede quedar más angosto que la tabla).

- [ ] **Step 5: Correr tests completos** — `npm test` → 88/88 (nada debería romper: los campos son opcionales).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260709120000_precios_items.sql supabase/migrations/20260709121000_recetas_candidata.sql src/lib/cotizador/tipos.ts
git commit -m "Cotizadora cap.1: tabla precios_items + receta candidata (tipos y migraciones)"
```

---

### Task 2: Lib `precios-cache.ts` — del cache fechado a `PrecioItem`

**Files:**
- Create: `src/lib/cotizador/precios-cache.ts`
- Test: `src/lib/cotizador/__tests__/precios-cache.test.ts`

**Interfaces:**
- Consumes: `PrecioItemRow`, `PrecioItem`, `PrecioFechado` de `./tipos`; `fetchPreciosComparados`, `PrecioCadena` de `./retail`.
- Produces (para Tasks 3-5):
  - `combinarPrecios(rows: PrecioItemRow[]): Record<string, PrecioItem>` (pura)
  - `elegirPrecioRetail(comparados: PrecioCadena[]): PrecioFechado | null` (pura)
  - `revisadoPorItem(rows: PrecioItemRow[]): Record<string, string>` (pura — ISO más reciente por ítem)
  - `refrescarRetail(items: string[], hoy: string, fetchImpl?: typeof fetch): Promise<PrecioItemRow[]>` (red, sin DB — devuelve las filas a upsertear)

- [ ] **Step 1: Tests que fallan** (`precios-cache.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  combinarPrecios,
  elegirPrecioRetail,
  revisadoPorItem,
} from "../precios-cache";
import type { PrecioCadena } from "../retail";
import type { PrecioItemRow } from "../tipos";

const fila = (over: Partial<PrecioItemRow>): PrecioItemRow => ({
  item: "Látex interior 20L",
  origen: "internet",
  valor: 50000,
  fuente: "easy.com.ar",
  fecha: "2026-07-09",
  revisado_at: "2026-07-09T12:00:00Z",
  ...over,
});

describe("combinarPrecios", () => {
  it("arma los tres slots de PrecioItem desde filas del cache", () => {
    const out = combinarPrecios([
      fila({ origen: "sismat", valor: 48000, fuente: "SISMAT 1203" }),
      fila({ origen: "internet" }),
      fila({ origen: "retail", valor: 51000, fuente: "Prestigio (ref. retail)" }),
    ]);
    const p = out["Látex interior 20L"];
    expect(p.sismat).toEqual({ valor: 48000, fuente: "SISMAT 1203", fecha: "2026-07-09" });
    expect(p.internet?.valor).toBe(50000);
    expect(p.retail?.valor).toBe(51000);
  });

  it("ítem con SOLO retail: copia retail al slot internet (con su fuente intacta) para que entre al rango", () => {
    // El panel exploratorio muestra totales con el precio vivo que HAY. El slot
    // retail no entra a precio_min/max (instanciar.ts) — si es lo único que
    // existe, se duplica en internet SIN disfrazar la fuente (sigue diciendo
    // "(ref. retail)"). Ley 1 intacta: no se inventa, se usa un precio real.
    const out = combinarPrecios([
      fila({ origen: "retail", valor: 51000, fuente: "Prestigio (ref. retail)" }),
    ]);
    const p = out["Látex interior 20L"];
    expect(p.internet).toEqual({
      valor: 51000,
      fuente: "Prestigio (ref. retail)",
      fecha: "2026-07-09",
    });
    expect(p.retail?.valor).toBe(51000);
  });

  it("ítem sin filas: no aparece (el motor lo marca sin_precio)", () => {
    expect(combinarPrecios([])).toEqual({});
  });
});

describe("elegirPrecioRetail", () => {
  const cadena = (over: Partial<PrecioCadena>): PrecioCadena => ({
    cadena: "prestigio",
    nombre: "Prestigio",
    fuente: "Prestigio (ref. retail)",
    precio: { valor: 51000, fuente: "Prestigio (ref. retail)", fecha: "2026-07-09" },
    ...over,
  });

  it("toma la primera cadena con precio (la principal viene primera)", () => {
    const out = elegirPrecioRetail([
      cadena({ precio: null }),
      cadena({ cadena: "colorshop", nombre: "Colorshop", fuente: "Colorshop (ref. retail)", precio: { valor: 49000, fuente: "Colorshop (ref. retail)", fecha: "2026-07-09" } }),
    ]);
    expect(out?.fuente).toBe("Colorshop (ref. retail)");
  });

  it("todas sin precio → null (nunca se inventa)", () => {
    expect(elegirPrecioRetail([cadena({ precio: null })])).toBeNull();
  });
});

describe("revisadoPorItem", () => {
  it("devuelve el revisado_at más reciente por ítem", () => {
    const out = revisadoPorItem([
      fila({ revisado_at: "2026-07-09T08:00:00Z" }),
      fila({ origen: "retail", revisado_at: "2026-07-09T12:00:00Z" }),
    ]);
    expect(out["Látex interior 20L"]).toBe("2026-07-09T12:00:00Z");
  });
});
```

- [ ] **Step 2: Verificar que fallan** — `npm test -- precios-cache` → FAIL (módulo no existe).

- [ ] **Step 3: Implementación** (`precios-cache.ts`)

```ts
/**
 * Cache fechado de precios (tabla `precios_items`) → PrecioItem del motor.
 *
 * La capa fina del Capítulo 1: acá se decide QUÉ precio ve el panel /cotizar y
 * con qué traza. Regla madre (ley 1): un ítem sin fila en el cache queda SIN
 * precio y el motor lo marca `sin_precio` — jamás se rellena con un invento.
 */
import { fetchPreciosComparados, type PrecioCadena } from "./retail";
import type { PrecioFechado, PrecioItem, PrecioItemRow } from "./tipos";

/** Filas del cache → PrecioItem por nombre de ítem (los 3 slots). */
export function combinarPrecios(rows: PrecioItemRow[]): Record<string, PrecioItem> {
  const out: Record<string, PrecioItem> = {};
  for (const r of rows) {
    const precio: PrecioFechado = { valor: r.valor, fuente: r.fuente, fecha: r.fecha };
    (out[r.item] ??= {})[r.origen] = precio;
  }
  // Solo-retail: instanciar.ts calcula el rango con sismat+internet; si lo único
  // vivo que hay es retail, se copia a internet con la fuente INTACTA ("(ref.
  // retail)") para que el take-off tenga total. No es un invento: es un precio
  // real de catálogo, y la traza dice exactamente de dónde salió.
  for (const p of Object.values(out)) {
    if (p.retail && !p.internet && !p.sismat) p.internet = p.retail;
  }
  return out;
}

/** Primera cadena que trajo precio (la principal del rubro viene primera). */
export function elegirPrecioRetail(comparados: PrecioCadena[]): PrecioFechado | null {
  for (const c of comparados) if (c.precio) return c.precio;
  return null;
}

/** revisado_at más reciente por ítem — para el "revisado hace 2 h" del panel. */
export function revisadoPorItem(rows: PrecioItemRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!out[r.item] || r.revisado_at > out[r.item]) out[r.item] = r.revisado_at;
  }
  return out;
}

/**
 * Busca el precio retail VIVO de cada ítem (cadena de referencia de su rubro,
 * ver retail.ts) y devuelve las filas listas para upsertear en `precios_items`.
 * Los ítems que ninguna cadena tenía NO devuelven fila (ley 1). Secuencial a
 * propósito: son pocas decenas de ítems y no queremos ametrallar los catálogos.
 */
export async function refrescarRetail(
  items: string[],
  hoy: string,
  fetchImpl: typeof fetch = fetch
): Promise<PrecioItemRow[]> {
  const ahora = new Date().toISOString();
  const filas: PrecioItemRow[] = [];
  for (const item of items) {
    const precio = elegirPrecioRetail(await fetchPreciosComparados(item, hoy, fetchImpl));
    if (precio) {
      filas.push({ item, origen: "retail", ...precio, revisado_at: ahora });
    }
  }
  return filas;
}
```

- [ ] **Step 4: Tests verdes** — `npm test -- precios-cache` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/precios-cache.ts src/lib/cotizador/__tests__/precios-cache.test.ts
git commit -m "Cotizadora cap.1: precios-cache (cache fechado -> PrecioItem + refresco retail)"
```

---

### Task 3: Lib `candidata.ts` — el validador que hace cumplir la ley 1

**Files:**
- Create: `src/lib/cotizador/candidata.ts`
- Test: `src/lib/cotizador/__tests__/candidata.test.ts`

**Interfaces:**
- Consumes: `Receta`, `ItemReceta` de `./tipos`; `evaluarFormula` de `./formula`.
- Produces (para Task 4): `validarRecetaCandidata(receta: unknown): { ok: true; receta: Receta } | { ok: false; violaciones: string[] }`.

- [ ] **Step 1: Tests que fallan** (`candidata.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { validarRecetaCandidata } from "../candidata";

const base = () => ({
  nombre: "siding-fibrocemento",
  titulo: "Siding de fibrocemento sobre estructura",
  estado: "candidata",
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
  ],
  etapas: [
    {
      nombre: "Colocación de placas",
      orden: 1,
      items: [
        {
          nombre: "Placa Superboard 6mm 1.20x2.40",
          tipo: "material",
          unidad: "u",
          formula: "ceil(superficie_m2 / 2.88)",
          desperdicio_pct: 10,
          origen: { fuente: "ficha Superboard (Eternit)", confianza: "verificado" },
        },
      ],
    },
  ],
  checklist: ["Ventilación de cámara de aire"],
  fuentes: [{ titulo: "Ficha Superboard", tipo: "fabricante", fecha: "2026-07-09" }],
  version: 1,
  preguntas_abiertas: ["¿Tornillos autoperforantes por placa?"],
});

describe("validarRecetaCandidata", () => {
  it("acepta una candidata completa con origen en todos los ítems", () => {
    const out = validarRecetaCandidata(base());
    expect(out.ok).toBe(true);
  });

  it("rechaza ítem sin origen (ley 1: número sin fuente = invento)", () => {
    const r = base();
    delete (r.etapas[0].items[0] as Record<string, unknown>).origen;
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/origen/);
  });

  it("rechaza fórmula que no evalúa con los parámetros declarados", () => {
    const r = base();
    r.etapas[0].items[0].formula = "ceil(superficie_m2 / ancho_placa)"; // ancho_placa no es parámetro
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
  });

  it("rechaza estado que no sea candidata", () => {
    const r = { ...base(), estado: "investigada" };
    expect(validarRecetaCandidata(r).ok).toBe(false);
  });

  it("rechaza receta sin fuentes", () => {
    const r = { ...base(), fuentes: [] };
    expect(validarRecetaCandidata(r).ok).toBe(false);
  });

  it("rechaza sin etapas o etapa sin ítems", () => {
    expect(validarRecetaCandidata({ ...base(), etapas: [] }).ok).toBe(false);
  });

  it("junta TODAS las violaciones, no corta en la primera", () => {
    const r = { ...base(), estado: "investigada", fuentes: [] };
    const out = validarRecetaCandidata(r);
    if (!out.ok) expect(out.violaciones.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Verificar que fallan** — `npm test -- candidata` → FAIL.

- [ ] **Step 3: Implementación** (`candidata.ts`)

```ts
/**
 * Validador de recetas CANDIDATAS (Capítulo 1, Caso B — la fábrica de recetas).
 *
 * Acá se hace cumplir la ley 1 en el punto de entrada: la IA (skill/agente)
 * PROPONE una receta, pero nada entra a la tabla sin que cada cantidad tenga
 * origen (fuente + confianza) y sin que las fórmulas evalúen de verdad con los
 * parámetros declarados. Lo que la IA no pudo determinar NO se rellena: va en
 * `preguntas_abiertas` y el panel lo muestra en rojo hasta que Eze lo conteste.
 */
import { evaluarFormula } from "./formula";
import type { ItemReceta, Receta, Unidad } from "./tipos";

const UNIDADES: Unidad[] = ["m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];

export type ResultadoValidacion =
  | { ok: true; receta: Receta }
  | { ok: false; violaciones: string[] };

export function validarRecetaCandidata(entrada: unknown): ResultadoValidacion {
  const violaciones: string[] = [];
  const r = entrada as Receta;

  if (!r || typeof r !== "object") return { ok: false, violaciones: ["la receta no es un objeto"] };
  if (!r.nombre || !/^[a-z0-9-]+$/.test(r.nombre)) violaciones.push("nombre debe ser slug (minúsculas, números, guiones)");
  if (!r.titulo) violaciones.push("falta titulo");
  if (r.estado !== "candidata") violaciones.push("estado debe ser 'candidata' (los otros estados los asigna Eze al aprobar)");
  if (!Array.isArray(r.fuentes) || r.fuentes.length === 0) violaciones.push("fuentes vacías: una candidata sin fuentes es un invento (ley 1)");
  if (!Array.isArray(r.parametros)) violaciones.push("parametros debe ser lista");
  if (!Array.isArray(r.etapas) || r.etapas.length === 0) violaciones.push("sin etapas");
  if (!Array.isArray(r.preguntas_abiertas)) violaciones.push("preguntas_abiertas debe ser lista (puede ser vacía si no quedó ninguna duda)");

  // Fórmulas: se evalúan con todos los parámetros numéricos en 1 — si referencia
  // una variable que no es parámetro, evaluarFormula tira y la candidata rebota.
  const vars: Record<string, number> = {};
  for (const p of r.parametros ?? []) if (p?.tipo === "numero") vars[p.nombre] = 1;

  for (const etapa of r.etapas ?? []) {
    if (!etapa?.nombre) violaciones.push("etapa sin nombre");
    if (!Array.isArray(etapa?.items) || etapa.items.length === 0) {
      violaciones.push(`etapa "${etapa?.nombre ?? "?"}" sin ítems`);
      continue;
    }
    for (const item of etapa.items) violaciones.push(...validarItem(item, etapa.nombre, vars));
  }

  return violaciones.length > 0 ? { ok: false, violaciones } : { ok: true, receta: r };
}

function validarItem(item: ItemReceta, etapa: string, vars: Record<string, number>): string[] {
  const v: string[] = [];
  const ref = `"${item?.nombre ?? "?"}" (${etapa})`;
  if (!item?.nombre) v.push(`ítem sin nombre en etapa "${etapa}"`);
  if (item?.tipo !== "material" && item?.tipo !== "mano_de_obra") v.push(`${ref}: tipo inválido`);
  if (!UNIDADES.includes(item?.unidad)) v.push(`${ref}: unidad inválida`);
  if (!item?.origen?.fuente || (item.origen.confianza !== "verificado" && item.origen.confianza !== "estimado")) {
    v.push(`${ref}: sin origen (fuente + confianza) — un número sin fuente es un invento (ley 1)`);
  }
  if (!item?.formula) {
    v.push(`${ref}: sin fórmula`);
  } else {
    try {
      evaluarFormula(item.formula, vars);
    } catch (e) {
      v.push(`${ref}: la fórmula no evalúa con los parámetros declarados (${e instanceof Error ? e.message : e})`);
    }
  }
  return v;
}
```

Nota para el implementador: leer `src/lib/cotizador/formula.ts` antes — si `evaluarFormula` NO tira ante variables desconocidas (p. ej. devuelve NaN), adaptar el chequeo (`Number.isFinite` del resultado) y el test correspondiente para que el caso "ancho_placa no es parámetro" rebote igual.

- [ ] **Step 4: Tests verdes** — `npm test -- candidata` → PASS. `npx tsc --noEmit` limpio.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/candidata.ts src/lib/cotizador/__tests__/candidata.test.ts
git commit -m "Cotizadora cap.1: validador de recetas candidatas (ley 1 en el punto de entrada)"
```

---

### Task 4: API routes `/api/cotizar/*`

**Files:**
- Create: `src/app/api/cotizar/recetas/route.ts` (GET lista + POST candidata)
- Create: `src/app/api/cotizar/takeoff/route.ts` (POST take-off)
- Create: `src/app/api/cotizar/precios/refresh/route.ts` (POST refresco)
- Test: `src/lib/cotizador/__tests__/takeoff-helpers.test.ts` (helpers puros)
- Create: `src/lib/cotizador/takeoff-helpers.ts`

**Interfaces:**
- Consumes: `combinarPrecios`, `refrescarRetail`, `revisadoPorItem` (Task 2); `validarRecetaCandidata` (Task 3); `cotizar`, `FaltanParametrosError` de `./cotizar`; `createSupabaseAdminClient` de `@/lib/supabase/server`; tipos de `./tipos`.
- Produces (para Task 6, contratos JSON):
  - `GET /api/cotizar/recetas` → `{ recetas: Array<{ id, nombre, titulo, estado, parametros, preguntas_abiertas, version }> }`
  - `POST /api/cotizar/takeoff` body `{ receta: string; parametros: Record<string, number | string> }` → `{ desglose, revision, total_min, total_max, revisado: Record<string, string> }` | 400 `{ error: "faltan_parametros", faltan: string[] }` | 404
  - `POST /api/cotizar/precios/refresh` body `{ receta: string }` → `{ actualizados: number; sin_precio: string[] }`
  - `POST /api/cotizar/recetas` body = receta candidata → 201 `{ id }` | 400 `{ error: "candidata_invalida", violaciones: string[] }` | 409 si el nombre ya existe

- [ ] **Step 1: Helper puro + test.** `takeoff-helpers.ts`:

```ts
/** Nombres de TODOS los ítems de una receta (material y MO) — para el cache. */
import type { Receta } from "./tipos";

export function itemsDeReceta(receta: Pick<Receta, "etapas">): string[] {
  const nombres = new Set<string>();
  for (const etapa of receta.etapas ?? []) {
    for (const item of etapa.items ?? []) nombres.add(item.nombre);
  }
  return [...nombres];
}

/** Solo los materiales (el refresco retail no busca mano de obra en Easy). */
export function materialesDeReceta(receta: Pick<Receta, "etapas">): string[] {
  const nombres = new Set<string>();
  for (const etapa of receta.etapas ?? []) {
    for (const item of etapa.items ?? []) {
      if (item.tipo === "material") nombres.add(item.nombre);
    }
  }
  return [...nombres];
}
```

Test `takeoff-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { itemsDeReceta, materialesDeReceta } from "../takeoff-helpers";

const receta = {
  etapas: [
    {
      nombre: "Pintura",
      orden: 1,
      items: [
        { nombre: "Látex interior 20L", tipo: "material" as const, unidad: "u" as const, formula: "1" },
        { nombre: "Pintor oficial", tipo: "mano_de_obra" as const, unidad: "dia" as const, formula: "1" },
        { nombre: "Látex interior 20L", tipo: "material" as const, unidad: "u" as const, formula: "1" },
      ],
    },
  ],
};

describe("takeoff-helpers", () => {
  it("itemsDeReceta junta todos sin duplicar", () => {
    expect(itemsDeReceta(receta)).toEqual(["Látex interior 20L", "Pintor oficial"]);
  });
  it("materialesDeReceta filtra la mano de obra", () => {
    expect(materialesDeReceta(receta)).toEqual(["Látex interior 20L"]);
  });
});
```

Correr `npm test -- takeoff-helpers` → FAIL, implementar, PASS.

- [ ] **Step 2: `GET`+`POST /api/cotizar/recetas`** (`recetas/route.ts`):

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { validarRecetaCandidata } from "@/lib/cotizador/candidata";

export const dynamic = "force-dynamic";

/** GET /api/cotizar/recetas — recetario para el panel exploratorio /cotizar. */
export async function GET() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("recetas")
    .select("id, nombre, titulo, estado, parametros, preguntas_abiertas, version")
    .order("titulo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recetas: data ?? [] });
}

/**
 * POST /api/cotizar/recetas — alta de receta CANDIDATA (la fábrica de recetas).
 * El validador hace cumplir la ley 1: nada entra sin origen por ítem; lo
 * indeterminado viene en preguntas_abiertas, no rellenado.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const out = validarRecetaCandidata(body);
  if (!out.ok) {
    return NextResponse.json(
      { error: "candidata_invalida", violaciones: out.violaciones },
      { status: 400 }
    );
  }
  const r = out.receta;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("recetas")
    .insert({
      nombre: r.nombre,
      titulo: r.titulo,
      estado: "candidata",
      parametros: r.parametros,
      etapas: r.etapas,
      checklist: r.checklist ?? [],
      fuentes: r.fuentes,
      preguntas_abiertas: r.preguntas_abiertas ?? [],
      version: 1,
    })
    .select("id")
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? `ya existe una receta "${r.nombre}"` : error.message },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

- [ ] **Step 3: `POST /api/cotizar/takeoff`** (`takeoff/route.ts`):

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cotizar, FaltanParametrosError } from "@/lib/cotizador/cotizar";
import { combinarPrecios, revisadoPorItem } from "@/lib/cotizador/precios-cache";
import { itemsDeReceta } from "@/lib/cotizador/takeoff-helpers";
import type { PrecioItemRow, Receta } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

/**
 * POST /api/cotizar/takeoff — el corazón del panel exploratorio (Capa 3).
 * Receta + parámetros → desglose vivo con precios del cache fechado. NO crea
 * fila en `cotizaciones`: es exploración, el flujo formal sigue siendo la mesa.
 * Ítem sin precio en cache → sin_precio (pregunta visible) — ley 1.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { receta?: string; parametros?: Record<string, number | string> }
    | null;
  if (!body?.receta || typeof body.receta !== "string") {
    return NextResponse.json({ error: "receta (nombre) requerida" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: recetaRow, error } = await sb
    .from("recetas")
    .select("*")
    .eq("nombre", body.receta)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recetaRow) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });

  const receta = recetaRow as unknown as Receta;
  const items = itemsDeReceta(receta);
  const { data: filas, error: errPrecios } = await sb
    .from("precios_items")
    .select("item, origen, valor, fuente, fecha, revisado_at")
    .in("item", items);
  if (errPrecios) return NextResponse.json({ error: errPrecios.message }, { status: 500 });

  const rows = (filas ?? []) as PrecioItemRow[];
  try {
    const calculo = cotizar({
      receta,
      parametros: body.parametros ?? {},
      precios: combinarPrecios(rows),
    });
    return NextResponse.json({ ...calculo, revisado: revisadoPorItem(rows) });
  } catch (e) {
    if (e instanceof FaltanParametrosError) {
      return NextResponse.json(
        { error: "faltan_parametros", faltan: e.faltan },
        { status: 400 }
      );
    }
    throw e;
  }
}
```

- [ ] **Step 4: `POST /api/cotizar/precios/refresh`** (`precios/refresh/route.ts`):

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { refrescarRetail } from "@/lib/cotizador/precios-cache";
import { materialesDeReceta } from "@/lib/cotizador/takeoff-helpers";
import type { Receta } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // decenas de fetches VTEX secuenciales

/**
 * POST /api/cotizar/precios/refresh — el botón "refrescar ahora" del panel.
 * Busca el precio retail VIVO de los materiales de la receta y lo upsertea en
 * el cache fechado. Los que ninguna cadena tenía vuelven en `sin_precio` para
 * que el panel los muestre como pregunta (ley 1: no se rellenan).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { receta?: string } | null;
  if (!body?.receta) return NextResponse.json({ error: "receta (nombre) requerida" }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: recetaRow, error } = await sb
    .from("recetas")
    .select("etapas")
    .eq("nombre", body.receta)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recetaRow) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });

  const materiales = materialesDeReceta(recetaRow as unknown as Pick<Receta, "etapas">);
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = await refrescarRetail(materiales, hoy);

  if (filas.length > 0) {
    const { error: errUpsert } = await sb
      .from("precios_items")
      .upsert(filas, { onConflict: "item,origen" });
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });
  }

  const conPrecio = new Set(filas.map((f) => f.item));
  return NextResponse.json({
    actualizados: filas.length,
    sin_precio: materiales.filter((m) => !conPrecio.has(m)),
  });
}
```

- [ ] **Step 5: Verificación** — `npx tsc --noEmit` limpio; `npm test` todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cotizar src/lib/cotizador/takeoff-helpers.ts src/lib/cotizador/__tests__/takeoff-helpers.test.ts
git commit -m "Cotizadora cap.1: API /api/cotizar (recetas, takeoff, refresh de precios)"
```

---

### Task 5: Seed + refresco batch + job del daemon

**Files:**
- Create: `scripts/cotizador/sembrar-precios.ts`
- Create: `scripts/cotizador/refrescar-precios.ts`
- Create: `daemon/jobs/job_precios.py`
- Modify: `daemon/jobs/runner.py` (registrar el job en `JOBS`)
- Test: `daemon/jobs/tests/test_job_precios.py`

**Interfaces:**
- Consumes: `refrescarRetail`, `itemsDeReceta`/`materialesDeReceta`; patrón de env de `scripts/gastos-obra.ts` (lee `.env.local` del repo, service key local); patrón de job de `daemon/jobs/job_top30.py` + registro en `runner.py`.
- Produces: cache `precios_items` poblado desde cotizaciones históricas (seed, con fuente y fecha ORIGINALES) y refrescado a diario (job `precios`, `vencio_diario` hora 8).

- [ ] **Step 1: `sembrar-precios.ts`** — corre UNA vez (lo lanza el orquestador). Lee todas las filas de `cotizaciones` con `desglose` no vacío, recorre `desglose.items[]` y por cada ítem con `precios.sismat`/`precios.internet`/`precios.retail` upsertea en `precios_items` conservando `fuente` y `fecha` originales (traza intacta — precios viejos quedan viejos y el vencimiento los marca, eso es honesto, no un bug). Si el mismo ítem aparece en varias cotizaciones, gana el de `fecha` más nueva. Patrón de conexión: copiar el `cargarEnv()` de `scripts/gastos-obra.ts` (lee `.env.local`, cae a `process.env`; usa `SUPABASE_SERVICE_ROLE_KEY`). `revisado_at` = fecha original del precio (a medianoche UTC: `${fecha}T00:00:00Z`), NO `now()` — el panel debe decir la verdad sobre cuándo se revisó. Estructura del script: `main()` con salida por stdout `sembrados: N ítems (M filas)`.

- [ ] **Step 2: `refrescar-precios.ts`** — el que corre el daemon todos los días:

```ts
/**
 * Refresco batch de precios retail — lo corre el daemon (job `precios`, 1x/día).
 *
 * Junta los MATERIALES de todas las recetas y busca su precio retail vivo en la
 * cadena de referencia del rubro (retail.ts). Upsertea en `precios_items` con
 * timestamp — es lo que hace que el "revisado hace X h" del panel sea verdad.
 * Los ítems sin resultado NO se escriben (ley 1: sin dato no hay fila).
 *
 * Uso: npx tsx scripts/cotizador/refrescar-precios.ts
 */
```

Implementación: `cargarEnv()` (mismo patrón), cliente supabase-js con service key, `select("etapas") from recetas`, `materialesDeReceta` sobre cada una (unificar en un Set), `refrescarRetail(materiales, hoy)`, upsert `onConflict: "item,origen"`, stdout: `precios retail: N actualizados / M materiales; sin precio: [...]`. Exit code 1 si el upsert falla.

- [ ] **Step 3: `job_precios.py`**:

```python
"""Job diario: refresca el cache fechado de precios retail (tabla precios_items).

Corre el script TS del repo (la lógica VTEX vive en src/lib/cotizador/retail.ts
— acá NO se duplica) con npx tsx. Si el script sale != 0, se levanta excepción
para que el runner lo reintente (política estándar de jobs).
"""
import subprocess

REPO = "/Users/ezeotero/Documents/ravn"
TIMEOUT = 600  # decenas de fetches VTEX secuenciales con timeout de 6 s c/u


def correr(cfg, token):
    r = subprocess.run(
        ["npx", "tsx", "scripts/cotizador/refrescar-precios.ts"],
        cwd=REPO, capture_output=True, text=True, timeout=TIMEOUT,
    )
    if r.returncode != 0:
        raise RuntimeError(f"refrescar-precios salió {r.returncode}: {r.stderr[-500:]}")
```

Registro en `runner.py` (línea de `JOBS`, después de `dolar`):

```python
    ("precios", job_precios.correr, lambda u, a: vencio_diario(u, a, hora_minima=8)),
```

(más el `import job_precios` junto a los demás imports).

- [ ] **Step 4: Test python** (`test_job_precios.py`) — seguir el patrón de los tests existentes (leer `test_job_dolar.py` primero). Mínimo: mockear `subprocess.run` y verificar (a) returncode 0 no tira, (b) returncode 1 tira RuntimeError con el stderr. Correr: `python3 -m pytest daemon/jobs/tests/test_job_precios.py -v` (verificar cómo corren los tests existentes — si usan unittest, seguir ese patrón).

- [ ] **Step 5: Verificación** — `npx tsc --noEmit` limpio (los scripts .ts compilan), tests python del daemon verdes (`python3 -m pytest daemon/jobs/tests/ -v` o el runner que use el repo).

- [ ] **Step 6: Commit**

```bash
git add scripts/cotizador/sembrar-precios.ts scripts/cotizador/refrescar-precios.ts daemon/jobs/job_precios.py daemon/jobs/runner.py daemon/jobs/tests/test_job_precios.py
git commit -m "Cotizadora cap.1: seed de precios desde cotizaciones + refresco retail diario (daemon)"
```

---

### Task 6: Panel `/cotizar` (funcional — el diseño final se hace con Eze)

**Files:**
- Create: `src/app/cotizar/page.tsx` (server component)
- Create: `src/app/cotizar/cotizar-screen.tsx` (client component)
- Modify: `src/components/shell/nav-config.ts` (entrada de navegación "Cotizar")

**Interfaces:**
- Consumes: contratos JSON de Task 4; tipos `Desglose`, `Revision`, `ParametroReceta` de `@/lib/cotizador/tipos`.
- Produces: página navegable `/cotizar`.

**Regla de esta task:** FUNCIONAL y densa, estilo consistente con la app (leer `src/app/cotizaciones/[id]/revision/revision-screen.tsx` y `src/app/catalogo/catalogo-screen.tsx` ANTES para copiar patrones de clases, tablas y badges). NO inventar un sistema visual nuevo: la pasada de diseño se hace después con Eze y `ui-ux-pro-max`. Sin Framer Motion nuevo, sin florituras.

- [ ] **Step 1: `page.tsx`** — server component: `createSupabaseAdminClient()`, `select("id, nombre, titulo, estado, parametros, preguntas_abiertas, version").order("titulo")` de `recetas`, render `<CotizarScreen recetas={data} />`. `export const dynamic = "force-dynamic"`. Metadata title "Cotizar — RAVN".

- [ ] **Step 2: `cotizar-screen.tsx`** — client component con este comportamiento exacto:
  - Selector de receta (las candidatas con badge "CANDIDATA" y sus `preguntas_abiertas` visibles en un bloque rojo/ámbar arriba: "El sistema no pudo determinar esto — se construye con Eze").
  - Formulario de parámetros generado desde `receta.parametros` (tipo `numero` → input numérico, `opcion` → select con `opciones`, `texto` → input). Requeridos marcados.
  - Botón **Calcular** → `POST /api/cotizar/takeoff`; si vuelve `faltan_parametros`, marcar los campos faltantes (no es error del sistema: es la receta pidiendo datos).
  - Resultado: tabla densa agrupada por etapa con columnas: ítem, tipo (mat/MO), cantidad + unidad (con la fórmula en texto chico debajo), precio min–max con **fuente + fecha + "revisado hace X"** (usar `revisado[item]`; helper local `haceCuanto(iso: string): string` → "hace 2 h" / "hace 3 días"), subtotal min–max.
  - Filas `sin_precio: true` → resaltadas con la leyenda **"SIN PRECIO — pregunta abierta, no se inventa"** (ley 1 visible).
  - Bloque de totales (`desglose.totales`: materiales, MO, extras, imprevistos, total min–max) + tiempo estimado (`desglose.tiempo`).
  - Bloque compacto de revisión: `revision.sanidad` fuera de rango, `revision.precios_vencidos` ("precio de hace N días"), `revision.divergencias`.
  - Botón **Refrescar precios ahora** → `POST /api/cotizar/precios/refresh` con la receta elegida → al terminar, recalcular take-off automáticamente y mostrar "N actualizados; sin precio: …".
  - Estados de carga y de error visibles (nada de spinners infinitos silenciosos).
- [ ] **Step 3: Navegación** — leer `src/components/shell/nav-config.ts` y agregar la entrada "Cotizar" apuntando a `/cotizar` donde encaje con el patrón existente (cerca de Cotizaciones).
- [ ] **Step 4: Verificación** — `npx tsc --noEmit` limpio; `npm test` verde; `npm run build` compila sin errores.
- [ ] **Step 5: Commit**

```bash
git add src/app/cotizar src/components/shell/nav-config.ts
git commit -m "Cotizadora cap.1: panel exploratorio /cotizar (take-off vivo, funcional)"
```

---

### Task 7: Verificación integral (orquestador, no subagente)

- [ ] Aplicar migraciones vía MCP Supabase (verificando antes el nombre real del check de `recetas`).
- [ ] Correr `npx tsx scripts/cotizador/sembrar-precios.ts` (seed histórico) y `npx tsx scripts/cotizador/refrescar-precios.ts` (primer refresco vivo) — revisar stdout.
- [ ] Levantar dev y probar Caso A end-to-end: `POST /api/cotizar/takeoff` con `{"receta":"pintura-interior","parametros":{...}}` (parámetros reales según `recetas.parametros`), y la página `/cotizar` en el navegador.
- [ ] `npm test` (todo), `npx tsc --noEmit`, `npm run build`.

### Task 8: Caso B — receta candidata de siding (orquestador CON investigación; FRENA en las preguntas)

- [ ] Investigar siding de fibrocemento: ficha del fabricante (Eternit Superboard / equivalente), cerebro Seia (`_INDICE.md` → destilado de revestimientos si existe), fichas de materiales del vault, SISMAT (ítems de referencia), internet. **Nota:** hay una pista en `supabase/migrations/20260412190000_catalogo_recetas_siding.sql` — mirar qué había ahí.
- [ ] Armar el JSON de receta candidata: cada ítem con `origen` (fuente + confianza), fórmulas paramétricas (superficie_m2 como mínimo), checklist, fuentes.
- [ ] Lo que NO se pudo determinar con fuente → `preguntas_abiertas` (NO rellenar — ley 1).
- [ ] `POST /api/cotizar/recetas` (pasa por el validador) → verificar que quedó en la tabla con estado `candidata` y que el panel la muestra con sus preguntas.
- [ ] **FRENAR acá.** Dejar las preguntas listadas para Eze — las contesta él cuando vuelve (ley 2, por diseño).
