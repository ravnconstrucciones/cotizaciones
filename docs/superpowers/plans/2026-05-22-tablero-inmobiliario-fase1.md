# Tablero de Inteligencia Inmobiliaria — Plan de Implementación (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un tablero automático en `/inmobiliario` que muestre precio/m² de venta (publicación y cierre estimado) y de construcción por barrio de CABA + GBA Norte, con ranking, veredicto Construir/Comprar/Esperar y feed de noticias — actualizado solo por cron, sin carga manual.

**Architecture:** Ingesta multi-fuente (MercadoLibre API + Datos Abiertos CABA + Reporte Inmobiliario) → snapshots crudos en Supabase → agregación a precio/m² por zona/período (mediana + factor de ajuste publicación→cierre) → API de lectura → tablero React (Layout B). El frontend nunca llama fuentes externas en vivo: lee agregados precomputados. Crons de Vercel refrescan precios (diario) y noticias (horario).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (SQL migrations idempotentes), Recharts, Tailwind v4 (tokens `ravn-*`), Vitest (nuevo, solo para lógica pura), Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-05-22-tablero-inmobiliario-design.md`

---

## Estructura de archivos

```
supabase/migrations/
  20260522120000_inmobiliario_schema.sql        -- zonas, avisos_snapshot, precios_zona_periodo, noticias

src/lib/inmobiliario/
  tipos.ts                  -- tipos compartidos (AvisoNormalizado, etc.) — contrato central
  config.ts                 -- umbrales de veredicto + factor de ajuste por defecto
  estadistica.ts            -- mediana, percentil, filtro de outliers (puro, testeable)
  agregar-precios.ts        -- AvisoNormalizado[] -> fila precios_zona_periodo (puro)
  veredicto.ts              -- heurística construir/comprar/esperar (puro)
  costo-construccion.ts     -- deriva costo USD/m² del maestro de precios RAVN
  zonas-seed.ts             -- taxonomía CABA + GBA Norte (datos)
  fuentes/mercadolibre.ts   -- cliente API ML -> AvisoNormalizado[]
  fuentes/caba-escrituras.ts-- Datos Abiertos CABA -> AvisoNormalizado[]
  fuentes/reporte-inmobiliario.ts -- referencia por barrio
  fuentes/noticias-rss.ts   -- feeds RSS -> noticias
  __tests__/                -- tests de vitest de la lógica pura
  __fixtures__/             -- respuestas reales capturadas en el spike (Stage 0)

src/app/api/inmobiliario/
  refresh-precios/route.ts  -- cron diario: ingesta + agregación
  refresh-noticias/route.ts -- cron horario: ingesta noticias
  tablero/route.ts          -- lectura para el front

src/app/inmobiliario/
  page.tsx                  -- server component + metadata
  tablero-screen.tsx        -- orquesta el Layout B (client)

src/components/inmobiliario/
  kpi-grid.tsx
  evolucion-chart.tsx
  ranking-barrios.tsx
  feed-noticias.tsx

vercel.json                 -- crons (o se crea si no existe)
vitest.config.ts            -- config de tests
```

---

## STAGE 0 — Validación de fuentes (BLOQUEANTE)

> Antes de construir nada encima, hay que confirmar que las fuentes responden y capturar respuestas reales como fixtures. Estos son spikes de investigación, no TDD. **Si una fuente está bloqueada, parar y reportar a Ezequiel con el hallazgo y el fallback antes de seguir.**

### Task 0.1: Validar API de MercadoLibre Inmuebles

**Files:**
- Create: `src/lib/inmobiliario/__fixtures__/ml-search-palermo.json` (respuesta capturada)
- Create: `docs/superpowers/notas/ml-api-contract.md` (contrato documentado)

- [ ] **Step 1: Probar el endpoint de búsqueda de inmuebles**

Ejecutar en terminal (CABA, venta, departamentos). El site de Argentina es `MLA`, la categoría de inmuebles es `MLA1459`:

```bash
curl -s "https://api.mercadolibre.com/sites/MLA/search?category=MLA1459&q=departamento+venta+palermo&limit=5" -o /tmp/ml-test.json; head -c 800 /tmp/ml-test.json; echo
```

Expected (uno de tres):
- **OK público:** JSON con `results[]` que incluyen `price`, `currency_id`, `attributes` (con `TOTAL_AREA`/`COVERED_AREA`, `ROOMS`), `location`. → seguir.
- **Requiere auth:** HTTP 401/403 o `{"message":"...","error":"..."}`. → ir a Step 3.
- **Bloqueado/cambió:** otro error. → documentar y reportar a Ezequiel.

- [ ] **Step 2: Si es público, guardar la respuesta como fixture**

```bash
curl -s "https://api.mercadolibre.com/sites/MLA/search?category=MLA1459&q=departamento+venta+palermo&limit=20" -o src/lib/inmobiliario/__fixtures__/ml-search-palermo.json
```

Verificar que el archivo tiene `results` con al menos 1 ítem que tenga precio en USD y superficie. Anotar en `docs/superpowers/notas/ml-api-contract.md`: nombres exactos de los campos de precio, moneda, superficie cubierta/total, ambientes, barrio/ubicación, y el `id` del aviso (para dedup).

- [ ] **Step 3: Si requiere auth, evaluar OAuth**

ML usa OAuth2 client_credentials para apps registradas (gratis). Documentar en la nota si hace falta `APP_ID`/`SECRET`. Si hace falta, **parar y reportar a Ezequiel**: necesita crear una app en developers.mercadolibre.com.ar (5 min) y cargar `ML_CLIENT_ID` / `ML_CLIENT_SECRET` como env vars. No inventar credenciales.

- [ ] **Step 4: Commit del hallazgo**

```bash
git add src/lib/inmobiliario/__fixtures__/ docs/superpowers/notas/ml-api-contract.md
git commit -m "spike: contrato y fixture de la API de MercadoLibre Inmuebles"
```

### Task 0.2: Validar Datos Abiertos CABA (escrituras / compraventas)

**Files:**
- Create: `src/lib/inmobiliario/__fixtures__/caba-escrituras.csv` (muestra)
- Modify: `docs/superpowers/notas/ml-api-contract.md` (agregar sección CABA)

- [ ] **Step 1: Buscar el dataset**

El portal es `https://data.buenosaires.gob.ar`. Buscar dataset de compraventas / escrituras de inmuebles (suele venir del Colegio de Escribanos o de la Dir. de Estadística). Ejecutar:

```bash
curl -s "https://data.buenosaires.gob.ar/api/3/action/package_search?q=compraventa+inmueble" -o /tmp/caba.json; python3 -c "import json;d=json.load(open('/tmp/caba.json'));[print(r['title'],'->',[res['format'] for res in r['resources']][:3]) for r in d['result']['results'][:8]]"
```

Expected: lista de datasets con sus formatos (CSV/JSON). Identificar el que tiene precio de operación y barrio. Si no aparece, probar `q=escrituras` o `q=mercado inmobiliario`.

- [ ] **Step 2: Descargar una muestra del recurso CSV**

Tomar la URL del recurso CSV del dataset elegido y guardar una muestra:

```bash
curl -s "<URL_DEL_RECURSO_CSV>" | head -50 > src/lib/inmobiliario/__fixtures__/caba-escrituras.csv
```

Documentar en la nota: columnas de precio (¿ARS o USD?), superficie, barrio, fecha, y si el dato es por operación individual o ya agregado por barrio. **Clave para el factor de ajuste.**

- [ ] **Step 3: Commit**

```bash
git add src/lib/inmobiliario/__fixtures__/caba-escrituras.csv docs/superpowers/notas/ml-api-contract.md
git commit -m "spike: dataset de escrituras CABA (Datos Abiertos)"
```

### Task 0.3: Validar feeds RSS de noticias

**Files:**
- Create: `src/lib/inmobiliario/__fixtures__/feed-ejemplo.xml`
- Modify: `docs/superpowers/notas/ml-api-contract.md` (sección feeds)

- [ ] **Step 1: Confirmar feeds que respondan**

Probar candidatos (anotar cuáles devuelven XML válido con `<item>`):

```bash
for u in \
  "https://www.infobae.com/economia/rss/" \
  "https://www.lanacion.com.ar/economia/rss/" \
  "https://www.cronista.com/files/rss/economia.xml" ; do \
  echo "== $u =="; curl -s "$u" | head -c 300; echo; done
```

Expected: al menos 2-3 devuelven XML con `<item><title>...<link>...<pubDate>`. Guardar uno como fixture:

```bash
curl -s "https://www.infobae.com/economia/rss/" -o src/lib/inmobiliario/__fixtures__/feed-ejemplo.xml
```

Documentar la lista final de feeds que funcionan y las keywords para detectar relevancia inmobiliaria (`inmobiliario`, `metro cuadrado`, `propiedades`, `hipotecario`, `expensas`, `alquiler`, `Nordelta`, `zona norte`).

- [ ] **Step 2: Commit**

```bash
git add src/lib/inmobiliario/__fixtures__/feed-ejemplo.xml docs/superpowers/notas/ml-api-contract.md
git commit -m "spike: feeds RSS de noticias del sector validados"
```

> **CHECKPOINT.** Reportar a Ezequiel: ¿qué fuentes funcionan, cuáles requieren credenciales, qué se documentó? No avanzar a Stage 1 sin este OK.

---

## STAGE 1 — Fundación: tests, schema, tipos y lógica pura

### Task 1.1: Instalar y configurar Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar vitest**

```bash
npm install -D vitest@^2
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 3: Agregar script de test a `package.json`**

En la sección `"scripts"`, agregar:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verificar que vitest corre (sin tests aún)**

Run: `npm run test`
Expected: "No test files found" (exit 0) — vitest está instalado y configurado.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: agregar vitest para lógica pura del módulo inmobiliario"
```

### Task 1.2: Migración del schema de Supabase

**Files:**
- Create: `supabase/migrations/20260522120000_inmobiliario_schema.sql`

- [ ] **Step 1: Escribir la migración**

Seguir el estilo idempotente del repo (RLS on, policies `all using(true)`, grants a `anon, authenticated, service_role`):

```sql
-- Módulo inmobiliario: zonas, snapshots crudos, agregados por período, noticias. Idempotente.

create table if not exists public.inmobiliario_zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'barrio_caba',      -- 'barrio_caba' | 'partido_gba' | 'barrio_privado'
  region text not null default 'CABA',            -- 'CABA' | 'GBA_NORTE'
  ml_match text[] not null default '{}',          -- alias para matchear desde fuentes
  lat numeric(9,6),
  lng numeric(9,6),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nombre, region)
);

create table if not exists public.inmobiliario_avisos_snapshot (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid references public.inmobiliario_zonas(id) on delete set null,
  fuente text not null,                           -- 'mercadolibre' | 'caba_escrituras' | 'reporte_inmobiliario'
  tipo_dato text not null,                        -- 'publicacion' | 'cierre' | 'referencia'
  fuente_id text not null,
  operacion text not null default 'venta',
  tipo_prop text not null default 'departamento', -- 'departamento' | 'casa' | 'ph' | 'lote'
  precio_usd numeric(14,2),
  m2 numeric(10,2),
  usd_por_m2 numeric(12,2),
  ambientes int,
  antiguedad int,
  capturado_en timestamptz not null default now(),
  unique (fuente, fuente_id, capturado_en)
);
create index if not exists inmobiliario_avisos_zona_idx
  on public.inmobiliario_avisos_snapshot (zona_id, tipo_dato, capturado_en);

create table if not exists public.inmobiliario_precios_zona_periodo (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references public.inmobiliario_zonas(id) on delete cascade,
  periodo date not null,                          -- primer día del mes
  tipo_prop text not null default 'departamento',
  mediana_publicacion_usd_m2 numeric(12,2),
  mediana_cierre_usd_m2 numeric(12,2),
  factor_ajuste numeric(5,3),
  ref_reporte_usd_m2 numeric(12,2),
  p25_usd_m2 numeric(12,2),
  p75_usd_m2 numeric(12,2),
  n_avisos int not null default 0,
  n_escrituras int not null default 0,
  var_mensual numeric(7,2),
  costo_constr_usd_m2 numeric(12,2),
  veredicto text,                                 -- 'construir' | 'comprar' | 'esperar'
  confianza text not null default 'estimada',     -- 'alta' | 'media' | 'estimada'
  calculado_en timestamptz not null default now(),
  unique (zona_id, periodo, tipo_prop)
);

create table if not exists public.inmobiliario_noticias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  url text not null,
  fuente text not null,
  publicado_en timestamptz,
  zona_relevante text,
  score numeric(6,2) not null default 0,
  capturado_en timestamptz not null default now(),
  unique (url)
);
create index if not exists inmobiliario_noticias_score_idx
  on public.inmobiliario_noticias (score desc, publicado_en desc);

alter table public.inmobiliario_zonas enable row level security;
alter table public.inmobiliario_avisos_snapshot enable row level security;
alter table public.inmobiliario_precios_zona_periodo enable row level security;
alter table public.inmobiliario_noticias enable row level security;

drop policy if exists "inmobiliario_zonas_all" on public.inmobiliario_zonas;
create policy "inmobiliario_zonas_all" on public.inmobiliario_zonas for all using (true) with check (true);
drop policy if exists "inmobiliario_avisos_all" on public.inmobiliario_avisos_snapshot;
create policy "inmobiliario_avisos_all" on public.inmobiliario_avisos_snapshot for all using (true) with check (true);
drop policy if exists "inmobiliario_precios_all" on public.inmobiliario_precios_zona_periodo;
create policy "inmobiliario_precios_all" on public.inmobiliario_precios_zona_periodo for all using (true) with check (true);
drop policy if exists "inmobiliario_noticias_all" on public.inmobiliario_noticias;
create policy "inmobiliario_noticias_all" on public.inmobiliario_noticias for all using (true) with check (true);

grant select, insert, update, delete on public.inmobiliario_zonas to anon, authenticated, service_role;
grant select, insert, update, delete on public.inmobiliario_avisos_snapshot to anon, authenticated, service_role;
grant select, insert, update, delete on public.inmobiliario_precios_zona_periodo to anon, authenticated, service_role;
grant select, insert, update, delete on public.inmobiliario_noticias to anon, authenticated, service_role;
```

- [ ] **Step 2: Aplicar la migración**

Run: `npx supabase db push` (o el comando que use el repo según `supabase/config.toml`).
Expected: migración aplicada sin error. Verificar en el dashboard que las 4 tablas existen.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260522120000_inmobiliario_schema.sql
git commit -m "feat(inmobiliario): schema de zonas, avisos, precios y noticias"
```

### Task 1.3: Tipos compartidos y config

**Files:**
- Create: `src/lib/inmobiliario/tipos.ts`
- Create: `src/lib/inmobiliario/config.ts`

- [ ] **Step 1: Escribir `tipos.ts` (contrato central)**

```ts
export type TipoDato = "publicacion" | "cierre" | "referencia";
export type TipoProp = "departamento" | "casa" | "ph" | "lote";
export type Region = "CABA" | "GBA_NORTE";
export type Veredicto = "construir" | "comprar" | "esperar";
export type Confianza = "alta" | "media" | "estimada";

/** Forma normalizada a la que TODA fuente externa debe mapear. */
export interface AvisoNormalizado {
  fuente: string;        // 'mercadolibre' | 'caba_escrituras' | 'reporte_inmobiliario'
  tipoDato: TipoDato;
  fuenteId: string;      // clave de dedup
  zonaMatch: string;     // string de zona crudo de la fuente (se mapea a zona_id)
  operacion: "venta";
  tipoProp: TipoProp;
  precioUsd: number;
  m2: number;
  usdPorM2: number;      // precioUsd / m2
  ambientes: number | null;
  antiguedad: number | null;
  capturadoEn: string;   // ISO
}

/** Resultado de agregar avisos de UNA zona+período+tipoProp. */
export interface AgregadoZona {
  medianaPublicacionUsdM2: number | null;
  medianaCierreUsdM2: number | null;
  factorAjuste: number;
  refReporteUsdM2: number | null;
  p25UsdM2: number | null;
  p75UsdM2: number | null;
  nAvisos: number;
  nEscrituras: number;
  confianza: Confianza;
}
```

- [ ] **Step 2: Escribir `config.ts` (umbrales ajustables)**

```ts
/** Parámetros de negocio, en un solo lugar para tunear sin tocar lógica. */
export const INMOBILIARIO_CONFIG = {
  /** Factor publicación->cierre por defecto cuando no hay escrituras reales. */
  factorAjustePorDefecto: 0.9,
  /** Mínimo de escrituras reales para confianza 'alta'. */
  minEscriturasAlta: 8,
  /** Filtro de outliers: descartar por debajo de Pmin y por encima de Pmax. */
  percentilInferior: 5,
  percentilSuperior: 95,
  /** Umbrales de veredicto sobre la brecha (cierre / costo construcción). */
  brechaAlta: 3.2,     // mucho margen entre construir y vender -> conviene construir
  brechaMedia: 2.2,    // margen moderado
  /** Variación mensual (fracción) que se considera caída. */
  umbralCaida: -0.015,
} as const;
```

- [ ] **Step 3: Verificar tipado**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en estos archivos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/inmobiliario/tipos.ts src/lib/inmobiliario/config.ts
git commit -m "feat(inmobiliario): tipos compartidos y config de umbrales"
```

### Task 1.4: Estadística pura (mediana, percentil, outliers) — TDD

**Files:**
- Test: `src/lib/inmobiliario/__tests__/estadistica.test.ts`
- Create: `src/lib/inmobiliario/estadistica.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import { mediana, percentil, filtrarOutliers } from "@/lib/inmobiliario/estadistica";

describe("mediana", () => {
  it("devuelve el valor medio en lista impar", () => {
    expect(mediana([3, 1, 2])).toBe(2);
  });
  it("promedia los dos centrales en lista par", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
  it("devuelve null en lista vacía", () => {
    expect(mediana([])).toBeNull();
  });
});

describe("percentil", () => {
  it("p50 equivale a la mediana", () => {
    expect(percentil([1, 2, 3, 4, 5], 50)).toBe(3);
  });
});

describe("filtrarOutliers", () => {
  it("descarta extremos por debajo de P5 y por encima de P95", () => {
    const datos = [1, ...Array(98).fill(100), 9999]; // 1 y 9999 son outliers
    const limpio = filtrarOutliers(datos, 5, 95);
    expect(limpio).not.toContain(1);
    expect(limpio).not.toContain(9999);
    expect(limpio.every((x) => x === 100)).toBe(true);
  });
  it("no rompe con lista vacía", () => {
    expect(filtrarOutliers([], 5, 95)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test -- estadistica`
Expected: FAIL — "Cannot find module .../estadistica".

- [ ] **Step 3: Implementar `estadistica.ts`**

```ts
export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[mid - 1] + orden[mid]) / 2 : orden[mid];
}

export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const idx = (p / 100) * (orden.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return orden[lo];
  return orden[lo] + (orden[hi] - orden[lo]) * (idx - lo);
}

export function filtrarOutliers(valores: number[], pInf: number, pSup: number): number[] {
  if (valores.length === 0) return [];
  const min = percentil(valores, pInf);
  const max = percentil(valores, pSup);
  if (min === null || max === null) return valores;
  return valores.filter((v) => v >= min && v <= max);
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test -- estadistica`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/estadistica.ts src/lib/inmobiliario/__tests__/estadistica.test.ts
git commit -m "feat(inmobiliario): estadística pura con tests (mediana, percentil, outliers)"
```

### Task 1.5: Agregación de precios (factor de ajuste publicación→cierre) — TDD

**Files:**
- Test: `src/lib/inmobiliario/__tests__/agregar-precios.test.ts`
- Create: `src/lib/inmobiliario/agregar-precios.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import { agregarZona } from "@/lib/inmobiliario/agregar-precios";
import type { AvisoNormalizado } from "@/lib/inmobiliario/tipos";

function aviso(tipoDato: AvisoNormalizado["tipoDato"], usdPorM2: number): AvisoNormalizado {
  return {
    fuente: "test", tipoDato, fuenteId: Math.random().toString(),
    zonaMatch: "Palermo", operacion: "venta", tipoProp: "departamento",
    precioUsd: usdPorM2 * 50, m2: 50, usdPorM2, ambientes: 2, antiguedad: 10,
    capturadoEn: new Date().toISOString(),
  };
}

describe("agregarZona", () => {
  it("calcula factor de ajuste real cuando hay escrituras", () => {
    const avisos = [
      ...Array(10).fill(0).map(() => aviso("publicacion", 2000)),
      ...Array(10).fill(0).map(() => aviso("cierre", 1800)), // cierre = 90% de publicación
    ];
    const r = agregarZona(avisos);
    expect(r.medianaPublicacionUsdM2).toBe(2000);
    expect(r.medianaCierreUsdM2).toBe(1800);
    expect(r.factorAjuste).toBeCloseTo(0.9, 2);
    expect(r.confianza).toBe("alta");
  });

  it("usa factor por defecto y confianza 'estimada' cuando no hay escrituras", () => {
    const avisos = Array(10).fill(0).map(() => aviso("publicacion", 2000));
    const r = agregarZona(avisos);
    expect(r.medianaPublicacionUsdM2).toBe(2000);
    expect(r.medianaCierreUsdM2).toBe(1800); // 2000 * 0.9
    expect(r.confianza).toBe("estimada");
    expect(r.nEscrituras).toBe(0);
  });

  it("no rompe sin avisos de publicación", () => {
    const r = agregarZona([]);
    expect(r.medianaPublicacionUsdM2).toBeNull();
    expect(r.medianaCierreUsdM2).toBeNull();
    expect(r.nAvisos).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test -- agregar-precios`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `agregar-precios.ts`**

```ts
import type { AvisoNormalizado, AgregadoZona } from "@/lib/inmobiliario/tipos";
import { INMOBILIARIO_CONFIG as C } from "@/lib/inmobiliario/config";
import { mediana, percentil, filtrarOutliers } from "@/lib/inmobiliario/estadistica";

export function agregarZona(avisos: AvisoNormalizado[]): AgregadoZona {
  const pub = filtrarOutliers(
    avisos.filter((a) => a.tipoDato === "publicacion").map((a) => a.usdPorM2),
    C.percentilInferior, C.percentilSuperior,
  );
  const cierre = filtrarOutliers(
    avisos.filter((a) => a.tipoDato === "cierre").map((a) => a.usdPorM2),
    C.percentilInferior, C.percentilSuperior,
  );
  const ref = avisos.filter((a) => a.tipoDato === "referencia").map((a) => a.usdPorM2);

  const medianaPublicacionUsdM2 = mediana(pub);
  const medianaCierreReal = mediana(cierre);
  const refReporteUsdM2 = mediana(ref);
  const nEscrituras = cierre.length;

  let factorAjuste = C.factorAjustePorDefecto;
  let confianza: AgregadoZona["confianza"] = "estimada";

  if (medianaCierreReal !== null && medianaPublicacionUsdM2 !== null && medianaPublicacionUsdM2 > 0) {
    factorAjuste = medianaCierreReal / medianaPublicacionUsdM2;
    confianza = nEscrituras >= C.minEscriturasAlta ? "alta" : "media";
  } else if (refReporteUsdM2 !== null) {
    confianza = "media";
  }

  const medianaCierreUsdM2 =
    medianaCierreReal ??
    (medianaPublicacionUsdM2 !== null ? round2(medianaPublicacionUsdM2 * factorAjuste) : null);

  return {
    medianaPublicacionUsdM2,
    medianaCierreUsdM2,
    factorAjuste: round3(factorAjuste),
    refReporteUsdM2,
    p25UsdM2: percentil(pub, 25),
    p75UsdM2: percentil(pub, 75),
    nAvisos: pub.length,
    nEscrituras,
    confianza,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test -- agregar-precios`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/agregar-precios.ts src/lib/inmobiliario/__tests__/agregar-precios.test.ts
git commit -m "feat(inmobiliario): agregación con factor de ajuste publicación->cierre"
```

### Task 1.6: Veredicto Construir/Comprar/Esperar — TDD

**Files:**
- Test: `src/lib/inmobiliario/__tests__/veredicto.test.ts`
- Create: `src/lib/inmobiliario/veredicto.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from "vitest";
import { calcularVeredicto } from "@/lib/inmobiliario/veredicto";

describe("calcularVeredicto", () => {
  it("construir: brecha alta y precios subiendo", () => {
    // cierre 2500, costo 700 -> brecha 3.57 (>3.2), var +2%
    expect(calcularVeredicto(2500, 700, 0.02)).toBe("construir");
  });
  it("comprar: brecha media", () => {
    // cierre 1750, costo 700 -> brecha 2.5 (entre 2.2 y 3.2)
    expect(calcularVeredicto(1750, 700, 0.01)).toBe("comprar");
  });
  it("esperar: brecha baja", () => {
    // cierre 1300, costo 700 -> brecha 1.86 (<2.2)
    expect(calcularVeredicto(1300, 700, 0.0)).toBe("esperar");
  });
  it("esperar: aunque brecha alta, precios cayendo fuerte", () => {
    expect(calcularVeredicto(2500, 700, -0.03)).toBe("esperar");
  });
  it("esperar: sin datos suficientes", () => {
    expect(calcularVeredicto(null, 700, 0.02)).toBe("esperar");
    expect(calcularVeredicto(2500, null, 0.02)).toBe("esperar");
  });
});
```

- [ ] **Step 2: Correr el test (debe fallar)**

Run: `npm run test -- veredicto`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `veredicto.ts`**

```ts
import { INMOBILIARIO_CONFIG as C } from "@/lib/inmobiliario/config";
import type { Veredicto } from "@/lib/inmobiliario/tipos";

/**
 * @param cierreUsdM2 precio estimado de cierre (USD/m²)
 * @param costoConstrUsdM2 costo de construcción (USD/m²)
 * @param varMensual variación mensual como fracción (0.02 = +2%)
 */
export function calcularVeredicto(
  cierreUsdM2: number | null,
  costoConstrUsdM2: number | null,
  varMensual: number | null,
): Veredicto {
  if (!cierreUsdM2 || !costoConstrUsdM2 || costoConstrUsdM2 <= 0) return "esperar";
  const v = varMensual ?? 0;
  if (v <= C.umbralCaida) return "esperar"; // precios cayendo: esperar

  const brecha = cierreUsdM2 / costoConstrUsdM2;
  if (brecha >= C.brechaAlta && v >= 0) return "construir";
  if (brecha >= C.brechaMedia) return "comprar";
  return "esperar";
}
```

- [ ] **Step 4: Correr el test (debe pasar)**

Run: `npm run test -- veredicto`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/veredicto.ts src/lib/inmobiliario/__tests__/veredicto.test.ts
git commit -m "feat(inmobiliario): heurística de veredicto construir/comprar/esperar"
```

### Task 1.7: Costo de construcción USD/m² desde el maestro de precios

**Files:**
- Create: `src/lib/inmobiliario/costo-construccion.ts`
- Test: `src/lib/inmobiliario/__tests__/costo-construccion.test.ts`

> El maestro (`maestro_precios_items`) tiene `costo_mo_m2` y `costo_materiales_m2` en ARS por m². El costo de construcción de referencia = suma de (mo + materiales) de los ítems base, convertido a USD con la cotización vigente. La cotización USD ya se usa en el módulo de rentabilidad; reusar esa fuente (no hardcodear).

- [ ] **Step 1: Test que falla (función pura de cálculo)**

```ts
import { describe, it, expect } from "vitest";
import { costoConstruccionUsdM2 } from "@/lib/inmobiliario/costo-construccion";

describe("costoConstruccionUsdM2", () => {
  it("suma mo+materiales por m² y convierte a USD", () => {
    const items = [
      { costo_mo_m2: 100000, costo_materiales_m2: 200000 },
      { costo_mo_m2: 50000, costo_materiales_m2: 100000 },
    ];
    // total ARS/m² = 450000 ; usd = 1000 -> 450 USD/m²
    expect(costoConstruccionUsdM2(items, 1000)).toBe(450);
  });
  it("devuelve null si la cotización es 0 o inválida", () => {
    expect(costoConstruccionUsdM2([{ costo_mo_m2: 1, costo_materiales_m2: 1 }], 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npm run test -- costo-construccion`
Expected: FAIL.

- [ ] **Step 3: Implementar `costo-construccion.ts`**

```ts
export interface MaestroItemCosto {
  costo_mo_m2: number;
  costo_materiales_m2: number;
}

/** Costo de construcción de referencia en USD/m². cotizacionUsd = ARS por 1 USD. */
export function costoConstruccionUsdM2(
  items: MaestroItemCosto[],
  cotizacionUsd: number,
): number | null {
  if (!cotizacionUsd || cotizacionUsd <= 0) return null;
  const totalArs = items.reduce(
    (acc, it) => acc + (it.costo_mo_m2 || 0) + (it.costo_materiales_m2 || 0),
    0,
  );
  return Math.round((totalArs / cotizacionUsd) * 100) / 100;
}
```

- [ ] **Step 4: Correr (debe pasar)**

Run: `npm run test -- costo-construccion`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/costo-construccion.ts src/lib/inmobiliario/__tests__/costo-construccion.test.ts
git commit -m "feat(inmobiliario): costo de construcción USD/m² desde maestro de precios"
```

### Task 1.8: Seed de zonas (CABA + GBA Norte)

**Files:**
- Create: `src/lib/inmobiliario/zonas-seed.ts`

- [ ] **Step 1: Escribir el seed**

Lista inicial (ampliable). `ml_match` son alias que pueden venir de las fuentes.

```ts
import type { Region, TipoProp } from "@/lib/inmobiliario/tipos";

export interface ZonaSeed {
  nombre: string;
  tipo: "barrio_caba" | "partido_gba" | "barrio_privado";
  region: Region;
  ml_match: string[];
  lat?: number;
  lng?: number;
}

export const ZONAS_SEED: ZonaSeed[] = [
  // CABA — zona norte/centro (mercado de RAVN)
  { nombre: "Palermo", tipo: "barrio_caba", region: "CABA", ml_match: ["Palermo", "Palermo Soho", "Palermo Hollywood", "Las Cañitas"] },
  { nombre: "Belgrano", tipo: "barrio_caba", region: "CABA", ml_match: ["Belgrano", "Belgrano R", "Belgrano C"] },
  { nombre: "Núñez", tipo: "barrio_caba", region: "CABA", ml_match: ["Nuñez", "Núñez"] },
  { nombre: "Recoleta", tipo: "barrio_caba", region: "CABA", ml_match: ["Recoleta"] },
  { nombre: "Puerto Madero", tipo: "barrio_caba", region: "CABA", ml_match: ["Puerto Madero"] },
  { nombre: "Caballito", tipo: "barrio_caba", region: "CABA", ml_match: ["Caballito"] },
  { nombre: "Villa Urquiza", tipo: "barrio_caba", region: "CABA", ml_match: ["Villa Urquiza"] },
  { nombre: "Saavedra", tipo: "barrio_caba", region: "CABA", ml_match: ["Saavedra"] },
  { nombre: "Colegiales", tipo: "barrio_caba", region: "CABA", ml_match: ["Colegiales"] },
  // GBA Norte (zona de operación real)
  { nombre: "Vicente López", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["Vicente Lopez", "Olivos", "Florida", "La Lucila"] },
  { nombre: "San Isidro", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["San Isidro", "Acassuso", "Beccar", "Martinez"] },
  { nombre: "Tigre", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["Tigre", "Nordelta", "Rincón de Milberg"] },
  { nombre: "Nordelta", tipo: "barrio_privado", region: "GBA_NORTE", ml_match: ["Nordelta"] },
  { nombre: "Pilar", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["Pilar", "Del Viso", "Manuel Alberti"] },
  { nombre: "San Fernando", tipo: "partido_gba", region: "GBA_NORTE", ml_match: ["San Fernando", "Victoria"] },
];

export const TIPOS_PROP: TipoProp[] = ["departamento", "casa", "ph"];
```

- [ ] **Step 2: Verificar tipado**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inmobiliario/zonas-seed.ts
git commit -m "feat(inmobiliario): seed de zonas CABA + GBA Norte"
```

---

## STAGE 2 — Fuentes de datos (mapean a AvisoNormalizado)

> Cada fuente expone `async function obtener(zona): Promise<AvisoNormalizado[]>`. El mapeo de campos exactos sale del contrato documentado en Stage 0 (`docs/superpowers/notas/ml-api-contract.md`) y se testea contra los fixtures capturados. **Implementar el parseo según el fixture real, no según campos supuestos.**

### Task 2.1: Fuente MercadoLibre — TDD contra fixture

**Files:**
- Test: `src/lib/inmobiliario/__tests__/mercadolibre.test.ts`
- Create: `src/lib/inmobiliario/fuentes/mercadolibre.ts`

- [ ] **Step 1: Escribir el test contra el fixture de Stage 0**

El test carga `__fixtures__/ml-search-palermo.json` y verifica que `normalizarRespuestaML` produce `AvisoNormalizado[]` válidos (precio USD > 0, m2 > 0, usdPorM2 calculado, fuenteId presente). Ajustar los asserts a los campos reales documentados en el contrato.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizarRespuestaML } from "@/lib/inmobiliario/fuentes/mercadolibre";

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../__fixtures__/ml-search-palermo.json"), "utf8"),
);

describe("normalizarRespuestaML", () => {
  it("mapea resultados a AvisoNormalizado con USD/m² calculado", () => {
    const avisos = normalizarRespuestaML(fixture, "Palermo");
    expect(avisos.length).toBeGreaterThan(0);
    for (const a of avisos) {
      expect(a.fuente).toBe("mercadolibre");
      expect(a.tipoDato).toBe("publicacion");
      expect(a.precioUsd).toBeGreaterThan(0);
      expect(a.m2).toBeGreaterThan(0);
      expect(a.usdPorM2).toBeCloseTo(a.precioUsd / a.m2, 0);
      expect(a.fuenteId).toBeTruthy();
    }
  });
  it("descarta avisos sin superficie o sin precio USD", () => {
    const avisos = normalizarRespuestaML(fixture, "Palermo");
    expect(avisos.every((a) => a.m2 > 0 && a.precioUsd > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)**

Run: `npm run test -- mercadolibre`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implementar `mercadolibre.ts`**

Implementar `normalizarRespuestaML(respuesta, zonaMatch)` y `obtenerML(zona)` según el contrato de Stage 0. Estructura esperada (ajustar nombres de campos a lo documentado):

```ts
import type { AvisoNormalizado, TipoProp } from "@/lib/inmobiliario/tipos";

const ML_BASE = "https://api.mercadolibre.com";
const CATEGORIA_INMUEBLES = "MLA1459";

// Mapea un result de ML a AvisoNormalizado (o null si no sirve).
// NOTA: los nombres de campo exactos (price, currency_id, attributes[TOTAL_AREA],
// etc.) se confirman en docs/superpowers/notas/ml-api-contract.md.
function mapResult(r: any, zonaMatch: string): AvisoNormalizado | null {
  if (!r || r.currency_id !== "USD") return null;
  const precioUsd = Number(r.price);
  const m2 = extraerM2(r);
  if (!precioUsd || !m2) return null;
  return {
    fuente: "mercadolibre",
    tipoDato: "publicacion",
    fuenteId: String(r.id),
    zonaMatch,
    operacion: "venta",
    tipoProp: inferirTipoProp(r),
    precioUsd,
    m2,
    usdPorM2: Math.round((precioUsd / m2) * 100) / 100,
    ambientes: extraerAtributoNum(r, "ROOMS"),
    antiguedad: extraerAtributoNum(r, "PROPERTY_AGE"),
    capturadoEn: new Date().toISOString(),
  };
}

function extraerM2(r: any): number | null {
  const attrs: any[] = r.attributes ?? [];
  const cubierta = attrs.find((a) => a.id === "COVERED_AREA");
  const total = attrs.find((a) => a.id === "TOTAL_AREA");
  const val = Number(cubierta?.value_struct?.number ?? total?.value_struct?.number ?? 0);
  return val > 0 ? val : null;
}

function extraerAtributoNum(r: any, id: string): number | null {
  const a = (r.attributes ?? []).find((x: any) => x.id === id);
  const n = Number(a?.value_struct?.number ?? a?.value_name);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inferirTipoProp(r: any): TipoProp {
  const t = String(r.title ?? "").toLowerCase();
  if (t.includes("casa")) return "casa";
  if (t.includes("ph")) return "ph";
  if (t.includes("lote") || t.includes("terreno")) return "lote";
  return "departamento";
}

export function normalizarRespuestaML(respuesta: any, zonaMatch: string): AvisoNormalizado[] {
  const results: any[] = respuesta?.results ?? [];
  return results.map((r) => mapResult(r, zonaMatch)).filter((x): x is AvisoNormalizado => x !== null);
}

/** Trae avisos de venta para los alias de una zona. Tolera fallos de red. */
export async function obtenerML(zonaMatch: string): Promise<AvisoNormalizado[]> {
  const url = `${ML_BASE}/sites/MLA/search?category=${CATEGORIA_INMUEBLES}&q=${encodeURIComponent(
    "venta " + zonaMatch,
  )}&limit=50`;
  const headers: Record<string, string> = {};
  if (process.env.ML_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.ML_ACCESS_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`ML ${res.status}`);
  return normalizarRespuestaML(await res.json(), zonaMatch);
}
```

> Si Stage 0 determinó que hace falta OAuth, agregar aquí `obtenerTokenML()` con client_credentials usando `ML_CLIENT_ID`/`ML_CLIENT_SECRET`, y setear `ML_ACCESS_TOKEN` en runtime. Documentado en el contrato.

- [ ] **Step 4: Correr (debe pasar)**

Run: `npm run test -- mercadolibre`
Expected: PASS. Si falla por nombres de campo, corregir `mapResult`/`extraerM2` según el fixture real.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/fuentes/mercadolibre.ts src/lib/inmobiliario/__tests__/mercadolibre.test.ts
git commit -m "feat(inmobiliario): fuente MercadoLibre con normalización testeada"
```

### Task 2.2: Fuente CABA escrituras — TDD contra fixture

**Files:**
- Test: `src/lib/inmobiliario/__tests__/caba-escrituras.test.ts`
- Create: `src/lib/inmobiliario/fuentes/caba-escrituras.ts`

- [ ] **Step 1: Test contra el CSV fixture de Stage 0**

Verifica que `parsearEscriturasCaba(csvText)` devuelve `AvisoNormalizado[]` con `tipoDato: "cierre"`, precio en USD (convertir si el dataset está en ARS, usando la cotización pasada como parámetro) y m². Ajustar columnas a las reales documentadas.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsearEscriturasCaba } from "@/lib/inmobiliario/fuentes/caba-escrituras";

const csv = readFileSync(resolve(__dirname, "../__fixtures__/caba-escrituras.csv"), "utf8");

describe("parsearEscriturasCaba", () => {
  it("devuelve avisos de cierre con USD/m²", () => {
    const avisos = parsearEscriturasCaba(csv, 1000); // cotización ARS/USD si hiciera falta
    expect(Array.isArray(avisos)).toBe(true);
    for (const a of avisos) {
      expect(a.tipoDato).toBe("cierre");
      expect(a.fuente).toBe("caba_escrituras");
    }
  });
  it("no rompe con CSV vacío", () => {
    expect(parsearEscriturasCaba("", 1000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr (debe fallar)** — Run: `npm run test -- caba-escrituras` → FAIL.

- [ ] **Step 3: Implementar `caba-escrituras.ts`**

Parser CSV simple (sin dependencia externa; split por línea y coma, respetando el formato real del fixture). Mapear columnas reales (precio, superficie, barrio, fecha) a `AvisoNormalizado` con `tipoDato:"cierre"`. Convertir a USD si el dataset está en ARS. Implementar `obtenerEscriturasCaba()` que hace `fetch` del CSV del recurso y llama al parser. Tolerar fallos.

- [ ] **Step 4: Correr (debe pasar)** — Run: `npm run test -- caba-escrituras` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/fuentes/caba-escrituras.ts src/lib/inmobiliario/__tests__/caba-escrituras.test.ts
git commit -m "feat(inmobiliario): fuente CABA escrituras (precio de cierre real)"
```

### Task 2.3: Fuente Reporte Inmobiliario (referencia)

**Files:**
- Create: `src/lib/inmobiliario/fuentes/reporte-inmobiliario.ts`

> Sin API. Implementar `obtenerReferencia(zona): Promise<AvisoNormalizado[]>` con `tipoDato:"referencia"`. Si Stage 0 no encontró una página parseable confiable, esta fuente arranca devolviendo `[]` (la confianza cae a 'estimada', el tablero igual funciona). No bloquea.

- [ ] **Step 1: Implementar el stub funcional**

```ts
import type { AvisoNormalizado } from "@/lib/inmobiliario/tipos";

/** Valores de referencia por barrio. Fase 1: si no hay fuente parseable, devuelve []. */
export async function obtenerReferencia(_zonaMatch: string): Promise<AvisoNormalizado[]> {
  // TODO Stage 0: si se documentó una página/endpoint parseable de Reporte Inmobiliario,
  // implementar el fetch + parseo aquí. Mientras tanto, sin referencia (no bloquea).
  return [];
}
```

- [ ] **Step 2: Verificar tipado** — Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inmobiliario/fuentes/reporte-inmobiliario.ts
git commit -m "feat(inmobiliario): fuente de referencia (placeholder no bloqueante)"
```

### Task 2.4: Fuente noticias RSS — TDD contra fixture

**Files:**
- Test: `src/lib/inmobiliario/__tests__/noticias-rss.test.ts`
- Create: `src/lib/inmobiliario/fuentes/noticias-rss.ts`

- [ ] **Step 1: Test de parseo + scoring contra el XML fixture**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsearFeed, scoreNoticia } from "@/lib/inmobiliario/fuentes/noticias-rss";

const xml = readFileSync(resolve(__dirname, "../__fixtures__/feed-ejemplo.xml"), "utf8");

describe("parsearFeed", () => {
  it("extrae items con título, url y fecha", () => {
    const items = parsearFeed(xml, "Infobae");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].titulo).toBeTruthy();
    expect(items[0].url).toMatch(/^https?:\/\//);
  });
});

describe("scoreNoticia", () => {
  it("puntúa más alto si menciona zona del usuario", () => {
    const base = { titulo: "Suben los precios", url: "x", fuente: "x", publicado_en: new Date().toISOString(), zona_relevante: null };
    const conZona = { ...base, titulo: "Nordelta lidera la suba del m²" };
    expect(scoreNoticia(conZona)).toBeGreaterThan(scoreNoticia(base));
  });
});
```

- [ ] **Step 2: Correr (debe fallar)** — Run: `npm run test -- noticias-rss` → FAIL.

- [ ] **Step 3: Implementar `noticias-rss.ts`**

Parser RSS por regex/split (sin dependencia externa; extraer `<item>`, `<title>`, `<link>`, `<pubDate>`). `scoreNoticia` suma puntos por keywords inmobiliarias y por zonas del usuario (`Nordelta`, `zona norte`, etc.), y por recencia. `obtenerNoticias(feeds)` recorre los feeds confirmados en Stage 0, tolera fallos por feed, devuelve los items con score.

- [ ] **Step 4: Correr (debe pasar)** — Run: `npm run test -- noticias-rss` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inmobiliario/fuentes/noticias-rss.ts src/lib/inmobiliario/__tests__/noticias-rss.test.ts
git commit -m "feat(inmobiliario): parseo y scoring de noticias RSS"
```

---

## STAGE 3 — Rutas API y crons

### Task 3.1: Route handler `refresh-precios` (cron diario)

**Files:**
- Create: `src/app/api/inmobiliario/refresh-precios/route.ts`

> Orquesta: por cada zona → traer ML + escrituras CABA + referencia → insertar en `avisos_snapshot` (dedup) → `agregarZona` → `costoConstruccionUsdM2` → `calcularVeredicto` → upsert en `precios_zona_periodo` para el período actual. Cada zona en try/catch propio (resiliencia). Proteger con `CRON_SECRET`.

- [ ] **Step 1: Implementar el handler**

Usar `createSupabaseServerClient()` de `src/lib/supabase/server.ts`. Leer zonas activas, iterar, agregar y upsert. Calcular `var_mensual` comparando con el período anterior leído de la tabla. Devolver resumen JSON `{ ok, zonasProcesadas, errores }`. Verificar header `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel Cron lo envía). `export const maxDuration = 300;` y `export const dynamic = "force-dynamic";`.

- [ ] **Step 2: Verificar build/tipado** — Run: `npx tsc --noEmit` → sin errores.

- [ ] **Step 3: Probar localmente con el dev server**

Run: `npm run dev` y en otra terminal:
```bash
curl -s -X POST "http://localhost:3000/api/inmobiliario/refresh-precios" -H "Authorization: Bearer $CRON_SECRET" | head -c 400; echo
```
Expected: `{"ok":true,"zonasProcesadas":N,...}` y filas nuevas en `inmobiliario_precios_zona_periodo` (verificar en Supabase). Si ML pide auth, ajustar credenciales según Stage 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/inmobiliario/refresh-precios/route.ts
git commit -m "feat(inmobiliario): cron de ingesta y agregación de precios"
```

### Task 3.2: Route handler `refresh-noticias` (cron horario)

**Files:**
- Create: `src/app/api/inmobiliario/refresh-noticias/route.ts`

- [ ] **Step 1: Implementar** — leer feeds confirmados, `parsearFeed` + `scoreNoticia`, upsert en `inmobiliario_noticias` (dedup por `url`). Protección `CRON_SECRET`, `maxDuration`, `dynamic`. Resiliente por feed.

- [ ] **Step 2: Probar local**
```bash
curl -s -X POST "http://localhost:3000/api/inmobiliario/refresh-noticias" -H "Authorization: Bearer $CRON_SECRET" | head -c 300; echo
```
Expected: `{"ok":true,"noticiasNuevas":N}` y filas en la tabla.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inmobiliario/refresh-noticias/route.ts
git commit -m "feat(inmobiliario): cron de ingesta de noticias"
```

### Task 3.3: Route handler `tablero` (lectura para el front)

**Files:**
- Create: `src/app/api/inmobiliario/tablero/route.ts`

- [ ] **Step 1: Implementar** — GET con query `?region=CABA|GBA_NORTE` (default CABA). Lee `inmobiliario_precios_zona_periodo` del último período join `inmobiliario_zonas`, ordena por `mediana_cierre_usd_m2` desc, calcula KPIs (promedios de cierre/construcción, conteo de avisos, brecha promedio). Lee top 10 noticias por `score`. Devuelve `{ kpis, ranking, evolucion, noticias, actualizadoEn }`. La serie `evolucion` agrega por período los últimos 12 meses (promedio ponderado de cierre vs costo). `export const dynamic = "force-dynamic";`

- [ ] **Step 2: Probar local**
```bash
curl -s "http://localhost:3000/api/inmobiliario/tablero?region=CABA" | head -c 600; echo
```
Expected: JSON con `kpis`, `ranking[]`, `noticias[]`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inmobiliario/tablero/route.ts
git commit -m "feat(inmobiliario): API de lectura del tablero"
```

### Task 3.4: Configurar Vercel Cron

**Files:**
- Create or Modify: `vercel.json`

- [ ] **Step 1: Agregar/crear `vercel.json` con los crons**

```json
{
  "crons": [
    { "path": "/api/inmobiliario/refresh-noticias", "schedule": "0 * * * *" },
    { "path": "/api/inmobiliario/refresh-precios", "schedule": "0 9 * * *" }
  ]
}
```

> Si ya existe `vercel.json`, fusionar la clave `crons` sin pisar lo demás. Setear `CRON_SECRET` en las env vars del proyecto en Vercel (Stage de deploy). Vercel Cron envía `Authorization: Bearer <CRON_SECRET>` automáticamente.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(inmobiliario): crons de Vercel para refresh de precios y noticias"
```

---

## STAGE 4 — Tablero UI (Layout B)

> Estética RAVN: tokens `ravn-*`, Raleway, `rounded-none`, bordes finos, acento beige para deltas/veredictos. Veredictos con color semántico + texto. Números tabulares. Recharts para la evolución. Verificación manual en 375/768/1024/1440px, light y dark. Referencia visual: el mockup aprobado (`.superpowers/brainstorm/.../cerebro-inmobiliario.html`).

### Task 4.1: Página + screen base + link en home

**Files:**
- Create: `src/app/inmobiliario/page.tsx`
- Create: `src/app/inmobiliario/tablero-screen.tsx`
- Modify: `src/app/page.tsx` (agregar link de nav)

- [ ] **Step 1: `page.tsx`** — server component con `metadata` (título "RAVN — Inteligencia Inmobiliaria") que hace fetch del API `tablero` (server-side) y pasa los datos a `<TableroScreen>`. Seguir el patrón de `rentabilidad/page.tsx`.

- [ ] **Step 2: `tablero-screen.tsx`** — client component que recibe los datos y renderiza el Layout B: header con "En vivo" + `actualizadoEn`, grid 2 columnas (izquierda KPIs+chart+ranking, derecha noticias). Selector de región CABA/GBA Norte que refetchea. Estados vacíos ("Sin datos aún — esperando primera actualización").

- [ ] **Step 3: Link en `src/app/page.tsx`** — agregar un `<Link href="/inmobiliario">` con el estilo de los demás botones de nav (clase `border-2 border-ravn-line ...`), texto "Inteligencia inmobiliaria".

- [ ] **Step 4: Verificar** — Run: `npm run dev`, abrir `http://localhost:3000/inmobiliario`. Expected: la página carga con los datos (o estado vacío si no se corrió el refresh).

- [ ] **Step 5: Commit**

```bash
git add src/app/inmobiliario/ src/app/page.tsx
git commit -m "feat(inmobiliario): página del tablero + link en home"
```

### Task 4.2: Componente `kpi-grid.tsx`

**Files:**
- Create: `src/components/inmobiliario/kpi-grid.tsx`

- [ ] **Step 1: Implementar** — 4 KPIs (venta promedio cierre USD/m², construcción USD/m², avisos activos, brecha promedio). Props tipadas. Grid responsive (1 col mobile → 4 cols desktop). Números tabulares, delta beige con flecha + texto (no solo color). Borde fino, `rounded-none`.

- [ ] **Step 2: Integrar en `tablero-screen.tsx`** e importar.

- [ ] **Step 3: Verificar visualmente** — recargar `/inmobiliario`, ver los 4 KPIs. Probar 375px.

- [ ] **Step 4: Commit**

```bash
git add src/components/inmobiliario/kpi-grid.tsx src/app/inmobiliario/tablero-screen.tsx
git commit -m "feat(inmobiliario): KPI grid del tablero"
```

### Task 4.3: Componente `evolucion-chart.tsx`

**Files:**
- Create: `src/components/inmobiliario/evolucion-chart.tsx`

- [ ] **Step 1: Implementar** — Recharts `LineChart` con dos series: cierre (negro/`ravn-fg`) y construcción (beige punteado). Eje X = meses, eje Y = USD/m². Tooltip con valores exactos. `ResponsiveContainer`. Respetar `prefers-reduced-motion` (Recharts `isAnimationActive={false}` si corresponde). Empty state si no hay serie.

- [ ] **Step 2: Integrar** en `tablero-screen.tsx`.

- [ ] **Step 3: Verificar** — el gráfico renderiza con la serie de 12 meses; tooltip funciona; reflows ok en mobile.

- [ ] **Step 4: Commit**

```bash
git add src/components/inmobiliario/evolucion-chart.tsx src/app/inmobiliario/tablero-screen.tsx
git commit -m "feat(inmobiliario): gráfico de evolución venta vs construcción"
```

### Task 4.4: Componente `ranking-barrios.tsx`

**Files:**
- Create: `src/components/inmobiliario/ranking-barrios.tsx`

- [ ] **Step 1: Implementar** — tabla con columnas: Barrio, USD/m² publicación, USD/m² cierre, Var, Veredicto, Confianza. Header negro. Ordenable por columna (estado local, `aria-sort`). Veredicto con color semántico + texto: Construir (beige/dorado), Comprar (azul), Esperar (gris). Badge de confianza 'estimada' cuando aplique. Doble número visible (publicación/cierre).

- [ ] **Step 2: Integrar** en `tablero-screen.tsx`.

- [ ] **Step 3: Verificar** — tabla ordenable, veredictos con color+texto, doble número legible. Mobile: scroll horizontal controlado o reflow.

- [ ] **Step 4: Commit**

```bash
git add src/components/inmobiliario/ranking-barrios.tsx src/app/inmobiliario/tablero-screen.tsx
git commit -m "feat(inmobiliario): ranking de barrios con doble número y veredicto"
```

### Task 4.5: Componente `feed-noticias.tsx`

**Files:**
- Create: `src/components/inmobiliario/feed-noticias.tsx`

- [ ] **Step 1: Implementar** — columna derecha (fondo `ravn-surface` invertido / oscuro como el mockup). Lista numerada 01-10: título (link `target="_blank" rel="noopener noreferrer"`), fuente + antigüedad, badge "Tu zona" cuando `zona_relevante` matchea zona norte. Header "Top 10 del sector" + "Actualizado hace X". Empty state.

- [ ] **Step 2: Integrar** en `tablero-screen.tsx`.

- [ ] **Step 3: Verificar** — las 10 noticias se ven, los links abren en nueva pestaña, las de zona quedan marcadas.

- [ ] **Step 4: Commit**

```bash
git add src/components/inmobiliario/feed-noticias.tsx src/app/inmobiliario/tablero-screen.tsx
git commit -m "feat(inmobiliario): feed Top 10 de noticias del sector"
```

---

## STAGE 5 — Verificación integral

### Task 5.1: Suite de tests verde + build

- [ ] **Step 1: Correr toda la suite** — Run: `npm run test` → todos los tests PASS.
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → sin errores.
- [ ] **Step 3: Lint** — Run: `npm run lint` → sin errores nuevos.
- [ ] **Step 4: Build** — Run: `npm run build` → build exitoso.

### Task 5.2: Verificación funcional end-to-end (manual)

- [ ] **Step 1:** Correr `refresh-precios` y `refresh-noticias` localmente (curls de Stage 3). Confirmar filas reales en Supabase.
- [ ] **Step 2:** Abrir `/inmobiliario`. Confirmar: KPIs con números reales, gráfico con serie, ranking con doble número + veredicto, 10 noticias.
- [ ] **Step 3: Validación de PRECISIÓN (criterio rector).** Comparar el "precio estimado de cierre" de 3-5 barrios contra el sistema profesional de la novia / Reporte Inmobiliario. Documentar la diferencia. **Si supera ±10%, ajustar `factorAjustePorDefecto` o revisar el cruce con escrituras antes de dar por cerrada la Fase 1.**
- [ ] **Step 4:** Responsive: 375/768/1024/1440px, light y dark. Sin scroll horizontal roto.
- [ ] **Step 5: Resiliencia:** simular fallo de una fuente (cortar red / URL inválida) y confirmar que el tablero sigue mostrando el último dato y los crons no rompen las otras zonas.

### Task 5.3: Cierre de rama

- [ ] **Step 1:** Usar superpowers:finishing-a-development-branch para decidir merge/PR.
- [ ] **Step 2:** Actualizar la memoria del proyecto (`project_ravn_estado.md`) con el estado real: Fase 1 completa, pendientes de Fase 2 (cerebro IA, scraping Zonaprop/Argenprop, mapa).

---

## Notas de ejecución

- **Dependencia dura:** Stage 0 es bloqueante. Sin contratos reales de las fuentes, los fetchers de Stage 2 son especulativos. No saltearlo.
- **Lógica pura testeada (precisión):** estadística, agregación, veredicto y costo tienen tests porque son el corazón de la exactitud — la prioridad #1 de Ezequiel.
- **Fetchers y UI:** verificación contra fixtures y manual, respectivamente (el repo no tiene testing-library; no se introduce para Fase 1).
- **Fase 2 (fuera de alcance):** cerebro de IA (resúmenes + conclusión del día + veredictos por IA vía AI Gateway), scraping Zonaprop/Argenprop, mapa interactivo, cobertura nacional. La arquitectura ya queda preparada (tabla de noticias, agregados, tipos).
