# Frente B — Carcasa + Home cockpit — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la carcasa Jarvis-RAVN del Centro de Mando (sidebar de navegación que envuelve todas las pantallas existentes) + la home cockpit con los 9 módulos del spec §4 + barra de comando contra `trabajos_cola` con Realtime (y resolución inline del caso "anotá …" → tarea directa) + feed Actividad + UI Archivados + vista ADN + lectura del vault vía GitHub API cacheada 5 min.

**Architecture:** La app existente (`~/Documents/ravn`, Next.js 15 App Router + Supabase) gana: (1) tokens nuevos `--cdm-*` para el cockpit (negro `#0a0a0a`, off-white `#f0ede6`, taupe `#c8b49a`) SIN tocar los tokens `--ravn-*` viejos (el PDF de propuesta depende de ellos); (2) un `AppShell` client-side en `layout.tsx` que excluye `/login`, `/propuesta`, `/remito` y `/landing` (las cuatro vistas sin carcasa: login, los dos PDFs para clientes y la landing pública); (3) la home `page.tsx` se reemplaza por el cockpit (server component que lee el vault + grid client con módulos que fetchean igual que las pantallas existentes: API routes con admin client o supabase browser client directo); (4) tres API routes nuevas (`/api/trabajos`, `/api/referencias`, `/api/archivados/resolver`) + una extensión del endpoint existente `/cashflow/resumen` (estado/margen por obra y cashflow del mes); (5) lógica pura testeada con Vitest (parsers del vault, validación de trabajos, comando inline de la barra, mapeo de destinos de archivados).

**Tech Stack:** Next.js 15.5 (App Router, React 19), Tailwind v4 (tokens via `@theme` en `globals.css`), Supabase (`@supabase/ssr` + `@supabase/supabase-js`, Realtime `postgres_changes`), Framer Motion (a instalar), Vitest (base de Frente A), GitHub Contents API (repo `ravnconstrucciones/boveda`).

---

## Contexto que el ejecutor necesita saber

- **Repo:** `/Users/ezeotero/Documents/ravn` (git, remote `ravnconstrucciones/cotizaciones`). Todos los paths relativos de este plan son relativos a esa raíz.
- **Dev server:** `npm run dev` (script `scripts/dev.sh`, puerto 3000, ya maneja iCloud/watchers). Login: la app entera está detrás de `src/middleware.ts` (Supabase auth) — **incluso `/api/*`**: un `curl` sin cookie devuelve **307 → /login**. La verificación funcional de APIs se hace desde la consola del navegador con sesión iniciada.
- **Patrones del codebase a copiar:** pantallas = `page.tsx` server wrapper + `*-screen.tsx` client component que fetchea con `fetch(..., { cache: "no-store" })` o `createClient()` de `@/lib/supabase/client` (ver `src/app/finanzas/finanzas-screen.tsx`). API routes usan `createSupabaseAdminClient()` de `@/lib/supabase/server` (service_role, permitido server-side según el contrato).
- **Tablas (contrato Frente A, migraciones 2026-06-12+):** `eventos`, `trabajos_cola`, `cotizaciones`, `recetas`, `cotizador_lecciones`, `referencias` + bucket privado `referencias`. RLS: usuario autenticado acceso total. Si al ejecutar este plan esas tablas aún no existen, los módulos muestran su error/estado vacío sin romper la home — se puede avanzar igual y verificar al final.
- **Tablas existentes que se usan:** `tareas` (creada para Tu Día: `texto, categoria, fecha, hora, estado pendiente|hecha, origen whatsapp|web|manual, nota`), `gastos_personales`, `presupuestos`/`obras`/`cashflow_items` (vía endpoint existente `/cashflow/resumen`, que la Task 12 extiende con estado/margen por obra y cashflow del mes), `/api/finanzas` (resumen personal).
- **Colisión conocida:** `/api/cotizaciones` YA existe y es el endpoint de cotización del dólar. Por eso el módulo Cotizaciones lee la tabla `cotizaciones` directo con el cliente Supabase del browser, sin ruta nueva con ese nombre.
- **Vault:** repo GitHub `ravnconstrucciones/boveda`. Carpetas relevantes: `Orientación/` (archivos `YYYY-MM-DD ….md`), `Yo/Patrones.md` (secciones "Patrones que me potencian" / "Patrones que me frenan" con bullets), `FODA/` (4 archivos: `Fortalezas.md`, `Oportunidades.md`, `Debilidades.md`, `Amenazas.md`, cada uno una lista de bullets).
- **Regla obligatoria del stack web de Eze:** invocar skill `ui-ux-pro-max` ANTES de diseñar, referencia de componentes de 21st.dev, y TODA animación con Framer Motion (cero CSS animations puras).

## Estructura de archivos del frente

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260613100000_realtime_centro_mando.sql` | Agregar `cotizaciones` a la publicación Realtime (`eventos` y `trabajos_cola` los publica el Frente A) |
| `src/types/centro-mando.ts` | Tipos del contrato de datos (Evento, TrabajoCola, CotizacionResumen, Referencia, Tarea, CerebroData) |
| `src/lib/vault-parse.ts` + test | Parsers puros del markdown del vault (TDD) |
| `src/lib/vault.ts` | Fetchers GitHub API con `next: { revalidate: 300 }` |
| `src/lib/trabajos-validate.ts` + test | Validación pura del body de POST /api/trabajos (TDD) |
| `src/lib/comando-inline.ts` + test | Parser puro del caso inline de la barra ("anotá …" → tarea directa) (TDD) |
| `src/lib/archivados-destinos.ts` + test | Mapeo puro evento archivado → insert de destino (TDD) |
| `src/app/cashflow/resumen/route.ts` (modificar) | Extensión: `finalizada` + `margen_al_dia_ars` por obra, `caja_mes` y `gastos_obra_hoy_ars` |
| `src/app/api/trabajos/route.ts` | POST (insert trabajos_cola + evento espejo) y GET |
| `src/app/api/referencias/route.ts` | GET referencias + signed URLs del bucket |
| `src/app/api/archivados/resolver/route.ts` | POST resolver evento archivado |
| `src/hooks/use-realtime-table.ts` | Suscripción `postgres_changes` reutilizable |
| `src/components/shell/app-shell.tsx` | Carcasa: sidebar de navegación + badge archivados |
| `src/components/cockpit/panel.tsx` | Card base de módulo (borde, header, scroll interno, motion) |
| `src/components/cockpit/command-bar.tsx` | Módulo 1: barra de comando + progreso vivo |
| `src/components/cockpit/modulo-{obras,plata,pendientes,cotizaciones,actividad,archivados,cerebro,adn}.tsx` | Módulos 2-9 |
| `src/components/cockpit/cockpit-home.tsx` | Grid de la home (sin scroll en desktop) |
| `src/app/page.tsx` (modificar) | Server component: `getCerebro()` + `<CockpitHome/>` |
| `src/app/layout.tsx` (modificar) | Envolver children con `<AppShell>` |
| `src/app/globals.css` (modificar) | Tokens `--cdm-*` |
| `src/app/raleway-local.ts` (modificar) | Peso 900 |
| `src/app/adn/page.tsx` + `adn-screen.tsx` | Vista ADN completa |
| `src/app/actividad/page.tsx` + `actividad-screen.tsx` | Feed Actividad completo |
| `src/app/archivados/page.tsx` + `archivados-screen.tsx` | UI resolver archivados |

---

### Task 1: Preparación del frente (rama, skill de diseño, Framer Motion, Raleway 900)

**Files:**
- Modify: `src/app/raleway-local.ts`
- Create: `src/fonts/raleway/raleway-latin-900-normal.woff2`, `src/fonts/raleway/raleway-latin-ext-900-normal.woff2`

- [ ] **Step 1: Crear la rama de trabajo**

```bash
cd /Users/ezeotero/Documents/ravn
git checkout -b frente-b-carcasa-home
```

Expected: `Switched to a new branch 'frente-b-carcasa-home'`

- [ ] **Step 2: Invocar el skill `ui-ux-pro-max` (obligatorio, regla global de Eze)**

Invocar con la tool Skill: `skill: "ui-ux-pro-max"` con args:

```
Diseñar home cockpit "Centro de Mando" estilo Jarvis para app interna Next.js 15 + Tailwind v4.
Identidad fija no negociable: negro #0a0a0a, off-white #f0ede6, taupe #c8b49a, Raleway, CERO border-radius,
espaciado generoso, dark cockpit con datos en vivo. Layout: sidebar de navegación + grid de 9 módulos sin
scroll en desktop (Mac-first), barra de comando protagonista arriba. Animaciones: Framer Motion.
Pedir: guidelines de densidad/jerarquía/estados para dashboard dark premium + revisión de accesibilidad de contraste.
```

Usar las guidelines que devuelva para ajustar detalles (jerarquía tipográfica, estados hover/focus, contraste) sobre el código de las tareas 10-17, **sin** cambiar paleta, tipografía ni el contrato de datos.

- [ ] **Step 3: Tomar referencia de 21st.dev (obligatorio, regla global)**

Buscar en `https://21st.dev/community/components` componentes de referencia: "command" (barras estilo spotlight/command-palette) y "hero" (para el encabezado de la home). Tomar de referencia el patrón visual (input protagonista full-width, chips de acción, lista de resultados debajo) — NO copiar código con dependencias nuevas: la implementación es la de las tareas 10-11 con Tailwind + Framer Motion.

- [ ] **Step 4: Instalar Framer Motion**

```bash
cd /Users/ezeotero/Documents/ravn && npm install framer-motion
```

Expected: `added N packages` y `framer-motion` aparece en `dependencies` de `package.json` (v12.x, compatible React 19).

- [ ] **Step 5: Descargar Raleway 900 (el spec pide pesos 300/400/700/900; localmente hay 200-700)**

```bash
cd /Users/ezeotero/Documents/ravn
curl -fL -o src/fonts/raleway/raleway-latin-900-normal.woff2 https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-900-normal.woff2
curl -fL -o src/fonts/raleway/raleway-latin-ext-900-normal.woff2 https://cdn.jsdelivr.net/fontsource/fonts/raleway@latest/latin-ext-900-normal.woff2
ls -la src/fonts/raleway/ | grep 900
```

Expected: dos archivos `.woff2` nuevos con tamaño > 10 KB. Si el CDN falla, seguir sin el peso 900 (el diseño funciona con 700) y anotarlo al cierre.

- [ ] **Step 6: Registrar el peso 900 en `src/app/raleway-local.ts`**

Agregar al final del array `src` (después de la entrada `raleway-latin-700-normal.woff2`, antes del `]`):

```ts
    {
      path: "../fonts/raleway/raleway-latin-ext-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
    {
      path: "../fonts/raleway/raleway-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
```

(Si el Step 5 falló, saltear este step.)

- [ ] **Step 7: Verificar que compila**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
```

Expected: sin errores (exit 0).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/fonts/raleway src/app/raleway-local.ts
git commit -m "feat(frente-b): framer-motion + Raleway 900 para el cockpit"
```

---

### Task 2: Tokens del cockpit y tipos compartidos del contrato

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/types/centro-mando.ts`

**Decisión de diseño (no cambiar):** los tokens viejos `--ravn-*` NO se tocan — `propuesta-screen.tsx` (el PDF que se imprime para clientes) los usa 22 veces y cambiarlos alteraría documentos emitidos. El cockpit usa tokens nuevos `--cdm-*`, siempre oscuros (el Jarvis no tiene modo claro). Las pantallas viejas conservan su fondo `#181817` adentro de la carcasa `#0a0a0a` hasta su rediseño por tandas (decisión del spec §2).

- [ ] **Step 1: Agregar los tokens `--cdm-*` en `src/app/globals.css`**

Después del bloque `html.light { ... }` (línea ~26) y ANTES de `@theme {`, insertar:

```css
/* ── Centro de Mando (cockpit Jarvis) — paleta fija, siempre oscura ── */
:root {
  --cdm-bg: #0a0a0a;
  --cdm-panel: #101010;
  --cdm-fg: #f0ede6;
  --cdm-muted: rgba(240, 237, 230, 0.45);
  --cdm-line: rgba(240, 237, 230, 0.14);
  --cdm-taupe: #c8b49a;
}
```

Y adentro del bloque `@theme { ... }` existente, después de `--color-ravn-subtle: var(--ravn-subtle);`, agregar:

```css
  --color-cdm-bg: var(--cdm-bg);
  --color-cdm-panel: var(--cdm-panel);
  --color-cdm-fg: var(--cdm-fg);
  --color-cdm-muted: var(--cdm-muted);
  --color-cdm-line: var(--cdm-line);
  --color-cdm-taupe: var(--cdm-taupe);
```

Esto habilita las utilidades Tailwind `bg-cdm-bg`, `text-cdm-fg`, `border-cdm-line`, `text-cdm-taupe`, `bg-cdm-panel`, `text-cdm-muted` usadas en todo el frente.

- [ ] **Step 2: Crear `src/types/centro-mando.ts` (espejo exacto del contrato de datos)**

```ts
/**
 * Tipos del Centro de Mando — espejo EXACTO del contrato de datos
 * (migraciones de Frente A). No renombrar campos ni estados.
 */

export const TIPOS_TRABAJO = ["cotizar", "redactar", "consulta", "orden"] as const;
export type TipoTrabajo = (typeof TIPOS_TRABAJO)[number];

export type EstadoTrabajo =
  | "pendiente"
  | "esperando_datos"
  | "procesando"
  | "en_revision"
  | "completado"
  | "error"
  | "cancelado";

export type TrabajoCola = {
  id: string;
  creado_at: string;
  actualizado_at: string;
  tipo: TipoTrabajo;
  origen: "whatsapp" | "tablero";
  estado: EstadoTrabajo;
  prompt: string;
  contexto: Record<string, unknown>;
  resultado: Record<string, unknown> | null;
  error: string | null;
};

export type OrigenEvento = "whatsapp" | "tablero" | "daemon" | "bot" | "sistema";
export type EstadoEvento = "procesado" | "pendiente_pregunta" | "archivado" | "resuelto";

export type Evento = {
  id: string;
  creado_at: string;
  origen: OrigenEvento;
  tipo: string;
  estado: EstadoEvento;
  titulo: string;
  contenido: Record<string, unknown>;
  destino_tabla: string | null;
  destino_id: string | null;
  /** Dedupe de webhooks de WhatsApp (lo escribe el bot, Frente C). Null para el resto. */
  wa_message_id: string | null;
};

export type EstadoCotizacion =
  | "borrador"
  | "en_revision"
  | "aprobada"
  | "rechazada"
  | "documento_emitido";

/** Subset de columnas de `cotizaciones` que lista el módulo de la home. */
export type CotizacionResumen = {
  id: string;
  creado_at: string;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  total_min: number | null;
  total_max: number | null;
};

export type Referencia = {
  id: string;
  creado_at: string;
  tipo: "filosofia" | "estetica";
  texto: string | null;
  etiquetas: string[];
  fuente: string | null;
  imagen_path: string | null;
  /** Generada server-side por /api/referencias (no existe en la tabla). */
  imagen_url?: string | null;
};

/** Tabla `tareas` existente (Tu Día) — fuente única de pendientes. */
export type Tarea = {
  id: string;
  texto: string;
  categoria: string;
  fecha: string | null;
  hora: string | null;
  estado: "pendiente" | "hecha";
  origen: string;
  nota: string | null;
  creado_at: string;
};

/** Lectura del vault para el módulo "El cerebro" (lib server-side src/lib/vault.ts). */
export type CerebroData = {
  orientacion: { titulo: string; siguientePaso: string | null } | null;
  patrones: { potencian: string[]; frenan: string[] };
  foda: {
    fortalezas: string[];
    oportunidades: string[];
    debilidades: string[];
    amenazas: string[];
  };
  error: string | null;
};
```

- [ ] **Step 3: Verificar que compila**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/types/centro-mando.ts
git commit -m "feat(frente-b): tokens cdm-* del cockpit + tipos del contrato de datos"
```

---

### Task 3: Migración Realtime (cotizaciones)

**Files:**
- Create: `supabase/migrations/20260613100000_realtime_centro_mando.sql`

La barra de comando (progreso vivo) y el feed Actividad escuchan `trabajos_cola` y `eventos`, pero esas dos tablas **ya quedan en la publicación `supabase_realtime` por las migraciones del Frente A** (sus propias migraciones lo hacen al crearlas) — **no duplicarlas acá**: la frontera es del plan A. Lo único que le falta a este frente es `cotizaciones`, que el módulo Cotizaciones escucha por `postgres_changes`. Frente A crea la tabla (timestamps 2026-06-12); esta migración corre después (2026-06-13) y es idempotente.

- [ ] **Step 1: Crear `supabase/migrations/20260613100000_realtime_centro_mando.sql`**

```sql
-- Centro de Mando (Frente B) — Realtime para el módulo Cotizaciones.
-- eventos y trabajos_cola ya los publica el Frente A al crearlos: NO se tocan acá.
-- Idempotente: solo agrega si la tabla existe y no está ya en la publicación.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'cotizaciones'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cotizaciones'
  ) then
    alter publication supabase_realtime add table public.cotizaciones;
  end if;
end $$;
```

- [ ] **Step 2: Aplicar la migración**

Si el proyecto está linkeado al CLI de Supabase:

```bash
cd /Users/ezeotero/Documents/ravn && supabase db push
```

Expected: `Applying migration 20260613100000_realtime_centro_mando.sql... Finished supabase db push.`

Si el CLI no está linkeado (es lo habitual en este repo): pegar el SQL completo del Step 1 en el SQL Editor del dashboard de Supabase (proyecto de App RAVN) y ejecutarlo. Expected: `Success. No rows returned`.

- [ ] **Step 3: Verificar la publicación**

En el SQL Editor:

```sql
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
```

Expected: la fila `cotizaciones` (y además `eventos` y `trabajos_cola` si el Frente A ya corrió — esas dos son responsabilidad del plan A, no de esta migración). Si Frente A todavía no corrió, la consulta no muestra ninguna de las tres: re-ejecutar el SQL del Step 1 después de las migraciones de Frente A (por eso es idempotente) y anotarlo como pendiente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260613100000_realtime_centro_mando.sql
git commit -m "feat(frente-b): migración realtime para cotizaciones (eventos y trabajos_cola los publica el Frente A)"
```

---

### Task 4: Parsers del vault (TDD)

**Files:**
- Create: `src/lib/vault-parse.ts`
- Test: `src/lib/__tests__/vault-parse.test.ts`

Lógica pura (sin red) que extrae del markdown del vault: el último archivo de Orientación, el "siguiente paso", y bullets de secciones (Patrones, FODA). Frente A deja Vitest configurado; **antes de empezar verificar**:

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest --version
```

Expected: `vitest/3.x.y` (o 2.x). Si falla con "not found", instalar la base mínima (fallback, anotarlo al cierre):

```bash
npm install -D vitest
npm pkg set scripts.test="vitest run"
```

Y crear `vitest.config.ts` en la raíz del repo con el alias `@` → `src` (sin esto, los tests que importan `@/types/centro-mando` — Task 6 — fallan con error de resolución de módulo, no por TDD):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
```

(Si el `vitest.config.ts` del Frente A ya existe, NO pisarlo — este archivo es solo del camino fallback. Si se creó acá, sumarlo al commit del Step 5.)

- [ ] **Step 1: Escribir el test que falla — `src/lib/__tests__/vault-parse.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  extractBullets,
  extractSiguientePaso,
  extractTopBullets,
  pickLatestOrientacion,
  tituloOrientacion,
} from "../vault-parse";

const ORIENTACION_CON_SECCION = `# Orientación — 2026-06-07 (domingo)

## Qué se construyó hoy

Sistema completo andando.

## Siguiente paso

Conectar el bot al Centro de Mando y matar las piezas locales.

## Otra sección

Texto que no corresponde.
`;

const ORIENTACION_SIN_SECCION = `# Orientación — 2026-05-28

> Cita que no es párrafo.

Primer párrafo real: consolidar el cotizador antes de vender más.

## Detalle

Más texto.
`;

const PATRONES_MD = `# Patrones de comportamiento

## Patrones que me potencian

- Consistencia estética en todo lo que toca
- **Builder mentality**: construye sistemas y procesos
- Disciplina física sostenida

## Patrones que me frenan

- Perfeccionismo estético puede paralizar la ejecución
`;

describe("pickLatestOrientacion", () => {
  it("elige el .md con fecha más nueva (orden lexicográfico del prefijo YYYY-MM-DD)", () => {
    const nombres = [
      "2026-05-28 Síntesis — dónde estamos.md",
      "2026-06-07 - Sistema Tu Día completado.md",
      "2026-06-03 - Sistema deployado 24-7.md",
      "notas.txt",
    ];
    expect(pickLatestOrientacion(nombres)).toBe(
      "2026-06-07 - Sistema Tu Día completado.md"
    );
  });

  it("devuelve null si no hay archivos .md", () => {
    expect(pickLatestOrientacion([])).toBeNull();
    expect(pickLatestOrientacion(["foto.png"])).toBeNull();
  });
});

describe("tituloOrientacion", () => {
  it("saca la extensión .md", () => {
    expect(tituloOrientacion("2026-06-07 - Sistema Tu Día completado.md")).toBe(
      "2026-06-07 - Sistema Tu Día completado"
    );
  });
});

describe("extractSiguientePaso", () => {
  it("devuelve el cuerpo de la sección cuyo heading contiene 'siguiente paso'", () => {
    expect(extractSiguientePaso(ORIENTACION_CON_SECCION)).toBe(
      "Conectar el bot al Centro de Mando y matar las piezas locales."
    );
  });

  it("matchea 'Próximos pasos' con acento y plural", () => {
    const md = "# T\n\n## Próximos pasos\n\nHacer A y B.\n";
    expect(extractSiguientePaso(md)).toBe("Hacer A y B.");
  });

  it("fallback: primer párrafo después del H1 (saltea citas y headings)", () => {
    expect(extractSiguientePaso(ORIENTACION_SIN_SECCION)).toBe(
      "Primer párrafo real: consolidar el cotizador antes de vender más."
    );
  });

  it("devuelve null si no hay nada extraíble", () => {
    expect(extractSiguientePaso("# Solo título\n")).toBeNull();
  });
});

describe("extractBullets", () => {
  it("extrae los bullets de la sección pedida (insensible a acentos/mayúsculas) y limpia ** **", () => {
    expect(extractBullets(PATRONES_MD, "potencian", 5)).toEqual([
      "Consistencia estética en todo lo que toca",
      "Builder mentality: construye sistemas y procesos",
      "Disciplina física sostenida",
    ]);
  });

  it("respeta el máximo y corta en el próximo heading", () => {
    expect(extractBullets(PATRONES_MD, "potencian", 2)).toHaveLength(2);
    expect(extractBullets(PATRONES_MD, "frenan", 5)).toEqual([
      "Perfeccionismo estético puede paralizar la ejecución",
    ]);
  });

  it("devuelve [] si la sección no existe", () => {
    expect(extractBullets(PATRONES_MD, "inexistente", 5)).toEqual([]);
  });
});

describe("extractTopBullets", () => {
  it("toma los primeros bullets de un archivo que es una lista (FODA)", () => {
    const md = "# Fortalezas\n\n- Marca premium\n- Gestión y números\n- Tecnología propia\n- Otra más\n";
    expect(extractTopBullets(md, 3)).toEqual([
      "Marca premium",
      "Gestión y números",
      "Tecnología propia",
    ]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/vault-parse.test.ts
```

Expected: FAIL con `Cannot find module '../vault-parse'` (o equivalente).

- [ ] **Step 3: Implementar `src/lib/vault-parse.ts`**

```ts
/**
 * Parsers PUROS del markdown del vault (repo boveda). Sin red, sin env:
 * todo lo testeable del módulo "El cerebro" vive acá (Vitest).
 */

function sinAcentos(s: string): string {
  // Rango de marcas combinantes U+0300-U+036F escrito con escapes unicode:
  // con caracteres literales (invisibles) un copy/paste entre editores lo rompe.
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Último archivo de Orientación: los nombres "YYYY-MM-DD …" ordenan lexicográficamente. */
export function pickLatestOrientacion(nombres: string[]): string | null {
  const md = nombres.filter((n) => n.toLowerCase().endsWith(".md")).sort();
  return md.length > 0 ? md[md.length - 1] : null;
}

export function tituloOrientacion(nombreArchivo: string): string {
  return nombreArchivo.replace(/\.md$/i, "");
}

/**
 * "Siguiente paso" de una Orientación:
 * 1) cuerpo de la sección cuyo heading contiene "siguiente/próximo paso";
 * 2) fallback: primer párrafo después del H1 (saltea citas, headings y hr).
 */
export function extractSiguientePaso(md: string): string | null {
  const lineas = md.split("\n");
  let captura: string[] | null = null;
  for (const linea of lineas) {
    const h = linea.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      if (captura) break;
      if (/(siguiente|proximo)s?\s+pasos?/.test(sinAcentos(h[1]))) captura = [];
      continue;
    }
    if (captura) captura.push(linea);
  }
  if (captura) {
    const texto = captura.join("\n").trim();
    if (texto) return texto;
  }
  // Fallback: primer párrafo después del H1.
  const sinH1 = md.replace(/^#\s+.*$/m, "");
  for (const bloque of sinH1.split(/\n\s*\n/)) {
    const t = bloque.trim();
    if (t && !t.startsWith("#") && !t.startsWith(">") && !t.startsWith("---")) {
      return t;
    }
  }
  return null;
}

/** Bullets de la sección cuyo heading contiene sectionTitle, hasta el próximo heading. */
export function extractBullets(md: string, sectionTitle: string, max = 5): string[] {
  const objetivo = sinAcentos(sectionTitle);
  const out: string[] = [];
  let dentro = false;
  for (const linea of md.split("\n")) {
    const h = linea.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      if (dentro) break;
      dentro = sinAcentos(h[1]).includes(objetivo);
      continue;
    }
    if (dentro) {
      const b = linea.match(/^\s*[-*]\s+(.*)$/);
      if (b) out.push(b[1].replace(/\*\*/g, "").trim());
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Primeros bullets de un archivo completo (los FODA son listas planas). */
export function extractTopBullets(md: string, max = 3): string[] {
  const out: string[] = [];
  for (const linea of md.split("\n")) {
    const b = linea.match(/^\s*[-*]\s+(.*)$/);
    if (b) {
      out.push(b[1].replace(/\*\*/g, "").trim());
      if (out.length >= max) break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/vault-parse.test.ts
```

Expected: `Test Files  1 passed` — 11 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault-parse.ts src/lib/__tests__/vault-parse.test.ts
git commit -m "feat(frente-b): parsers puros del vault (orientación, patrones, FODA) con tests"
```

---

### Task 5: Lectura del vault vía GitHub API (lib server-side, caché 5 min)

**Files:**
- Create: `src/lib/vault.ts`
- Modify: `.env.local` (a mano, no se commitea)

- [ ] **Step 1: Configurar el token de GitHub**

El repo del vault es `ravnconstrucciones/boveda` (privado). Hace falta `GITHUB_TOKEN` con permiso de **lectura de contents** sobre ese repo (se puede reusar el token del bot que ya existe en Railway, o crear un fine-grained PAT nuevo read-only). Agregar a `.env.local` — `VAULT_GITHUB_REPO` es el MISMO nombre de variable que usa el bot del Frente C para el mismo repo (un solo concepto, un solo nombre):

```
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
VAULT_GITHUB_REPO=ravnconstrucciones/boveda
```

Y registrar las mismas dos variables en el proyecto de Vercel (`ravn-app-one`) para producción. Verificar el token:

```bash
cd /Users/ezeotero/Documents/ravn
GITHUB_TOKEN=$(grep '^GITHUB_TOKEN=' .env.local | cut -d= -f2-)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/ravnconstrucciones/boveda/contents/Orientaci%C3%B3n"
```

Expected: `200`. Si da `404`, el token no tiene acceso al repo — frenar y avisar a Eze antes de seguir.

- [ ] **Step 2: Implementar `src/lib/vault.ts`**

```ts
import type { CerebroData } from "@/types/centro-mando";
import {
  extractBullets,
  extractSiguientePaso,
  extractTopBullets,
  pickLatestOrientacion,
  tituloOrientacion,
} from "@/lib/vault-parse";

/**
 * Lectura SERVER-SIDE del vault (repo GitHub "boveda") con caché de Next
 * (`next: { revalidate: 300 }` = ~5 min, decisión del spec §3).
 * No importar desde componentes client — solo server components / API routes.
 */

const REVALIDATE_S = 300;

function vaultRepo(): string {
  // Mismo nombre de env var que el bot (Frente C): VAULT_GITHUB_REPO.
  return process.env.VAULT_GITHUB_REPO ?? "ravnconstrucciones/boveda";
}

function ghUrl(path: string): string {
  const safe = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${vaultRepo()}/contents/${safe}`;
}

function ghHeaders(raw: boolean): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

type GhEntry = { name: string; type: string };

/** Nombres de archivo de una carpeta del vault. [] si no existe o falla. */
export async function listVaultDir(path: string): Promise<string[]> {
  const res = await fetch(ghUrl(path), {
    headers: ghHeaders(false),
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as GhEntry[];
  if (!Array.isArray(data)) return [];
  return data.filter((e) => e.type === "file").map((e) => e.name);
}

/** Contenido crudo de un archivo del vault, o null si no existe o falla. */
export async function readVaultFile(path: string): Promise<string | null> {
  const res = await fetch(ghUrl(path), {
    headers: ghHeaders(true),
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) return null;
  return res.text();
}

const CEREBRO_VACIO: Omit<CerebroData, "error"> = {
  orientacion: null,
  patrones: { potencian: [], frenan: [] },
  foda: { fortalezas: [], oportunidades: [], debilidades: [], amenazas: [] },
};

/** Todo lo que el módulo "El cerebro" muestra: última Orientación + Patrones + FODA. */
export async function getCerebro(): Promise<CerebroData> {
  if (!process.env.GITHUB_TOKEN) {
    return {
      ...CEREBRO_VACIO,
      error: "Falta GITHUB_TOKEN: el cerebro no puede leer el vault.",
    };
  }
  try {
    const [nombres, patronesMd, f, o, d, a] = await Promise.all([
      listVaultDir("Orientación"),
      readVaultFile("Yo/Patrones.md"),
      readVaultFile("FODA/Fortalezas.md"),
      readVaultFile("FODA/Oportunidades.md"),
      readVaultFile("FODA/Debilidades.md"),
      readVaultFile("FODA/Amenazas.md"),
    ]);

    const ultimo = pickLatestOrientacion(nombres);
    const orientacionMd = ultimo
      ? await readVaultFile(`Orientación/${ultimo}`)
      : null;

    return {
      orientacion: ultimo
        ? {
            titulo: tituloOrientacion(ultimo),
            siguientePaso: orientacionMd ? extractSiguientePaso(orientacionMd) : null,
          }
        : null,
      patrones: {
        potencian: patronesMd ? extractBullets(patronesMd, "potencian", 4) : [],
        frenan: patronesMd ? extractBullets(patronesMd, "frenan", 4) : [],
      },
      foda: {
        fortalezas: f ? extractTopBullets(f) : [],
        oportunidades: o ? extractTopBullets(o) : [],
        debilidades: d ? extractTopBullets(d) : [],
        amenazas: a ? extractTopBullets(a) : [],
      },
      error: null,
    };
  } catch (e) {
    return {
      ...CEREBRO_VACIO,
      error: e instanceof Error ? e.message : "Error leyendo el vault",
    };
  }
}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
```

Expected: exit 0. (La verificación funcional end-to-end es visual en Task 15, cuando el módulo Cerebro renderice los datos.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/vault.ts
git commit -m "feat(frente-b): lib vault.ts — lectura del repo boveda vía GitHub API con revalidate 300s"
```

---

### Task 6: Validación de trabajos (TDD) + ruta `/api/trabajos`

**Files:**
- Create: `src/lib/trabajos-validate.ts`
- Create: `src/app/api/trabajos/route.ts`
- Test: `src/lib/__tests__/trabajos-validate.test.ts`

- [ ] **Step 1: Escribir el test que falla — `src/lib/__tests__/trabajos-validate.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { tituloTrabajo, validarNuevoTrabajo } from "../trabajos-validate";

describe("validarNuevoTrabajo", () => {
  it("acepta un trabajo válido y normaliza contexto a {}", () => {
    const r = validarNuevoTrabajo({ tipo: "cotizar", prompt: "  baño completo en Pilar " });
    expect(r).toEqual({
      ok: true,
      data: { tipo: "cotizar", prompt: "baño completo en Pilar", contexto: {} },
    });
  });

  it("acepta contexto objeto y rechaza contexto array", () => {
    const ok = validarNuevoTrabajo({ tipo: "orden", prompt: "x", contexto: { obra: "Saavedra" } });
    expect(ok.ok && ok.data.contexto).toEqual({ obra: "Saavedra" });
    const arr = validarNuevoTrabajo({ tipo: "orden", prompt: "x", contexto: [1] });
    expect(arr.ok && arr.data.contexto).toEqual({});
  });

  it("rechaza tipo inválido", () => {
    const r = validarNuevoTrabajo({ tipo: "magia", prompt: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("tipo inválido");
  });

  it("rechaza prompt vacío o no-string y body inválido", () => {
    expect(validarNuevoTrabajo({ tipo: "orden", prompt: "   " }).ok).toBe(false);
    expect(validarNuevoTrabajo({ tipo: "orden" }).ok).toBe(false);
    expect(validarNuevoTrabajo(null).ok).toBe(false);
    expect(validarNuevoTrabajo("hola").ok).toBe(false);
  });

  it("rechaza prompt de más de 4000 caracteres", () => {
    expect(validarNuevoTrabajo({ tipo: "orden", prompt: "a".repeat(4001) }).ok).toBe(false);
  });
});

describe("tituloTrabajo", () => {
  it("arma '[tipo] prompt' y trunca a 80 con elipsis", () => {
    expect(tituloTrabajo("cotizar", "baño completo")).toBe("[cotizar] baño completo");
    const largo = tituloTrabajo("orden", "x".repeat(100));
    expect(largo).toBe(`[orden] ${"x".repeat(77)}…`);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/trabajos-validate.test.ts
```

Expected: FAIL con `Cannot find module '../trabajos-validate'`.

- [ ] **Step 3: Implementar `src/lib/trabajos-validate.ts`**

```ts
import { TIPOS_TRABAJO, type TipoTrabajo } from "@/types/centro-mando";

export type NuevoTrabajo = {
  tipo: TipoTrabajo;
  prompt: string;
  contexto: Record<string, unknown>;
};

const PROMPT_MAX = 4000;

/** Validación pura del body de POST /api/trabajos (testeada con Vitest). */
export function validarNuevoTrabajo(
  body: unknown
): { ok: true; data: NuevoTrabajo } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body inválido: se espera un objeto JSON." };
  }
  const b = body as Record<string, unknown>;

  const tipo = typeof b.tipo === "string" ? b.tipo : "";
  if (!(TIPOS_TRABAJO as readonly string[]).includes(tipo)) {
    return {
      ok: false,
      error: `tipo inválido: debe ser uno de ${TIPOS_TRABAJO.join(", ")}.`,
    };
  }

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return { ok: false, error: "prompt requerido." };
  if (prompt.length > PROMPT_MAX) {
    return { ok: false, error: `prompt demasiado largo (máx. ${PROMPT_MAX}).` };
  }

  const contexto =
    b.contexto && typeof b.contexto === "object" && !Array.isArray(b.contexto)
      ? (b.contexto as Record<string, unknown>)
      : {};

  return { ok: true, data: { tipo: tipo as TipoTrabajo, prompt, contexto } };
}

/** Título corto del evento espejo que la barra de comando deja en `eventos`. */
export function tituloTrabajo(tipo: TipoTrabajo, prompt: string): string {
  const corto = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  return `[${tipo}] ${corto}`;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/trabajos-validate.test.ts
```

Expected: `Test Files  1 passed` — 6 tests passed.

- [ ] **Step 5: Implementar `src/app/api/trabajos/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { tituloTrabajo, validarNuevoTrabajo } from "@/lib/trabajos-validate";

/**
 * Barra de comando del tablero → cola de trabajos.
 * POST: inserta en `trabajos_cola` (origen 'tablero', estado default 'pendiente')
 *       + evento espejo en `eventos` para el feed Actividad.
 * GET: últimos 10 trabajos (la UI vive escucha cambios por Realtime).
 * Auth: el middleware global ya exige sesión para /api/*.
 */

export async function POST(req: NextRequest) {
  const v = validarNuevoTrabajo(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: trabajo, error } = await sb
    .from("trabajos_cola")
    .insert({
      tipo: v.data.tipo,
      origen: "tablero",
      prompt: v.data.prompt,
      contexto: v.data.contexto,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: evError } = await sb.from("eventos").insert({
    origen: "tablero",
    tipo: "trabajo_creado",
    estado: "procesado",
    titulo: tituloTrabajo(v.data.tipo, v.data.prompt),
    contenido: { trabajo_id: trabajo.id, tipo: v.data.tipo, prompt: v.data.prompt },
    destino_tabla: "trabajos_cola",
    destino_id: trabajo.id,
  });
  if (evError) {
    // El trabajo ya quedó en cola: el evento espejo no es razón para fallar el request.
    console.error("[/api/trabajos] insert eventos:", evError.message);
  }

  return NextResponse.json({ trabajo });
}

export async function GET() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("trabajos_cola")
    .select("*")
    .order("creado_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trabajos: data ?? [] });
}
```

- [ ] **Step 6: Verificar la ruta**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit && curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/trabajos
```

(Con `npm run dev` corriendo en otra terminal.) Expected: `307` (middleware redirige sin sesión — la ruta existe y está protegida). Verificación funcional: con la app abierta y logueado en `http://localhost:3000`, en la consola del navegador:

```js
await (await fetch("/api/trabajos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "consulta", prompt: "prueba de cola desde el plan" }) })).json()
```

Expected: `{ trabajo: { id: "…", tipo: "consulta", origen: "tablero", estado: "pendiente", … } }`. (Si Frente A no corrió aún, el error será `relation "public.trabajos_cola" does not exist` — anotar y re-verificar después.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/trabajos-validate.ts src/lib/__tests__/trabajos-validate.test.ts src/app/api/trabajos/route.ts
git commit -m "feat(frente-b): POST/GET /api/trabajos — barra de comando contra trabajos_cola con evento espejo"
```

---

### Task 7: Resolución de archivados (TDD) + ruta `/api/archivados/resolver`

**Files:**
- Create: `src/lib/archivados-destinos.ts`
- Create: `src/app/api/archivados/resolver/route.ts`
- Test: `src/lib/__tests__/archivados-destinos.test.ts`

Resolver un evento `archivado` = asignarle destino con un click (spec §4.7). Destinos implementados (los 6 del frente): **tarea** (tabla `tareas`), **gasto_obra** (tabla `presupuestos_gastos`, pide monto + obra), **gasto_personal** (tabla `gastos_personales`, pide monto), **filosofia** (tabla `referencias`), **referencia_estetica** (tabla `referencias`, conserva `contenido.imagen_path` si el bot adjuntó una captura), **descartar** (solo marca resuelto). El texto fuente es `contenido.texto` (lo escribe el bot, Frente C) con fallback al `titulo`.

- [ ] **Step 1: Escribir el test que falla — `src/lib/__tests__/archivados-destinos.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  imagenDeEvento,
  resolverDestino,
  textoDeEvento,
} from "../archivados-destinos";

const EVENTO = {
  id: "11111111-1111-1111-1111-111111111111",
  titulo: "Mensaje sin clasificar",
  contenido: { texto: "acordate de pasar por lo de Oribe" },
};

const EVENTO_SIN_TEXTO = {
  id: "22222222-2222-2222-2222-222222222222",
  titulo: "Título pelado",
  contenido: {},
};

const EVENTO_CON_IMAGEN = {
  id: "33333333-3333-3333-3333-333333333333",
  titulo: "Foto sin clasificar",
  contenido: { texto: "fachada de hormigón visto", imagen_path: "whatsapp/abc123.jpg" },
};

describe("textoDeEvento", () => {
  it("usa contenido.texto si existe, si no el título", () => {
    expect(textoDeEvento(EVENTO)).toBe("acordate de pasar por lo de Oribe");
    expect(textoDeEvento(EVENTO_SIN_TEXTO)).toBe("Título pelado");
  });
});

describe("imagenDeEvento", () => {
  it("devuelve contenido.imagen_path si existe, si no null", () => {
    expect(imagenDeEvento(EVENTO_CON_IMAGEN)).toBe("whatsapp/abc123.jpg");
    expect(imagenDeEvento(EVENTO)).toBeNull();
  });
});

describe("resolverDestino", () => {
  it("tarea: insert en tareas con origen web", () => {
    const r = resolverDestino(EVENTO, "tarea");
    expect(r).toEqual({
      ok: true,
      resolucion: {
        accion: "insert",
        tabla: "tareas",
        payload: {
          texto: "acordate de pasar por lo de Oribe",
          categoria: "Personal",
          origen: "web",
        },
      },
    });
  });

  it("gasto_personal: exige monto > 0", () => {
    expect(resolverDestino(EVENTO, "gasto_personal").ok).toBe(false);
    expect(resolverDestino(EVENTO, "gasto_personal", { monto: 0 }).ok).toBe(false);
    const r = resolverDestino(EVENTO, "gasto_personal", { monto: 12500, categoria: "Combustible" });
    expect(r.ok).toBe(true);
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.tabla).toBe("gastos_personales");
      expect(r.resolucion.payload).toMatchObject({
        concepto: "acordate de pasar por lo de Oribe",
        monto: 12500,
        categoria: "Combustible",
        origen: "app",
      });
      expect(r.resolucion.payload.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("gasto_personal sin categoría usa Varios", () => {
    const r = resolverDestino(EVENTO, "gasto_personal", { monto: 100 });
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.payload.categoria).toBe("Varios");
    } else {
      throw new Error("debería resolver");
    }
  });

  it("gasto_obra: exige monto > 0 y presupuesto_id", () => {
    expect(resolverDestino(EVENTO, "gasto_obra").ok).toBe(false);
    expect(resolverDestino(EVENTO, "gasto_obra", { monto: 100 }).ok).toBe(false);
    expect(resolverDestino(EVENTO, "gasto_obra", { presupuesto_id: "p-1" }).ok).toBe(false);
  });

  it("gasto_obra: insert en presupuestos_gastos", () => {
    const r = resolverDestino(EVENTO, "gasto_obra", { monto: 50000, presupuesto_id: "p-1" });
    expect(r.ok).toBe(true);
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.tabla).toBe("presupuestos_gastos");
      expect(r.resolucion.payload).toMatchObject({
        presupuesto_id: "p-1",
        descripcion: "acordate de pasar por lo de Oribe",
        importe: 50000,
        rubro_id: null,
      });
      expect(r.resolucion.payload.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("filosofia: insert en referencias con evento_id", () => {
    const r = resolverDestino(EVENTO, "filosofia");
    expect(r).toEqual({
      ok: true,
      resolucion: {
        accion: "insert",
        tabla: "referencias",
        payload: {
          tipo: "filosofia",
          texto: "acordate de pasar por lo de Oribe",
          etiquetas: [],
          fuente: "archivados",
          evento_id: EVENTO.id,
        },
      },
    });
  });

  it("referencia_estetica: insert en referencias con etiquetas e imagen del evento", () => {
    const r = resolverDestino(EVENTO_CON_IMAGEN, "referencia_estetica", {
      etiquetas: ["tipografia", "material"],
    });
    expect(r).toEqual({
      ok: true,
      resolucion: {
        accion: "insert",
        tabla: "referencias",
        payload: {
          tipo: "estetica",
          texto: "fachada de hormigón visto",
          etiquetas: ["tipografia", "material"],
          fuente: "archivados",
          imagen_path: "whatsapp/abc123.jpg",
          evento_id: EVENTO_CON_IMAGEN.id,
        },
      },
    });
  });

  it("referencia_estetica sin etiquetas usa []", () => {
    const r = resolverDestino(EVENTO, "referencia_estetica");
    if (r.ok && r.resolucion.accion === "insert") {
      expect(r.resolucion.payload.etiquetas).toEqual([]);
      expect(r.resolucion.payload.imagen_path).toBeNull();
    } else {
      throw new Error("debería resolver");
    }
  });

  it("descartar: sin insert", () => {
    expect(resolverDestino(EVENTO, "descartar")).toEqual({
      ok: true,
      resolucion: { accion: "descartar" },
    });
  });

  it("destino inválido: error", () => {
    // @ts-expect-error — caso de runtime con destino fuera del union
    expect(resolverDestino(EVENTO, "otro").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/archivados-destinos.test.ts
```

Expected: FAIL con `Cannot find module '../archivados-destinos'`.

- [ ] **Step 3: Implementar `src/lib/archivados-destinos.ts`**

```ts
/**
 * Mapeo PURO evento archivado → acción de resolución (testeado con Vitest).
 * La ruta /api/archivados/resolver ejecuta la resolución contra Supabase.
 */

export const DESTINOS_ARCHIVADO = [
  "tarea",
  "gasto_obra",
  "gasto_personal",
  "filosofia",
  "referencia_estetica",
  "descartar",
] as const;
export type DestinoArchivado = (typeof DESTINOS_ARCHIVADO)[number];

export type EventoArchivado = {
  id: string;
  titulo: string;
  contenido: Record<string, unknown>;
};

export type OpcionesResolver = {
  monto?: number;
  categoria?: string;
  presupuesto_id?: string;
  etiquetas?: string[];
};

export type ResolucionArchivado =
  | {
      accion: "insert";
      tabla: "tareas" | "gastos_personales" | "presupuestos_gastos" | "referencias";
      payload: Record<string, unknown>;
    }
  | { accion: "descartar" };

/** Texto fuente del evento: `contenido.texto` (lo escribe el bot) o el título. */
export function textoDeEvento(e: EventoArchivado): string {
  const t = e.contenido?.texto;
  return typeof t === "string" && t.trim() ? t.trim() : e.titulo;
}

/** Imagen adjunta del evento (la sube el bot al bucket `referencias`), o null. */
export function imagenDeEvento(e: EventoArchivado): string | null {
  const p = e.contenido?.imagen_path;
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

export function resolverDestino(
  evento: EventoArchivado,
  destino: DestinoArchivado,
  opciones: OpcionesResolver = {}
): { ok: true; resolucion: ResolucionArchivado } | { ok: false; error: string } {
  const texto = textoDeEvento(evento);
  switch (destino) {
    case "tarea":
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "tareas",
          payload: { texto, categoria: "Personal", origen: "web" },
        },
      };
    case "gasto_obra": {
      const monto = Number(opciones.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return { ok: false, error: "monto requerido (> 0) para gasto de obra." };
      }
      if (!opciones.presupuesto_id) {
        return { ok: false, error: "presupuesto_id requerido para gasto de obra." };
      }
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "presupuestos_gastos",
          payload: {
            presupuesto_id: opciones.presupuesto_id,
            fecha: new Date().toISOString().slice(0, 10),
            descripcion: texto,
            importe: monto,
            rubro_id: null,
          },
        },
      };
    }
    case "gasto_personal": {
      const monto = Number(opciones.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return { ok: false, error: "monto requerido (> 0) para gasto personal." };
      }
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "gastos_personales",
          payload: {
            concepto: texto,
            monto,
            categoria: opciones.categoria || "Varios",
            fecha: new Date().toISOString().slice(0, 10),
            origen: "app",
          },
        },
      };
    }
    case "referencia_estetica":
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "referencias",
          payload: {
            tipo: "estetica",
            texto,
            etiquetas: opciones.etiquetas ?? [],
            fuente: "archivados",
            imagen_path: imagenDeEvento(evento),
            evento_id: evento.id,
          },
        },
      };
    case "filosofia":
      return {
        ok: true,
        resolucion: {
          accion: "insert",
          tabla: "referencias",
          payload: {
            tipo: "filosofia",
            texto,
            etiquetas: [],
            fuente: "archivados",
            evento_id: evento.id,
          },
        },
      };
    case "descartar":
      return { ok: true, resolucion: { accion: "descartar" } };
    default:
      return { ok: false, error: `destino inválido: ${String(destino)}.` };
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/archivados-destinos.test.ts
```

Expected: `Test Files  1 passed` — 12 tests passed.

- [ ] **Step 5: Implementar `src/app/api/archivados/resolver/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  resolverDestino,
  type DestinoArchivado,
} from "@/lib/archivados-destinos";

/**
 * Resolver un evento archivado: ejecuta el insert de destino (si corresponde)
 * y marca el evento como 'resuelto' con destino_tabla/destino_id.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventoId = typeof body?.evento_id === "string" ? body.evento_id : "";
  if (!eventoId) {
    return NextResponse.json({ error: "evento_id requerido." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: evento, error: evErr } = await sb
    .from("eventos")
    .select("id, titulo, contenido, estado")
    .eq("id", eventoId)
    .single();
  if (evErr || !evento) {
    return NextResponse.json({ error: "evento no encontrado." }, { status: 404 });
  }
  if (evento.estado !== "archivado") {
    return NextResponse.json(
      { error: `el evento no está archivado (estado: ${evento.estado}).` },
      { status: 409 }
    );
  }

  const r = resolverDestino(
    { id: evento.id, titulo: evento.titulo, contenido: evento.contenido ?? {} },
    body?.destino as DestinoArchivado,
    {
      monto: typeof body?.monto === "number" ? body.monto : Number(body?.monto),
      categoria: typeof body?.categoria === "string" ? body.categoria : undefined,
      presupuesto_id:
        typeof body?.presupuesto_id === "string" ? body.presupuesto_id : undefined,
      etiquetas: Array.isArray(body?.etiquetas)
        ? (body.etiquetas as unknown[]).filter(
            (e): e is string => typeof e === "string"
          )
        : undefined,
    }
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  let destinoTabla: string | null = null;
  let destinoId: string | null = null;

  if (r.resolucion.accion === "insert") {
    const { data: fila, error: insErr } = await sb
      .from(r.resolucion.tabla)
      .insert(r.resolucion.payload)
      .select("id")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    destinoTabla = r.resolucion.tabla;
    destinoId = fila.id;
  }

  const { error: updErr } = await sb
    .from("eventos")
    .update({ estado: "resuelto", destino_tabla: destinoTabla, destino_id: destinoId })
    .eq("id", eventoId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, destino_tabla: destinoTabla, destino_id: destinoId });
}
```

- [ ] **Step 6: Verificar tipos y protección**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit && curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/archivados/resolver
```

Expected: exit 0 y `307`. (Verificación funcional con datos en Task 17, con la UI de Archivados.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/archivados-destinos.ts src/lib/__tests__/archivados-destinos.test.ts src/app/api/archivados/resolver/route.ts
git commit -m "feat(frente-b): resolución de archivados — 6 destinos (tarea/gasto obra/gasto personal/filosofía/ref. estética/descartar) con tests"
```

---

### Task 8: Ruta `/api/referencias` con signed URLs del bucket

**Files:**
- Create: `src/app/api/referencias/route.ts`

El bucket `referencias` es **privado** (contrato): las imágenes del moodboard se sirven por signed URL generada server-side con el admin client. Una sola ruta GET alimenta el módulo ADN de la home y la vista `/adn`.

- [ ] **Step 1: Implementar `src/app/api/referencias/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/referencias?tipo=filosofia|estetica&limit=N
 * Lista la tabla `referencias` (desc por creado_at) y firma las imágenes del
 * bucket privado `referencias` (signed URLs, 1 h). Si una firma falla, la fila
 * sale con imagen_url: null y la UI muestra placeholder — nunca rompe.
 */

const BUCKET = "referencias";
const EXPIRA_S = 3600;

export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();

  const tipo = req.nextUrl.searchParams.get("tipo");
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;

  let q = sb
    .from("referencias")
    .select("*")
    .order("creado_at", { ascending: false })
    .limit(limit);
  if (tipo === "filosofia" || tipo === "estetica") q = q.eq("tipo", tipo);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = data ?? [];
  const paths = filas
    .map((r) => r.imagen_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  const urlPorPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRA_S);
    if (signErr) {
      console.error("[/api/referencias] signed urls:", signErr.message);
    } else if (firmadas) {
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
      }
    }
  }

  const referencias = filas.map((r) => ({
    ...r,
    imagen_url: r.imagen_path ? urlPorPath.get(r.imagen_path) ?? null : null,
  }));

  return NextResponse.json({ referencias });
}
```

- [ ] **Step 2: Sembrar datos de prueba (SQL Editor de Supabase)**

```sql
insert into referencias (tipo, texto, etiquetas, fuente) values
  ('filosofia', 'La calidad no es un acto, es un hábito.', '{}', 'Aristóteles'),
  ('estetica', 'Tipografía serif grabada en hormigón', '{tipografia,material}', null);
```

Expected: `Success`. (La fila estética queda sin `imagen_path` a propósito: prueba el camino placeholder. Si querés probar la imagen real: subir un JPG al bucket `referencias` desde el dashboard de Storage y `update referencias set imagen_path = '<path-subido>' where tipo = 'estetica';`.)

- [ ] **Step 3: Verificar la ruta**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/referencias
```

Expected: exit 0 y `307`. Funcional, en consola del navegador logueado:

```js
await (await fetch("/api/referencias?limit=10")).json()
```

Expected: `{ referencias: [ { tipo: "estetica", imagen_url: null, … }, { tipo: "filosofia", texto: "La calidad…", … } ] }`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/referencias/route.ts
git commit -m "feat(frente-b): GET /api/referencias con signed URLs del bucket privado"
```

---

### Task 9: Hook Realtime + Panel base del cockpit

**Files:**
- Create: `src/hooks/use-realtime-table.ts`
- Create: `src/components/cockpit/panel.tsx`

**Decisión de diseño (no cambiar): topic ÚNICO por instancia del hook.** El cliente Supabase del browser es un singleton (`src/lib/supabase/client.ts`) y en realtime-js `supabase.channel(topic)` DEVUELVE la misma instancia si el topic ya existe; `subscribe()` sobre un canal ya unido es no-op silencioso y los bindings `postgres_changes` agregados después del join nunca reciben eventos. Con un topic compartido (p.ej. `cdm-eventos`), en la home conviven AppShell + ModuloActividad + ModuloArchivados sobre la misma tabla: solo el primero recibiría eventos, y el `removeChannel` de cualquiera (desmontar la home, cambiar el filtro de `/actividad`) mataría el canal de los demás (badge de Archivados muerto). Por eso cada corrida del efecto crea SU canal con sufijo `crypto.randomUUID()`. Ningún consumidor depende del nombre del topic (todos pasan solo `table` + callback) — mantenerlo así.

- [ ] **Step 1: Crear `src/hooks/use-realtime-table.ts`**

```ts
"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Refresca datos ante cualquier cambio (insert/update/delete) de una tabla
 * pública vía Supabase Realtime. Requiere la tabla en la publicación
 * supabase_realtime (eventos/trabajos_cola: las publica el Frente A;
 * cotizaciones: migración 20260613100000) y RLS que deje SELECT al
 * usuario autenticado.
 *
 * TOPIC ÚNICO POR INSTANCIA (no "optimizar" a un topic compartido): el
 * cliente browser es singleton y channel(topic) devuelve el MISMO canal si
 * el topic ya existe; subscribe() sobre un canal ya unido es no-op y los
 * bindings agregados después no disparan. Con topic compartido, el segundo
 * consumidor de la misma tabla queda sordo y el removeChannel de cualquiera
 * desuscribe a todos. El sufijo aleatorio por corrida del efecto evita ambas
 * cosas (y hace inocuo el re-subscribe cuando cambia `onChange`, p.ej. el
 * filtro por origen de /actividad).
 *
 * `onChange` DEBE ser estable (useCallback en el caller).
 */
export function useRealtimeTable(table: string, onChange: () => void) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`cdm-${table}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => onChange()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, onChange]);
}
```

- [ ] **Step 2: Crear `src/components/cockpit/panel.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type PanelProps = {
  titulo: string;
  /** Acción del header (link "Ver todo →", badge, etc.). */
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Carcasa de módulo del cockpit: borde fino, header uppercase taupe,
 * cuerpo con scroll interno (la home no scrollea en desktop; cada módulo sí).
 * Anima como hijo del stagger de cockpit-home (variants hidden/visible).
 */
export function Panel({ titulo, accion, children, className }: PanelProps) {
  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
      }}
      className={`flex min-h-0 flex-col border border-cdm-line bg-cdm-panel ${className ?? ""}`}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-cdm-line px-4 py-2.5">
        <h2 className="font-raleway text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-taupe">
          {titulo}
        </h2>
        {accion}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </motion.section>
  );
}
```

- [ ] **Step 3: Verificar tipos**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-realtime-table.ts src/components/cockpit/panel.tsx
git commit -m "feat(frente-b): hook useRealtimeTable + Panel base del cockpit"
```

---

### Task 10: Carcasa AppShell + integración en layout

**Files:**
- Create: `src/components/shell/app-shell.tsx`
- Modify: `src/app/layout.tsx`

La carcasa envuelve TODO menos `/login`, `/propuesta` y `/remito` (los dos PDFs para clientes — no pueden ganar un sidebar) y `/landing` (pública). Esa lista es exactamente la constante `SIN_CARCASA` del código de abajo. En desktop: sidebar fija de 240px con la marca, 3 grupos de navegación y badge vivo de Archivados. En pantallas chicas: barra superior compacta (el móvil real es WhatsApp, spec §10). `print:hidden` como cinturón extra para impresión.

- [ ] **Step 1: Crear `src/components/shell/app-shell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RavnLogo } from "@/components/ravn-logo";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

/** Rutas SIN carcasa (login, vistas de impresión/PDF y landing pública). */
const SIN_CARCASA = ["/login", "/propuesta", "/remito", "/landing"];

type NavItem = { href: string; label: string };

const NAV_COCKPIT: NavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/actividad", label: "Actividad" },
  { href: "/archivados", label: "Archivados" },
  { href: "/adn", label: "ADN" },
];

const NAV_OPERACION: NavItem[] = [
  { href: "/nuevo-presupuesto", label: "Nuevo presupuesto" },
  { href: "/historial", label: "Historial" },
  { href: "/control-gastos", label: "Control de gastos" },
  { href: "/cashflow", label: "Cashflow" },
  { href: "/rentabilidad", label: "Rentabilidad" },
];

const NAV_DATOS: NavItem[] = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/maestro-precios", label: "Maestro de precios" },
  { href: "/finanzas", label: "Finanzas personales" },
];

function NavLink({
  item,
  activo,
  badge,
}: {
  item: NavItem;
  activo: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      className={`relative flex items-center justify-between px-4 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
        activo ? "text-cdm-fg" : "text-cdm-muted hover:text-cdm-fg"
      }`}
    >
      {activo && (
        <motion.span
          layoutId="nav-activo"
          className="absolute inset-y-0 left-0 w-[2px] bg-cdm-taupe"
          transition={{ type: "spring", stiffness: 400, damping: 35 }}
        />
      )}
      <span>{item.label}</span>
      {badge ? (
        <span className="bg-cdm-taupe px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-cdm-bg">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [archivados, setArchivados] = useState(0);

  const cargarBadge = useCallback(async () => {
    const supabase = createClient();
    const { count } = await supabase
      .from("eventos")
      .select("id", { count: "exact", head: true })
      .eq("estado", "archivado");
    setArchivados(count ?? 0);
  }, []);

  useEffect(() => {
    void cargarBadge();
  }, [cargarBadge, pathname]);
  useRealtimeTable("eventos", cargarBadge);

  if (SIN_CARCASA.some((p) => pathname.startsWith(p))) return <>{children}</>;

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const grupos: Array<{ titulo: string; items: NavItem[] }> = [
    { titulo: "Cockpit", items: NAV_COCKPIT },
    { titulo: "Operación", items: NAV_OPERACION },
    { titulo: "Datos", items: NAV_DATOS },
  ];

  return (
    <div className="min-h-screen bg-cdm-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-cdm-line bg-cdm-bg lg:flex print:hidden">
        <div className="px-4 pb-6 pt-8">
          <Link href="/" aria-label="Inicio">
            <RavnLogo align="start" showTagline={false} sizeClassName="text-xl" />
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto" aria-label="Navegación principal">
          {grupos.map((g) => (
            <div key={g.titulo} className="mb-6">
              <p className="px-4 pb-2 text-[9px] uppercase tracking-[0.3em] text-cdm-muted/60">
                {g.titulo}
              </p>
              {g.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  activo={
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href)
                  }
                  badge={item.href === "/archivados" ? archivados : undefined}
                />
              ))}
            </div>
          ))}
        </nav>
        <button
          onClick={cerrarSesion}
          className="border-t border-cdm-line px-4 py-4 text-left text-[10px] uppercase tracking-[0.2em] text-cdm-muted transition-colors hover:text-cdm-fg"
        >
          Cerrar sesión
        </button>
      </aside>

      {/* Barra superior compacta < lg (el móvil real es WhatsApp) */}
      <header className="flex items-center justify-between border-b border-cdm-line bg-cdm-bg px-4 py-3 lg:hidden print:hidden">
        <Link href="/" aria-label="Inicio">
          <RavnLogo align="start" showTagline={false} sizeClassName="text-base" />
        </Link>
        <Link
          href="/archivados"
          className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted"
        >
          Archivados{archivados > 0 ? ` (${archivados})` : ""}
        </Link>
      </header>

      <main className="min-w-0 lg:pl-60 print:pl-0">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Integrar en `src/app/layout.tsx`**

Agregar el import arriba (junto a los otros):

```tsx
import { AppShell } from "@/components/shell/app-shell";
```

Y reemplazar el cuerpo del ThemeProvider:

```tsx
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <ThemeToggle />
        </ThemeProvider>
```

(Antes era `{children}` pelado + `<ThemeToggle />`. El ThemeToggle flotante queda: las pantallas viejas siguen soportando claro/oscuro; el cockpit usa tokens `--cdm-*` fijos y no lo afecta.)

- [ ] **Step 3: Verificación visual**

Con `npm run dev` corriendo, logueado en `http://localhost:3000`:

1. `/historial`, `/cashflow`, `/finanzas` → sidebar negra `#0a0a0a` a la izquierda con la marca RAVN., 3 grupos de navegación, contenido de la pantalla intacto a la derecha (su fondo `#181817` propio).
2. El ítem activo tiene la barrita taupe a la izquierda y se desliza animada al navegar (Framer Motion `layoutId`).
3. `/login` (logout primero o ventana privada) → SIN sidebar.
4. `/propuesta/<id-existente>` → SIN sidebar (crítico: el PDF no cambia).
5. Achicar la ventana < 1024px → la sidebar desaparece y aparece la barra superior compacta.

- [ ] **Step 4: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/components/shell/app-shell.tsx src/app/layout.tsx
git commit -m "feat(frente-b): carcasa AppShell — sidebar Jarvis con badge de archivados en vivo"
```

---

### Task 11: Home cockpit — estructura del grid + barra de comando (con caso inline "anotá")

**Files:**
- Create: `src/lib/comando-inline.ts`
- Test: `src/lib/__tests__/comando-inline.test.ts`
- Create: `src/components/cockpit/command-bar.tsx`
- Create: `src/components/cockpit/cockpit-home.tsx`
- Modify: `src/app/page.tsx` (reemplazo completo)

La home vieja (menú de botones centrados) muere: la navegación ya vive en la carcasa. En esta tarea el grid arranca con la CommandBar real y placeholders `<Panel>` vacíos para los 8 módulos; las tareas 12-15 los reemplazan uno a uno (la home compila y se ve en cada paso).

**Caso inline (spec §4.1 "o resolver inline lo simple"):** la barra resuelve inline UN caso en esta tanda — un comando que empieza con "anotá"/"anota" crea la tarea DIRECTA en la tabla `tareas` (la misma fuente que el módulo Pendientes, con el cliente Supabase del browser), sin pasar por `trabajos_cola` ni por el daemon. El resto de los casos inline ("qué gasté hoy" → respuesta inmediata, etc.) queda explícitamente como tanda futura (ver dudas abiertas al final del plan). La detección es lógica pura con test (TDD).

- [ ] **Step 1: Escribir el test que falla — `src/lib/__tests__/comando-inline.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseComandoInline } from "../comando-inline";

describe("parseComandoInline", () => {
  it("'anotá X' (con acento) resuelve inline como tarea", () => {
    expect(parseComandoInline("anotá llamar a Oribe")).toEqual({
      inline: true,
      accion: "tarea",
      texto: "llamar a Oribe",
    });
  });

  it("'anota X' (sin acento) también", () => {
    expect(parseComandoInline("anota comprar arena")).toEqual({
      inline: true,
      accion: "tarea",
      texto: "comprar arena",
    });
  });

  it("es insensible a mayúsculas y espacios alrededor", () => {
    expect(parseComandoInline("  Anotá pasar por el corralón  ")).toEqual({
      inline: true,
      accion: "tarea",
      texto: "pasar por el corralón",
    });
  });

  it("'anotá' pelado (sin texto) NO es inline: va a la cola", () => {
    expect(parseComandoInline("anotá")).toEqual({ inline: false });
    expect(parseComandoInline("anota   ")).toEqual({ inline: false });
  });

  it("cualquier otra orden NO es inline", () => {
    expect(parseComandoInline("cotizame baño completo en Pilar")).toEqual({
      inline: false,
    });
    expect(parseComandoInline("qué gasté hoy")).toEqual({ inline: false });
    expect(parseComandoInline("anotador de obra")).toEqual({ inline: false });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/comando-inline.test.ts
```

Expected: FAIL con `Cannot find module '../comando-inline'`.

- [ ] **Step 3: Implementar `src/lib/comando-inline.ts`**

```ts
/**
 * Detección PURA del caso inline de la barra de comando (spec §4.1:
 * "crea un trabajo en la cola o resuelve inline lo simple").
 * Tanda actual: SOLO "anotá/anota X" → tarea directa en `tareas`.
 * Los demás casos inline son tanda futura (dudas abiertas del plan).
 */

export type ComandoInline =
  | { inline: true; accion: "tarea"; texto: string }
  | { inline: false };

// [a\u00E1] = "a" o "á" precompuesta, con escape unicode (paste-safe entre editores).
// El flag `i` cubre "Anotá"/"ANOTA". `\s+(.+)` exige texto después del verbo
// (sin texto no hay tarea que crear: se encola como cualquier otra orden).
const RE_ANOTAR = /^anot[a\u00E1]\s+(.+)$/i;

export function parseComandoInline(prompt: string): ComandoInline {
  const m = prompt.trim().match(RE_ANOTAR);
  if (m) {
    const texto = m[1].trim();
    if (texto) return { inline: true, accion: "tarea", texto };
  }
  return { inline: false };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
cd /Users/ezeotero/Documents/ravn && npx vitest run src/lib/__tests__/comando-inline.test.ts
```

Expected: `Test Files  1 passed` — 5 tests passed.

- [ ] **Step 5: Crear `src/components/cockpit/command-bar.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { parseComandoInline } from "@/lib/comando-inline";
import {
  TIPOS_TRABAJO,
  type TipoTrabajo,
  type TrabajoCola,
} from "@/types/centro-mando";

const ESTADO_LABEL: Record<TrabajoCola["estado"], string> = {
  pendiente: "En cola",
  esperando_datos: "Esperando datos",
  procesando: "Procesando",
  en_revision: "En revisión",
  completado: "Completado",
  error: "Error",
  cancelado: "Cancelado",
};

const ESTADO_COLOR: Record<TrabajoCola["estado"], string> = {
  pendiente: "text-cdm-muted",
  esperando_datos: "text-amber-300",
  procesando: "text-cdm-taupe",
  en_revision: "text-amber-300",
  completado: "text-emerald-400",
  error: "text-red-400",
  cancelado: "text-cdm-muted",
};

/**
 * Módulo 1 del cockpit (spec §4.1): la orden viaja a `trabajos_cola` vía
 * POST /api/trabajos y el daemon Mac la levanta; el progreso se ve en vivo
 * por Realtime (la fila cambia de estado → refetch). EXCEPCIÓN inline:
 * "anotá X" crea la tarea directa en `tareas` (parseComandoInline) sin
 * pasar por la cola — confirmación inmediata, sin daemon.
 */
export function CommandBar() {
  const [prompt, setPrompt] = useState("");
  const [tipo, setTipo] = useState<TipoTrabajo>("orden");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [trabajos, setTrabajos] = useState<TrabajoCola[]>([]);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("trabajos_cola")
      .select("*")
      .order("creado_at", { ascending: false })
      .limit(4);
    setTrabajos((data as TrabajoCola[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("trabajos_cola", cargar);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = prompt.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      // Caso inline (spec §4.1): "anotá …" → tarea directa en `tareas`,
      // la MISMA tabla que usa el módulo Pendientes. Sin trabajos_cola.
      const inline = parseComandoInline(texto);
      if (inline.inline) {
        const supabase = createClient();
        const { error: insErr } = await supabase
          .from("tareas")
          .insert({ texto: inline.texto, origen: "web" });
        if (insErr) {
          setError(insErr.message);
          return;
        }
        setPrompt("");
        setOk(`Anotado en Pendientes: "${inline.texto}"`);
        return;
      }

      const res = await fetch("/api/trabajos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, prompt: texto }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      setPrompt("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border border-cdm-line bg-cdm-panel"
    >
      <form onSubmit={enviar} className="flex items-stretch">
        <div className="flex shrink-0">
          {TIPOS_TRABAJO.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`px-3 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                tipo === t
                  ? "bg-cdm-taupe text-cdm-bg"
                  : "text-cdm-muted hover:text-cdm-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Ordená algo: "cotizame baño completo en Pilar", "anotá llamar a Oribe", "redactá el detalle de la obra Saavedra"…'
          className="font-raleway w-full border-l border-cdm-line bg-transparent px-4 py-4 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={enviando || !prompt.trim()}
          className="shrink-0 bg-cdm-fg px-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-cdm-bg transition-opacity hover:opacity-85 disabled:opacity-30"
        >
          {enviando ? "Enviando…" : "Ejecutar"}
        </button>
      </form>
      {error && (
        <p className="border-t border-cdm-line px-4 py-2 text-[11px] text-red-400">
          {error}
        </p>
      )}
      {ok && (
        <p className="border-t border-cdm-line px-4 py-2 text-[11px] text-emerald-400">
          {ok}
        </p>
      )}
      {trabajos.length > 0 && (
        <ul className="flex flex-col divide-y divide-cdm-line border-t border-cdm-line sm:flex-row sm:divide-x sm:divide-y-0">
          <AnimatePresence initial={false}>
            {trabajos.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
              >
                {(t.estado === "procesando" || t.estado === "pendiente") && (
                  <motion.span
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="h-1.5 w-1.5 shrink-0 bg-cdm-taupe"
                  />
                )}
                <span className="truncate text-[11px] text-cdm-muted">{t.prompt}</span>
                <span
                  className={`ml-auto shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_COLOR[t.estado]}`}
                >
                  {ESTADO_LABEL[t.estado]}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
```

- [ ] **Step 6: Crear `src/components/cockpit/cockpit-home.tsx` (grid con placeholders)**

```tsx
"use client";

import { motion } from "framer-motion";
import type { CerebroData } from "@/types/centro-mando";
import { CommandBar } from "./command-bar";
import { Panel } from "./panel";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

function Placeholder({ titulo, className }: { titulo: string; className?: string }) {
  return (
    <Panel titulo={titulo} className={className}>
      <p className="text-[11px] text-cdm-muted">Próximamente.</p>
    </Panel>
  );
}

/**
 * Home cockpit (spec §4): una pantalla, sin scroll en desktop (cada módulo
 * scrollea adentro). En < lg degrada a una columna con scroll normal.
 * Los Placeholder se reemplazan por módulos reales en las tareas 12-15.
 */
export function CockpitHome({ cerebro }: { cerebro: CerebroData }) {
  return (
    <div className="flex min-h-screen flex-col gap-3 bg-cdm-bg p-4 text-cdm-fg lg:h-screen lg:overflow-hidden">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="font-raleway text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
          Centro de mando
        </h1>
        <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>

      <CommandBar />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-2"
      >
        <Placeholder titulo="Obras" className="lg:col-span-3" />
        <Placeholder titulo="Plata" className="lg:col-span-3" />
        <Placeholder titulo="Pendientes" className="lg:col-span-3" />
        <Placeholder titulo="Cotizaciones" className="lg:col-span-3" />
        <Placeholder titulo="Actividad" className="lg:col-span-4" />
        <Placeholder titulo="El cerebro" className="lg:col-span-4" />
        <Placeholder titulo="Archivados" className="lg:col-span-2" />
        <Placeholder titulo="ADN" className="lg:col-span-2" />
      </motion.div>
    </div>
  );
}
```

(`cerebro` queda sin usar hasta Task 15 — para que `npm run lint` no proteste por la prop sin uso, en este paso intermedio referenciarla: agregar `void cerebro;` como primera línea del cuerpo de `CockpitHome`. Task 15 la elimina al pasarla al módulo real.)

- [ ] **Step 7: Reemplazar COMPLETO `src/app/page.tsx`**

```tsx
import { CockpitHome } from "@/components/cockpit/cockpit-home";
import { getCerebro } from "@/lib/vault";

/** Home = cockpit. ISR 5 min: el vault (GitHub) se relee como mucho cada 300 s. */
export const revalidate = 300;

export default async function Home() {
  const cerebro = await getCerebro();
  return <CockpitHome cerebro={cerebro} />;
}
```

- [ ] **Step 8: Verificación visual + funcional de la barra**

Con `npm run dev` y sesión iniciada, abrir `http://localhost:3000`:

1. Home negra `#0a0a0a` con header "CENTRO DE MANDO" + fecha, barra de comando arriba, grid de 8 paneles "Próximamente" en 2 filas (desktop ancho), todo entra sin scroll de página.
2. Los paneles aparecen con stagger (fade + slide sutil) al cargar.
3. Escribir "prueba desde la barra" con chip `consulta` → Ejecutar → aparece abajo de la barra con estado "En cola" y punto taupe latiendo.
4. Probar el Realtime: en el SQL Editor de Supabase
   `update trabajos_cola set estado = 'procesando' where prompt = 'prueba desde la barra';`
   → el chip pasa a "Procesando" SIN refrescar la página. Después
   `update trabajos_cola set estado = 'completado' where prompt = 'prueba desde la barra';`
   → "Completado" en verde.
5. **Caso inline:** escribir "anotá llamar a Oribe" → Ejecutar → aparece la confirmación verde `Anotado en Pendientes: "llamar a Oribe"` y NO se agrega ninguna fila a la lista de trabajos. Confirmar en el SQL Editor:
   `select count(*) from trabajos_cola where prompt ilike '%llamar a Oribe%';` → `0`, y
   `select texto, origen from tareas where texto = 'llamar a Oribe';` → 1 fila con origen `web`. (Cuando el módulo Pendientes exista — Task 13 — la tarea también se ve en la home; se limpia en la Task 19.)
6. Si las tablas de Frente A no existen aún: la barra muestra el error del POST y los paneles quedan en placeholder — anotar y re-verificar al final. (El caso inline usa la tabla `tareas`, que ya existe: funciona aunque A no haya corrido.)

- [ ] **Step 9: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/lib/comando-inline.ts src/lib/__tests__/comando-inline.test.ts src/components/cockpit/command-bar.tsx src/components/cockpit/cockpit-home.tsx src/app/page.tsx
git commit -m "feat(frente-b): home cockpit con barra de comando (cola + caso inline anotá) y Realtime"
```

---

### Task 12: Módulos Obras y Plata (+ extensión de `/cashflow/resumen`)

**Files:**
- Modify: `src/app/cashflow/resumen/route.ts`
- Create: `src/components/cockpit/modulo-obras.tsx`
- Create: `src/components/cockpit/modulo-plata.tsx`
- Modify: `src/components/cockpit/cockpit-home.tsx`

Ambos consumen `/cashflow/resumen` (shape `ResumenJson` de `src/app/cashflow/cashflow-dashboard-screen.tsx`) y `/api/finanzas` (shape de `src/app/finanzas/finanzas-screen.tsx`). El spec pide más de lo que el endpoint expone hoy — §4.2: obras "activas con **estado**, último gasto, **margen al día**"; §4.3: "**cashflow del mes**, **gastos de hoy (obra + personales)**, semáforo" — así que el Step 1 EXTIENDE el endpoint con campos **aditivos** (la pantalla vieja `/cashflow` ignora campos extra: cero ruptura). Definiciones:

- **Estado de obra** (derivado de columnas reales de `obras`): `finalizada_at` null y cobranza abierta → "En curso"; `finalizada_at` seteado → "Finalizada"; `cobranza_cerrada_at` seteado → "Cobranza cerrada".
- **Margen al día** = `referencia_propuesta_ars` (importe de la propuesta, lo que cobra Eze por la obra) − `egresos_caja` (TODO lo gastado real al día: libreta + gastos de obra). `null` si la obra no tiene propuesta cargada — el módulo muestra "sin propuesta".
- **`caja_mes`** = ingresos/egresos/saldo del mes calendario corriente sobre las mismas obras del saldo global (items de `cashflow_items` con `monto_real`, fecha = `fecha_real ?? fecha_proyectada`; más `presupuestos_gastos` por su `fecha`).
- **`gastos_obra_hoy_ars`** = egresos de obra de HOY (libreta + gastos de obra), para sumarlos a los personales de `/api/finanzas`.

- [ ] **Step 1: Extender `src/app/cashflow/resumen/route.ts` (cuatro ediciones aditivas)**

**(a)** En el type `ObraRow` (línea ~73), agregar `finalizada_at`:

```ts
type ObraRow = {
  id: string;
  presupuesto_id: string;
  cobranza_cerrada_at?: string | null;
  finalizada_at?: string | null;
  monto_total_a_cobrar_ars?: string | number | null;
  presupuestos: PresRow | PresRow[] | null;
};
```

**(b)** En el select de `obras` (línea ~139), agregar `finalizada_at` después de `cobranza_cerrada_at,`:

```ts
    const { data: obrasData, error: errObras } = await supabase.from("obras").select(`
        id,
        presupuesto_id,
        cobranza_cerrada_at,
        finalizada_at,
        monto_total_a_cobrar_ars,
        presupuestos (
          id,
          nombre_obra,
          nombre_cliente,
          presupuesto_aprobado,
          propuesta_comercial_pref,
          libreta_caja_empresa
        )
      `);
```

**(c)** En el objeto que devuelve el map de `obrasActivas` (línea ~250), agregar dos campos después de `cobranza_cerrada: cobCerrada,`:

```ts
      return {
        obra_id: o.id,
        presupuesto_id: o.presupuesto_id,
        nombre_obra: nombre,
        ingresos_caja: tr.ingresos,
        egresos_libreta_ars: egLib,
        egresos_gastos_obra_ars: egGastos,
        egresos_caja: egTotal,
        saldo_caja: saldoObra,
        referencia_propuesta_ars,
        pendiente_ingreso_referencia_ars,
        saldo_por_cobrar_ars,
        cobranza_cerrada: cobCerrada,
        finalizada: Boolean(o.finalizada_at),
        // Margen al día (spec §4.2): propuesta − gastado real acumulado.
        margen_al_dia_ars:
          referencia_propuesta_ars != null
            ? roundArs2(referencia_propuesta_ars - egTotal)
            : null,
      };
```

**(d)** Después de la línea `const saldoGlob = roundArs2(ingresosGlob - egresosTotGlob);` (línea ~292), insertar el cálculo del mes y de hoy:

```ts
    // ── Centro de Mando (spec §4.3): cashflow del mes + gastos de obra de hoy ──
    // Mismas obras que el saldo global (saldoObraIds). Fecha de un item de
    // libreta = fecha_real ?? fecha_proyectada (igual que movimientos_recientes).
    const mesActual = hoy.slice(0, 7); // YYYY-MM
    let ingresosMes = 0;
    let egresosLibMes = 0;
    let egresosLibHoy = 0;
    for (const it of sliceSaldo) {
      if (it.monto_real == null) continue;
      const f = it.fecha_real ?? it.fecha_proyectada;
      if (it.tipo === "ingreso") {
        if (f.startsWith(mesActual)) ingresosMes = roundArs2(ingresosMes + it.monto_real);
      } else {
        if (f.startsWith(mesActual)) egresosLibMes = roundArs2(egresosLibMes + it.monto_real);
        if (f === hoy) egresosLibHoy = roundArs2(egresosLibHoy + it.monto_real);
      }
    }
    let gastosObraMes = 0;
    let gastosObraHoy = 0;
    for (const g of gastosRows) {
      const oid = obraIdPorPresupuestoId.get(g.presupuesto_id);
      if (!oid || !saldoObraIds.has(oid)) continue;
      const f = String(g.fecha).slice(0, 10);
      const add = importeGastoObraArs(g);
      if (f.startsWith(mesActual)) gastosObraMes = roundArs2(gastosObraMes + add);
      if (f === hoy) gastosObraHoy = roundArs2(gastosObraHoy + add);
    }
    const egresosMes = roundArs2(egresosLibMes + gastosObraMes);
```

Y en el `NextResponse.json({ ... })` final (línea ~449), agregar después del bloque `totales_caja: { ... },`:

```ts
      caja_mes: {
        mes: mesActual,
        ingresos: ingresosMes,
        egresos: egresosMes,
        saldo: roundArs2(ingresosMes - egresosMes),
      },
      gastos_obra_hoy_ars: roundArs2(egresosLibHoy + gastosObraHoy),
```

- [ ] **Step 2: Verificar que la extensión no rompe nada**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
```

Expected: exit 0. Con `npm run dev` y sesión iniciada: abrir `/cashflow` → la pantalla vieja se ve EXACTAMENTE igual (los campos nuevos son aditivos). En la consola del navegador:

```js
const r = await (await fetch("/cashflow/resumen", { cache: "no-store" })).json();
({ caja_mes: r.caja_mes, gastos_obra_hoy_ars: r.gastos_obra_hoy_ars, obra0: r.obras_activas[0] })
```

Expected: `caja_mes` con `{ mes: "2026-06", ingresos, egresos, saldo }`, `gastos_obra_hoy_ars` numérico, y cada obra con `finalizada` (boolean) y `margen_al_dia_ars` (número o null).

- [ ] **Step 3: Crear `src/components/cockpit/modulo-obras.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "./panel";
import { formatMoneyInt } from "@/lib/format-currency";

type ObraActiva = {
  obra_id: string;
  nombre_obra: string;
  ingresos_caja: number;
  egresos_caja: number;
  saldo_caja: number;
  cobranza_cerrada?: boolean;
  /** Campos agregados por el Step 1 de esta task. */
  finalizada: boolean;
  margen_al_dia_ars: number | null;
};

type MovimientoReciente = {
  obra_id: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  monto_real: number;
  fecha_real: string;
};

type ResumenCashflow = {
  saldo_caja_total: number;
  obras_activas: ObraActiva[];
  movimientos_recientes?: MovimientoReciente[];
};

function estadoObra(o: ObraActiva): { label: string; cls: string } {
  if (o.cobranza_cerrada) return { label: "Cobranza cerrada", cls: "text-cdm-taupe" };
  if (o.finalizada) return { label: "Finalizada", cls: "text-amber-300" };
  return { label: "En curso", cls: "text-emerald-400" };
}

/** Módulo 2: obras activas con estado, margen al día y último gasto (spec §4.2). */
export function ModuloObras({ className }: { className?: string }) {
  const [data, setData] = useState<ResumenCashflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/cashflow/resumen", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
        return;
      }
      setError(null);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ultimoEgresoDe = (obraId: string) =>
    data?.movimientos_recientes?.find(
      (m) => m.obra_id === obraId && m.tipo === "egreso"
    );

  return (
    <Panel
      titulo="Obras"
      className={className}
      accion={
        <Link
          href="/cashflow"
          className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted hover:text-cdm-fg"
        >
          Cashflow →
        </Link>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && !data && <p className="text-[11px] text-cdm-muted">Cargando…</p>}
      {data && data.obras_activas.length === 0 && (
        <p className="text-[11px] text-cdm-muted">Sin obras activas.</p>
      )}
      <ul className="space-y-3">
        {data?.obras_activas.map((o) => {
          const ultimo = ultimoEgresoDe(o.obra_id);
          const estado = estadoObra(o);
          return (
            <li key={o.obra_id} className="border-b border-cdm-line pb-2 last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-cdm-fg">{o.nombre_obra}</span>
                <span
                  className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${estado.cls}`}
                >
                  {estado.label}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px]">
                <span className="text-cdm-muted">
                  Margen al día:{" "}
                  {o.margen_al_dia_ars === null ? (
                    "sin propuesta"
                  ) : (
                    <span
                      className={`tabular-nums ${
                        o.margen_al_dia_ars >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatMoneyInt(o.margen_al_dia_ars)}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    o.saldo_caja >= 0 ? "text-cdm-fg/70" : "text-red-400"
                  }`}
                >
                  Caja {formatMoneyInt(o.saldo_caja)}
                </span>
              </div>
              {ultimo && (
                <p className="mt-0.5 truncate text-[10px] text-cdm-muted">
                  Último gasto: {ultimo.descripcion} · {formatMoneyInt(ultimo.monto_real)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 4: Crear `src/components/cockpit/modulo-plata.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { formatMoneyInt } from "@/lib/format-currency";

type Semaforo = "verde" | "amarillo" | "rojo";

/** Bloque `caja_mes` agregado a /cashflow/resumen en el Step 1 de esta task. */
type CajaMes = {
  mes: string;
  ingresos: number;
  egresos: number;
  saldo: number;
};

type ResumenCaja = {
  caja_mes?: CajaMes;
  gastos_obra_hoy_ars?: number;
};

type FinanzasResumen = {
  gastado_hoy: number;
  total_mes: number;
  presupuesto_mensual: number;
  semaforo_dia: Semaforo;
  semaforo_mes: Semaforo;
};

const DOT: Record<Semaforo, string> = {
  verde: "bg-emerald-400",
  amarillo: "bg-amber-300",
  rojo: "bg-red-400",
};

function PuntoSemaforo({ s }: { s: Semaforo }) {
  return (
    <motion.span
      animate={s === "rojo" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
      transition={{ repeat: Infinity, duration: 1.2 }}
      className={`inline-block h-2 w-2 ${DOT[s]}`}
    />
  );
}

/** Módulo 3: cashflow del mes + gastos de hoy (obra + personales) + semáforo (spec §4.3). */
export function ModuloPlata({ className }: { className?: string }) {
  const [caja, setCaja] = useState<ResumenCaja | null>(null);
  const [fin, setFin] = useState<FinanzasResumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [resCaja, resFin] = await Promise.all([
        fetch("/cashflow/resumen", { cache: "no-store" }),
        fetch("/api/finanzas", { cache: "no-store" }),
      ]);
      if (resCaja.ok) setCaja((await resCaja.json()) as ResumenCaja);
      if (resFin.ok) setFin(await resFin.json());
      if (!resCaja.ok && !resFin.ok) setError("No se pudo cargar la plata.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const gastosObraHoy = caja?.gastos_obra_hoy_ars ?? 0;
  // Gastos de HOY = obra + personales (spec §4.3). Sin /api/finanzas no se
  // puede armar el total: se muestra "—" en lugar de un número incompleto.
  const gastosHoyTotal = fin ? gastosObraHoy + fin.gastado_hoy : null;

  return (
    <Panel
      titulo="Plata"
      className={className}
      accion={
        <Link
          href="/finanzas"
          className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted hover:text-cdm-fg"
        >
          Finanzas →
        </Link>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="space-y-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
            Cashflow del mes (obras)
          </p>
          <p
            className={`text-2xl font-light tabular-nums ${
              caja?.caja_mes && caja.caja_mes.saldo < 0 ? "text-red-400" : "text-cdm-fg"
            }`}
          >
            {caja?.caja_mes ? formatMoneyInt(caja.caja_mes.saldo) : "—"}
          </p>
          {caja?.caja_mes && (
            <p className="text-[10px] tabular-nums text-cdm-muted">
              <span className="text-emerald-400">
                ↑ {formatMoneyInt(caja.caja_mes.ingresos)}
              </span>
              {" · "}
              <span className="text-red-400">
                ↓ {formatMoneyInt(caja.caja_mes.egresos)}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-baseline justify-between border-t border-cdm-line pt-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
              Gastos de hoy (obra + personal)
            </p>
            <p className="text-lg font-light tabular-nums">
              {gastosHoyTotal === null ? "—" : formatMoneyInt(gastosHoyTotal)}
            </p>
            <p className="text-[10px] tabular-nums text-cdm-muted">
              Obra {formatMoneyInt(gastosObraHoy)} · Personal{" "}
              {fin ? formatMoneyInt(fin.gastado_hoy) : "—"}
            </p>
          </div>
          {fin && <PuntoSemaforo s={fin.semaforo_dia} />}
        </div>
        <div className="flex items-baseline justify-between border-t border-cdm-line pt-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
              Mes personal
            </p>
            <p className="text-lg font-light tabular-nums">
              {fin ? formatMoneyInt(fin.total_mes) : "—"}
              {fin && (
                <span className="text-[10px] text-cdm-muted">
                  {" "}
                  / {formatMoneyInt(fin.presupuesto_mensual)}
                </span>
              )}
            </p>
          </div>
          {fin && <PuntoSemaforo s={fin.semaforo_mes} />}
        </div>
      </div>
    </Panel>
  );
}
```

- [ ] **Step 5: Conectar en `cockpit-home.tsx`**

Agregar imports:

```tsx
import { ModuloObras } from "./modulo-obras";
import { ModuloPlata } from "./modulo-plata";
```

Y reemplazar las dos primeras líneas del grid:

```tsx
        <ModuloObras className="lg:col-span-3" />
        <ModuloPlata className="lg:col-span-3" />
```

(en lugar de `<Placeholder titulo="Obras" …/>` y `<Placeholder titulo="Plata" …/>`).

- [ ] **Step 6: Verificación visual**

En `http://localhost:3000`:

1. **Obras:** cada obra real con su chip de estado ("En curso" verde / "Finalizada" amber / "Cobranza cerrada" taupe — comparar con lo que muestra `/cashflow` para la misma obra), "Margen al día" en verde/rojo (o "sin propuesta"), "Caja" y el último gasto. Cuentas a mano para UNA obra: margen al día = importe de la propuesta (visible en `/rentabilidad` o `/cashflow`) − egresos de caja de esa obra en `/cashflow` — deben coincidir.
2. **Plata:** "Cashflow del mes (obras)" con saldo grande + ingresos/egresos del mes; "Gastos de hoy (obra + personal)" con el total y el desglose; "Mes personal" contra presupuesto. Los puntos de semáforo vienen de `/api/finanzas` (el rojo late). Comparar el desglose personal contra `/finanzas` — debe coincidir.

- [ ] **Step 7: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/app/cashflow/resumen/route.ts src/components/cockpit/modulo-obras.tsx src/components/cockpit/modulo-plata.tsx src/components/cockpit/cockpit-home.tsx
git commit -m "feat(frente-b): módulos Obras (estado + margen al día) y Plata (cashflow del mes + gastos de hoy) con extensión de /cashflow/resumen"
```

---

### Task 13: Módulo Pendientes (CRUD sobre `tareas`)

**Files:**
- Create: `src/components/cockpit/modulo-pendientes.tsx`
- Modify: `src/components/cockpit/cockpit-home.tsx`

La tabla `tareas` YA existe (Tu Día) con RLS `authenticated full`: el módulo opera directo con el cliente Supabase del browser. Check constraint de `origen`: `whatsapp|web|manual` → acá se usa `web`.

- [ ] **Step 1: Crear `src/components/cockpit/modulo-pendientes.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import type { Tarea } from "@/types/centro-mando";

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Módulo 4: tabla `tareas` unificada — única fuente de pendientes (spec §4.4). */
export function ModuloPendientes({ className }: { className?: string }) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tareas")
      .select("*")
      .eq("estado", "pendiente")
      .order("fecha", { ascending: true, nullsFirst: false })
      .order("creado_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setTareas((data as Tarea[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("tareas", cargar);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    const texto = nueva.trim();
    if (!texto) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("tareas")
      .insert({ texto, origen: "web" });
    if (error) {
      setError(error.message);
      return;
    }
    setNueva("");
    await cargar();
  }

  async function completar(id: string) {
    const supabase = createClient();
    await supabase.from("tareas").update({ estado: "hecha" }).eq("id", id);
    await cargar();
  }

  async function borrar(id: string) {
    const supabase = createClient();
    await supabase.from("tareas").delete().eq("id", id);
    await cargar();
  }

  return (
    <Panel
      titulo="Pendientes"
      className={className}
      accion={
        tareas.length > 0 ? (
          <span className="text-[9px] tabular-nums text-cdm-muted">
            {tareas.length}
          </span>
        ) : undefined
      }
    >
      <form onSubmit={agregar} className="mb-3 flex">
        <input
          type="text"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Anotar pendiente…"
          className="font-raleway w-full border border-cdm-line bg-transparent px-3 py-1.5 text-[11px] text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-taupe focus:outline-none"
        />
        <button
          type="submit"
          disabled={!nueva.trim()}
          className="shrink-0 border border-l-0 border-cdm-line px-3 text-[10px] uppercase tracking-widest text-cdm-taupe transition-colors hover:bg-cdm-taupe hover:text-cdm-bg disabled:opacity-30"
        >
          +
        </button>
      </form>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && tareas.length === 0 && (
        <p className="text-[11px] text-cdm-muted">Nada pendiente.</p>
      )}
      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {tareas.map((t) => (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: 16 }}
              className="group flex items-start gap-2 text-[11px]"
            >
              <button
                onClick={() => completar(t.id)}
                aria-label="Marcar hecha"
                className="mt-0.5 h-3 w-3 shrink-0 border border-cdm-line transition-colors hover:border-cdm-taupe hover:bg-cdm-taupe"
              />
              <span className="min-w-0 flex-1 leading-snug text-cdm-fg/85">
                {t.texto}
                <span className="ml-2 text-[9px] uppercase tracking-widest text-cdm-muted/70">
                  {t.categoria}
                  {fmtFecha(t.fecha) ? ` · ${fmtFecha(t.fecha)}` : ""}
                </span>
              </span>
              <button
                onClick={() => borrar(t.id)}
                aria-label="Eliminar"
                className="text-cdm-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                ×
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 2: Conectar en `cockpit-home.tsx`**

Import `import { ModuloPendientes } from "./modulo-pendientes";` y reemplazar `<Placeholder titulo="Pendientes" …/>` por:

```tsx
        <ModuloPendientes className="lg:col-span-3" />
```

- [ ] **Step 3: Verificación visual**

En la home: las tareas pendientes reales aparecen; escribir "probar módulo pendientes" + Enter → aparece en la lista; click en el cuadradito → desaparece con animación (queda `hecha` en la base); la × la borra. Mandar una tarea desde el bot de WhatsApp (si está vivo) → aparece sola por Realtime.

- [ ] **Step 4: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/components/cockpit/modulo-pendientes.tsx src/components/cockpit/cockpit-home.tsx
git commit -m "feat(frente-b): módulo Pendientes con CRUD sobre tareas + Realtime"
```

---

### Task 14: Módulos Cotizaciones, Actividad y Archivados (home)

**Files:**
- Create: `src/components/cockpit/modulo-cotizaciones.tsx`
- Create: `src/components/cockpit/modulo-actividad.tsx`
- Create: `src/components/cockpit/modulo-archivados.tsx`
- Modify: `src/components/cockpit/cockpit-home.tsx`

- [ ] **Step 1: Crear `src/components/cockpit/modulo-cotizaciones.tsx`**

Nota: las pantallas de detalle/mesa de revisión son de Frente D — este módulo solo lista (sin links de detalle por ahora).

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import { formatMoneyInt } from "@/lib/format-currency";
import type { CotizacionResumen, EstadoCotizacion } from "@/types/centro-mando";

const ESTADO_UI: Record<EstadoCotizacion, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "text-cdm-muted" },
  en_revision: { label: "En revisión", cls: "text-amber-300" },
  aprobada: { label: "Aprobada", cls: "text-emerald-400" },
  rechazada: { label: "Rechazada", cls: "text-red-400" },
  documento_emitido: { label: "Emitida", cls: "text-cdm-taupe" },
};

/** Módulo 5: cotizaciones en proceso + historial con estado de aprobación (spec §4.5). */
export function ModuloCotizaciones({ className }: { className?: string }) {
  const [filas, setFilas] = useState<CotizacionResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cotizaciones")
      .select("id, creado_at, titulo, zona, estado, total_min, total_max")
      .order("creado_at", { ascending: false })
      .limit(6);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setFilas((data as CotizacionResumen[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("cotizaciones", cargar);

  return (
    <Panel titulo="Cotizaciones" className={className}>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && filas.length === 0 && (
        <p className="text-[11px] text-cdm-muted">
          Sin cotizaciones. Pedila por la barra o por WhatsApp.
        </p>
      )}
      <ul className="space-y-3">
        {filas.map((c) => (
          <li key={c.id} className="border-b border-cdm-line pb-2 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-cdm-fg">{c.titulo}</span>
              <span
                className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_UI[c.estado].cls}`}
              >
                {ESTADO_UI[c.estado].label}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] tabular-nums text-cdm-muted">
              {c.zona ? `${c.zona} · ` : ""}
              {c.total_min !== null && c.total_max !== null
                ? `${formatMoneyInt(c.total_min)} – ${formatMoneyInt(c.total_max)}`
                : "Sin total aún"}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 2: Crear `src/components/cockpit/modulo-actividad.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import type { Evento, OrigenEvento } from "@/types/centro-mando";

export const ORIGEN_TAG: Record<OrigenEvento, string> = {
  whatsapp: "WA",
  tablero: "TAB",
  daemon: "DMN",
  bot: "BOT",
  sistema: "SYS",
};

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Módulo 6 (ex-oficina): feed de `eventos` — todo lo que hizo el sistema (spec §4.6). */
export function ModuloActividad({ className }: { className?: string }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("eventos")
      .select("*")
      .order("creado_at", { ascending: false })
      .limit(12);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setEventos((data as Evento[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  return (
    <Panel
      titulo="Actividad"
      className={className}
      accion={
        <Link
          href="/actividad"
          className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted hover:text-cdm-fg"
        >
          Ver todo →
        </Link>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && eventos.length === 0 && (
        <p className="text-[11px] text-cdm-muted">Sin actividad todavía.</p>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {eventos.map((e) => (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-baseline gap-2 text-[11px]"
            >
              <span className="shrink-0 tabular-nums text-cdm-muted">
                {fmtHora(e.creado_at)}
              </span>
              <span className="shrink-0 border border-cdm-line px-1 text-[8px] uppercase tracking-widest text-cdm-taupe">
                {ORIGEN_TAG[e.origen]}
              </span>
              <span className="truncate text-cdm-fg/85">{e.titulo}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 3: Crear `src/components/cockpit/modulo-archivados.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import type { Evento } from "@/types/centro-mando";

/** Módulo 7: ítems sin clasificar esperando a Eze — nada se pierde (spec §4.7). */
export function ModuloArchivados({ className }: { className?: string }) {
  const [filas, setFilas] = useState<Evento[]>([]);
  const [total, setTotal] = useState(0);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, count } = await supabase
      .from("eventos")
      .select("*", { count: "exact" })
      .eq("estado", "archivado")
      .order("creado_at", { ascending: false })
      .limit(3);
    setFilas((data as Evento[]) ?? []);
    setTotal(count ?? 0);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  return (
    <Panel
      titulo="Archivados"
      className={className}
      accion={
        total > 0 ? (
          <span className="bg-cdm-taupe px-1.5 text-[10px] font-bold tabular-nums text-cdm-bg">
            {total}
          </span>
        ) : undefined
      }
    >
      {total === 0 ? (
        <p className="text-[11px] text-cdm-muted">
          Nada sin clasificar. Pérdida: cero.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {filas.map((e) => (
              <li key={e.id} className="truncate text-[11px] text-cdm-fg/85">
                {e.titulo}
              </li>
            ))}
          </ul>
          <Link
            href="/archivados"
            className="mt-3 inline-block text-[9px] uppercase tracking-[0.2em] text-cdm-taupe hover:text-cdm-fg"
          >
            Resolver →
          </Link>
        </>
      )}
    </Panel>
  );
}
```

- [ ] **Step 4: Conectar en `cockpit-home.tsx`**

Imports:

```tsx
import { ModuloCotizaciones } from "./modulo-cotizaciones";
import { ModuloActividad } from "./modulo-actividad";
import { ModuloArchivados } from "./modulo-archivados";
```

Reemplazos en el grid:

```tsx
        <ModuloCotizaciones className="lg:col-span-3" />
        <ModuloActividad className="lg:col-span-4" />
```

y

```tsx
        <ModuloArchivados className="lg:col-span-2" />
```

- [ ] **Step 5: Sembrar eventos de prueba y verificar**

SQL Editor:

```sql
insert into eventos (origen, tipo, estado, titulo, contenido) values
  ('whatsapp', 'nota', 'archivado', 'Mensaje sin clasificar de prueba',
   '{"texto": "acordate de pasar por lo de Oribe"}'),
  ('bot', 'gasto_obra', 'procesado', 'Gasto registrado: arena x3 m3', '{}'),
  ('daemon', 'cotizacion', 'procesado', 'Cotización baño Pilar lista para revisión', '{}');

insert into cotizaciones (titulo, zona, estado, total_min, total_max) values
  ('Baño completo — Pilar', 'Pilar', 'en_revision', 4800000, 5600000);
```

En la home: Actividad lista los 3 eventos con hora y tag de origen (los nuevos entran solos, deslizándose); Cotizaciones muestra "Baño completo — Pilar · En revisión · $4.800.000 – $5.600.000"; Archivados muestra badge `1` + el título + link "Resolver →"; el badge de la sidebar también marca `1`.

- [ ] **Step 6: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/components/cockpit/modulo-cotizaciones.tsx src/components/cockpit/modulo-actividad.tsx src/components/cockpit/modulo-archivados.tsx src/components/cockpit/cockpit-home.tsx
git commit -m "feat(frente-b): módulos Cotizaciones, Actividad y Archivados con Realtime"
```

---

### Task 15: Módulos Cerebro y ADN (home)

**Files:**
- Create: `src/components/cockpit/modulo-cerebro.tsx`
- Create: `src/components/cockpit/modulo-adn.tsx`
- Modify: `src/components/cockpit/cockpit-home.tsx`

- [ ] **Step 1: Crear `src/components/cockpit/modulo-cerebro.tsx`**

```tsx
"use client";

import type { CerebroData } from "@/types/centro-mando";
import { Panel } from "./panel";

function ListaMini({
  titulo,
  items,
  color,
}: {
  titulo: string;
  items: string[];
  color: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">{titulo}</p>
      <ul className="mt-1 space-y-1">
        {items.map((it) => (
          <li key={it} className="flex gap-2 text-[11px] leading-snug text-cdm-fg/80">
            <span className={`mt-1.5 h-1 w-1 shrink-0 ${color}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Módulo 8: siguiente paso de la última Orientación + Patrones + FODA (spec §4.8). */
export function ModuloCerebro({
  cerebro,
  className,
}: {
  cerebro: CerebroData;
  className?: string;
}) {
  return (
    <Panel titulo="El cerebro" className={className}>
      {cerebro.error && <p className="mb-3 text-[11px] text-amber-300">{cerebro.error}</p>}
      {cerebro.orientacion && (
        <div className="mb-4">
          <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
            Última orientación
          </p>
          <p className="mt-0.5 text-xs font-medium text-cdm-taupe">
            {cerebro.orientacion.titulo}
          </p>
          {cerebro.orientacion.siguientePaso && (
            <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-cdm-fg/85">
              {cerebro.orientacion.siguientePaso}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 border-t border-cdm-line pt-3">
        <ListaMini
          titulo="Me potencia"
          items={cerebro.patrones.potencian.slice(0, 2)}
          color="bg-cdm-taupe"
        />
        <ListaMini
          titulo="Me frena"
          items={cerebro.patrones.frenan.slice(0, 2)}
          color="bg-red-400"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-cdm-line pt-3">
        <ListaMini titulo="Fortalezas" items={cerebro.foda.fortalezas.slice(0, 1)} color="bg-emerald-400" />
        <ListaMini titulo="Oportunidades" items={cerebro.foda.oportunidades.slice(0, 1)} color="bg-emerald-400" />
        <ListaMini titulo="Debilidades" items={cerebro.foda.debilidades.slice(0, 1)} color="bg-amber-300" />
        <ListaMini titulo="Amenazas" items={cerebro.foda.amenazas.slice(0, 1)} color="bg-red-400" />
      </div>
    </Panel>
  );
}
```

- [ ] **Step 2: Crear `src/components/cockpit/modulo-adn.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "./panel";
import type { Referencia } from "@/types/centro-mando";

/** Módulo 9 (teaser): última referencia estética + última frase (spec §4.9). */
export function ModuloAdn({ className }: { className?: string }) {
  const [ultEstetica, setUltEstetica] = useState<Referencia | null>(null);
  const [ultFilosofia, setUltFilosofia] = useState<Referencia | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/referencias?limit=20", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as { referencias: Referencia[] };
      setUltEstetica(j.referencias.find((r) => r.tipo === "estetica") ?? null);
      setUltFilosofia(j.referencias.find((r) => r.tipo === "filosofia") ?? null);
    } catch {
      /* el teaser nunca rompe la home */
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <Panel
      titulo="ADN"
      className={className}
      accion={
        <Link
          href="/adn"
          className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted hover:text-cdm-fg"
        >
          Ver todo →
        </Link>
      }
    >
      <div className="space-y-3">
        {ultEstetica?.imagen_url ? (
          <Link href="/adn" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={ultEstetica.imagen_url}
              alt={ultEstetica.texto ?? "Referencia estética"}
              className="h-24 w-full object-cover opacity-90 transition-opacity hover:opacity-100"
            />
          </Link>
        ) : (
          <div className="flex h-24 items-center justify-center border border-dashed border-cdm-line">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Sin referencias aún
            </span>
          </div>
        )}
        {ultFilosofia?.texto && (
          <blockquote className="border-l-2 border-cdm-taupe pl-3 text-[11px] italic leading-relaxed text-cdm-fg/85">
            “{ultFilosofia.texto}”
            {ultFilosofia.fuente && (
              <footer className="mt-1 text-[9px] uppercase not-italic tracking-[0.15em] text-cdm-muted">
                {ultFilosofia.fuente}
              </footer>
            )}
          </blockquote>
        )}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 3: Conectar en `cockpit-home.tsx` (quedan cero placeholders)**

Imports:

```tsx
import { ModuloCerebro } from "./modulo-cerebro";
import { ModuloAdn } from "./modulo-adn";
```

Reemplazar los dos placeholders restantes:

```tsx
        <ModuloCerebro cerebro={cerebro} className="lg:col-span-4" />
```

y

```tsx
        <ModuloAdn className="lg:col-span-2" />
```

Borrar la función `Placeholder`, el import de `Panel` y la línea `void cerebro;` (la prop ya se usa de verdad).

- [ ] **Step 4: Verificación visual**

En la home: El cerebro muestra el título de la última Orientación real del vault (`2026-06-07 - Sistema Tu Día completado` o más nueva), su "siguiente paso" (o el primer párrafo), 2 patrones de cada lado y 1 bullet por letra del FODA. ADN muestra la frase de Aristóteles sembrada en Task 8 + placeholder de imagen "Sin referencias aún". Si el Cerebro muestra el warning amber de GITHUB_TOKEN → revisar `.env.local` y reiniciar `npm run dev`.

- [ ] **Step 5: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/components/cockpit/modulo-cerebro.tsx src/components/cockpit/modulo-adn.tsx src/components/cockpit/cockpit-home.tsx
git commit -m "feat(frente-b): módulos Cerebro (vault GitHub) y ADN teaser — home completa"
```

---

### Task 16: Pantalla Actividad (`/actividad`) — feed completo con filtros + Realtime

**Files:**
- Create: `src/app/actividad/page.tsx`
- Create: `src/app/actividad/actividad-screen.tsx`

El feed completo de `eventos` (spec §4.6 — reemplaza al cockpit local 4317): últimos 100, filtrable por origen, actualizándose en vivo. Reusa `ORIGEN_TAG` exportado por `modulo-actividad.tsx` (Task 14).

- [ ] **Step 1: Crear `src/app/actividad/page.tsx`**

```tsx
import { ActividadScreen } from "./actividad-screen";

export default function ActividadPage() {
  return <ActividadScreen />;
}
```

- [ ] **Step 2: Crear `src/app/actividad/actividad-screen.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { ORIGEN_TAG } from "@/components/cockpit/modulo-actividad";
import type { EstadoEvento, Evento, OrigenEvento } from "@/types/centro-mando";

const ORIGENES: Array<"todos" | OrigenEvento> = [
  "todos",
  "whatsapp",
  "tablero",
  "daemon",
  "bot",
  "sistema",
];

const ESTADO_UI: Record<EstadoEvento, { label: string; cls: string }> = {
  procesado: { label: "Procesado", cls: "text-emerald-400" },
  pendiente_pregunta: { label: "Esperando respuesta", cls: "text-amber-300" },
  archivado: { label: "Archivado", cls: "text-red-400" },
  resuelto: { label: "Resuelto", cls: "text-cdm-taupe" },
};

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Feed Actividad completo (spec §4.6): todo lo que hizo bot, daemon, tablero y agentes. */
export function ActividadScreen() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [origen, setOrigen] = useState<"todos" | OrigenEvento>("todos");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    let q = supabase
      .from("eventos")
      .select("*")
      .order("creado_at", { ascending: false })
      .limit(100);
    if (origen !== "todos") q = q.eq("origen", origen);
    const { data, error } = await q;
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setEventos((data as Evento[]) ?? []);
    }
    setCargando(false);
  }, [origen]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  return (
    <div className="min-h-screen bg-cdm-bg px-4 py-8 text-cdm-fg sm:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-raleway text-xs uppercase tracking-[0.35em] text-cdm-taupe">
          Actividad
        </h1>
        <p className="mt-1 text-[11px] text-cdm-muted">
          Registro permanente: todo lo que hizo el bot, el daemon y el tablero.
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {ORIGENES.map((o) => (
            <button
              key={o}
              onClick={() => setOrigen(o)}
              className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                origen === o
                  ? "border-cdm-taupe bg-cdm-taupe text-cdm-bg"
                  : "border-cdm-line text-cdm-muted hover:text-cdm-fg"
              }`}
            >
              {o === "todos" ? "Todos" : o}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <p className="mt-6 text-[11px] text-cdm-muted">Cargando…</p>
        )}
        {!error && !cargando && eventos.length === 0 && (
          <p className="mt-6 text-[11px] text-cdm-muted">
            Sin eventos para este filtro.
          </p>
        )}

        <ul className="mt-4 border-t border-cdm-line">
          <AnimatePresence initial={false}>
            {eventos.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-baseline gap-3 border-b border-cdm-line px-1 py-2.5 text-[11px]"
              >
                <span className="shrink-0 tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
                <span className="shrink-0 border border-cdm-line px-1 text-[8px] uppercase tracking-widest text-cdm-taupe">
                  {ORIGEN_TAG[e.origen]}
                </span>
                <span className="min-w-0 flex-1 truncate text-cdm-fg/85">
                  {e.titulo}
                </span>
                {e.destino_tabla && (
                  <span className="hidden shrink-0 text-[9px] uppercase tracking-widest text-cdm-muted/70 sm:inline">
                    → {e.destino_tabla}
                  </span>
                )}
                <span
                  className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_UI[e.estado].cls}`}
                >
                  {ESTADO_UI[e.estado].label}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificación visual + Realtime**

Con `npm run dev` y sesión iniciada, abrir `http://localhost:3000/actividad`:

1. Lista los eventos sembrados en Task 14 (y el `[consulta] prueba…` de la barra) con fecha/hora, tag de origen, título y estado coloreado.
2. Chips de filtro: click en `whatsapp` → solo los de WhatsApp; `Todos` → vuelven todos.
3. Realtime: en el SQL Editor
   `insert into eventos (origen, tipo, estado, titulo) values ('daemon', 'precio_refrescado', 'procesado', 'Precios top-30 refrescados');`
   → la fila aparece arriba SIN refrescar, deslizándose.

- [ ] **Step 4: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/app/actividad/page.tsx src/app/actividad/actividad-screen.tsx
git commit -m "feat(frente-b): pantalla /actividad — feed completo de eventos con filtros y Realtime"
```

---

### Task 17: Pantalla Archivados (`/archivados`) — resolver con un click

**Files:**
- Create: `src/app/archivados/page.tsx`
- Create: `src/app/archivados/archivados-screen.tsx`

La UI del "nada se pierde" (spec §4.7): lista los eventos `archivado`, cada uno se expande a un formulario de resolución con los 6 destinos de la Task 7. El selector de obra (para gasto de obra) sale de `presupuestos` aprobados (mismo criterio que Control de gastos).

- [ ] **Step 1: Crear `src/app/archivados/page.tsx`**

```tsx
import { ArchivadosScreen } from "./archivados-screen";

export default function ArchivadosPage() {
  return <ArchivadosScreen />;
}
```

- [ ] **Step 2: Crear `src/app/archivados/archivados-screen.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import {
  DESTINOS_ARCHIVADO,
  textoDeEvento,
  type DestinoArchivado,
} from "@/lib/archivados-destinos";
import type { Evento } from "@/types/centro-mando";

type ObraOpcion = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
};

const DESTINO_LABEL: Record<DestinoArchivado, string> = {
  tarea: "Tarea",
  gasto_obra: "Gasto de obra",
  gasto_personal: "Gasto personal",
  filosofia: "Filosofía",
  referencia_estetica: "Ref. estética",
  descartar: "Descartar",
};

const CATEGORIAS_GASTO = [
  "Supermercado",
  "Delivery",
  "Salidas",
  "Combustible",
  "Farmacia",
  "Ropa",
  "Varios",
];

const INPUT_CLS =
  "font-raleway w-full border border-cdm-line bg-transparent px-3 py-2 text-xs text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-taupe focus:outline-none";

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FormResolver({
  evento,
  obras,
  onResuelto,
}: {
  evento: Evento;
  obras: ObraOpcion[];
  onResuelto: (id: string) => void;
}) {
  const [destino, setDestino] = useState<DestinoArchivado>("tarea");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [presupuestoId, setPresupuestoId] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/archivados/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento_id: evento.id,
          destino,
          monto: monto ? Number(monto) : undefined,
          categoria: categoria || undefined,
          presupuesto_id: presupuestoId || undefined,
          etiquetas: etiquetas
            ? etiquetas.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      onResuelto(evento.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  const pideMonto = destino === "gasto_obra" || destino === "gasto_personal";

  return (
    <form onSubmit={resolver} className="space-y-2 border-t border-cdm-line px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {DESTINOS_ARCHIVADO.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDestino(d)}
            className={`border px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] transition-colors ${
              destino === d
                ? "border-cdm-taupe bg-cdm-taupe text-cdm-bg"
                : "border-cdm-line text-cdm-muted hover:text-cdm-fg"
            }`}
          >
            {DESTINO_LABEL[d]}
          </button>
        ))}
      </div>

      {pideMonto && (
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Monto"
          data-no-spinner
          className={INPUT_CLS}
        />
      )}
      {destino === "gasto_obra" && (
        <select
          value={presupuestoId}
          onChange={(e) => setPresupuestoId(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Elegí la obra…</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre_obra || o.nombre_cliente || o.id.slice(0, 8)}
            </option>
          ))}
        </select>
      )}
      {destino === "gasto_personal" && (
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Categoría (Varios)</option>
          {CATEGORIAS_GASTO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {destino === "referencia_estetica" && (
        <input
          type="text"
          value={etiquetas}
          onChange={(e) => setEtiquetas(e.target.value)}
          placeholder="Etiquetas separadas por coma (tipografia, material…)"
          className={INPUT_CLS}
        />
      )}

      {error && (
        <p className="text-[10px] uppercase tracking-widest text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="font-raleway w-full border border-cdm-taupe px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-cdm-taupe transition-colors hover:bg-cdm-taupe hover:text-cdm-bg disabled:opacity-40"
      >
        {enviando ? "Resolviendo…" : destino === "descartar" ? "Descartar" : "Resolver"}
      </button>
    </form>
  );
}

/** UI Archivados (spec §4.7): nada se pierde — todo lo sin clasificar espera acá. */
export function ArchivadosScreen() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [obras, setObras] = useState<ObraOpcion[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [ev, ob] = await Promise.all([
      supabase
        .from("eventos")
        .select("*")
        .eq("estado", "archivado")
        .order("creado_at", { ascending: false }),
      supabase
        .from("presupuestos")
        .select("id, nombre_obra, nombre_cliente")
        .eq("presupuesto_aprobado", true)
        .order("created_at", { ascending: false }),
    ]);
    setEventos((ev.data as Evento[]) ?? []);
    setObras((ob.data as ObraOpcion[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  function quitarResuelto(id: string) {
    setEventos((es) => es.filter((e) => e.id !== id));
    setAbierto(null);
  }

  return (
    <div className="min-h-screen bg-cdm-bg px-4 py-8 text-cdm-fg sm:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-raleway text-xs uppercase tracking-[0.35em] text-cdm-taupe">
          Archivados
        </h1>
        <p className="mt-1 text-[11px] text-cdm-muted">
          Lo que el bot no pudo clasificar espera acá. Asignale un destino o descartalo —
          pérdida: cero.
        </p>

        {cargando && <p className="mt-8 text-[11px] text-cdm-muted">Cargando…</p>}
        {!cargando && eventos.length === 0 && (
          <p className="mt-8 text-[10px] uppercase tracking-widest text-cdm-muted">
            Nada sin clasificar. Pérdida: cero.
          </p>
        )}

        <AnimatePresence initial={false}>
          {eventos.map((e) => (
            <motion.div
              key={e.id}
              layout
              exit={{ opacity: 0, x: 24 }}
              className="mt-3 border border-cdm-line bg-cdm-panel"
            >
              <button
                onClick={() => setAbierto((a) => (a === e.id ? null : e.id))}
                className="flex w-full items-baseline gap-3 px-4 py-3 text-left"
              >
                <span className="h-1.5 w-1.5 shrink-0 self-center bg-red-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-cdm-fg">
                  {e.titulo}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
              </button>
              {abierto === e.id && (
                <>
                  <p className="border-t border-cdm-line px-4 py-2 text-[11px] text-cdm-muted">
                    “{textoDeEvento(e)}”
                  </p>
                  <FormResolver evento={e} obras={obras} onResuelto={quitarResuelto} />
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificación funcional end-to-end (resolver de verdad)**

Con `npm run dev` y sesión iniciada:

1. Abrir `http://localhost:3000/archivados` → aparece "Mensaje sin clasificar de prueba" (sembrado en Task 14) con su hora y punto rojo.
2. Click en la fila → se expande: texto fuente "acordate de pasar por lo de Oribe" + chips de los 6 destinos + botón Resolver.
3. Destino **Tarea** → Resolver → la fila sale deslizándose; el badge de la sidebar baja a 0; en la home, Pendientes muestra "acordate de pasar por lo de Oribe" (Realtime).
4. Sembrar otro y resolverlo como gasto personal:

```sql
insert into eventos (origen, tipo, estado, titulo, contenido) values
  ('whatsapp', 'nota', 'archivado', 'Otro mensaje sin clasificar', '{"texto": "nafta YPF 12500"}');
```

→ en `/archivados` aparece solo (Realtime). Resolver como **Gasto personal**, monto `12500`, categoría `Combustible` → en `/finanzas`, "nafta YPF 12500" aparece en últimos gastos.
5. Validación: sembrar un tercero igual y elegir **Gasto de obra** SIN monto → Resolver → muestra el error "monto requerido (> 0) para gasto de obra." sin marcar nada. Después descartarlo con **Descartar**.
6. Confirmar en `/actividad` que los eventos resueltos figuran con estado "Resuelto" y su `→ tabla` de destino.
7. Limpieza de lo creado en la verificación (SQL Editor):

```sql
delete from tareas where texto = 'acordate de pasar por lo de Oribe';
delete from gastos_personales where concepto = 'nafta YPF 12500';
delete from eventos where titulo in ('Otro mensaje sin clasificar');
```

(El evento "Mensaje sin clasificar de prueba" ya resuelto se limpia en la Task 19 junto con el resto de los seeds.)

- [ ] **Step 4: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/app/archivados/page.tsx src/app/archivados/archivados-screen.tsx
git commit -m "feat(frente-b): pantalla /archivados — resolver eventos a sus 6 destinos con un click"
```

---

### Task 18: Vista ADN (`/adn`) — moodboard filtrable + filosofía cronológica

**Files:**
- Create: `src/app/adn/page.tsx`
- Create: `src/app/adn/adn-screen.tsx`

La vista completa del ADN (spec §7.2): pestaña **Estética** = moodboard masonry de la tabla `referencias` (imágenes por signed URL de `/api/referencias`, filtrable por etiqueta) y pestaña **Filosofía** = frases en orden cronológico con fuente.

- [ ] **Step 1: Crear `src/app/adn/page.tsx`**

```tsx
import { AdnScreen } from "./adn-screen";

export default function AdnPage() {
  return <AdnScreen />;
}
```

- [ ] **Step 2: Crear `src/app/adn/adn-screen.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { Referencia } from "@/types/centro-mando";

type Vista = "estetica" | "filosofia";

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const CHIP_ACTIVO =
  "border-cdm-taupe bg-cdm-taupe text-cdm-bg";
const CHIP_IDLE =
  "border-cdm-line text-cdm-muted hover:text-cdm-fg";

/** Vista ADN (spec §7.2): el lineamiento estético y filosófico de Ravn, captura a captura. */
export function AdnScreen() {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [vista, setVista] = useState<Vista>("estetica");
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/referencias?limit=200", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el ADN.");
        return;
      }
      setError(null);
      setReferencias(j.referencias ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const esteticas = useMemo(
    () => referencias.filter((r) => r.tipo === "estetica"),
    [referencias]
  );
  const filosofia = useMemo(
    () => referencias.filter((r) => r.tipo === "filosofia"),
    [referencias]
  );
  const etiquetas = useMemo(() => {
    const s = new Set<string>();
    for (const r of esteticas) for (const e of r.etiquetas ?? []) s.add(e);
    return [...s].sort();
  }, [esteticas]);
  const filtradas = etiqueta
    ? esteticas.filter((r) => (r.etiquetas ?? []).includes(etiqueta))
    : esteticas;

  return (
    <div className="min-h-screen bg-cdm-bg px-4 py-8 text-cdm-fg sm:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-raleway text-xs uppercase tracking-[0.35em] text-cdm-taupe">
          ADN
        </h1>
        <p className="mt-1 text-[11px] text-cdm-muted">
          La filosofía y la estética de Ravn construyéndose solas, captura a captura.
        </p>

        <div className="mt-6 flex gap-2">
          {(["estetica", "filosofia"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`border px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
                vista === v ? CHIP_ACTIVO : CHIP_IDLE
              }`}
            >
              {v === "estetica"
                ? `Estética (${esteticas.length})`
                : `Filosofía (${filosofia.length})`}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <p className="mt-6 text-[11px] text-cdm-muted">Cargando…</p>
        )}

        {!error && !cargando && vista === "estetica" && (
          <>
            {etiquetas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setEtiqueta(null)}
                  className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                    etiqueta === null ? CHIP_ACTIVO : CHIP_IDLE
                  }`}
                >
                  Todas
                </button>
                {etiquetas.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEtiqueta(e)}
                    className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                      etiqueta === e ? CHIP_ACTIVO : CHIP_IDLE
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {filtradas.length === 0 ? (
              <p className="mt-8 text-[11px] text-cdm-muted">
                Mandale una foto al bot — acá nace el moodboard.
              </p>
            ) : (
              <div className="mt-6 columns-2 gap-3 md:columns-3 xl:columns-4">
                {filtradas.map((r, i) => (
                  <motion.figure
                    key={r.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.6) }}
                    className="mb-3 break-inside-avoid border border-cdm-line bg-cdm-panel"
                  >
                    {r.imagen_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.imagen_url}
                        alt={r.texto ?? "Referencia estética"}
                        className="w-full"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center border-b border-cdm-line">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                          Sin imagen
                        </span>
                      </div>
                    )}
                    <figcaption className="px-3 py-2">
                      {r.texto && (
                        <p className="text-[11px] leading-snug text-cdm-fg/85">{r.texto}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {(r.etiquetas ?? []).map((e) => (
                          <button
                            key={e}
                            onClick={() => setEtiqueta(e)}
                            className="border border-cdm-line px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-cdm-taupe transition-colors hover:bg-cdm-taupe hover:text-cdm-bg"
                          >
                            {e}
                          </button>
                        ))}
                        <span className="ml-auto text-[9px] tabular-nums text-cdm-muted">
                          {fmtFecha(r.creado_at)}
                        </span>
                      </div>
                    </figcaption>
                  </motion.figure>
                ))}
              </div>
            )}
          </>
        )}

        {!error && !cargando && vista === "filosofia" && (
          <div className="mx-auto mt-8 max-w-2xl space-y-6">
            {filosofia.length === 0 && (
              <p className="text-[11px] text-cdm-muted">
                Mandale una frase al bot — acá nace la filosofía.
              </p>
            )}
            {filosofia.map((r, i) => (
              <motion.blockquote
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.6) }}
                className="border-l-2 border-cdm-taupe pl-4"
              >
                <p className="text-sm italic leading-relaxed text-cdm-fg/90">
                  “{r.texto}”
                </p>
                <footer className="mt-1.5 text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
                  {r.fuente ? `${r.fuente} · ` : ""}
                  {fmtFecha(r.creado_at)}
                </footer>
              </motion.blockquote>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verificación visual**

Con `npm run dev` y sesión iniciada, abrir `http://localhost:3000/adn`:

1. Pestaña Estética: la referencia "Tipografía serif grabada en hormigón" (seed de Task 8) con placeholder "Sin imagen", sus etiquetas `tipografia` y `material` como chips, y su fecha.
2. Chips de filtro arriba: `Todas / material / tipografia`. Click en `material` → queda solo esa; `Todas` → vuelven.
3. Pestaña Filosofía: la frase de Aristóteles con fuente y fecha, entrando con reveal.
4. (Opcional, prueba de imagen real) Dashboard → Storage → bucket `referencias` → subir un JPG → `update referencias set imagen_path = '<path-subido>' where texto = 'Tipografía serif grabada en hormigón';` → recargar `/adn` → la imagen se ve (signed URL del bucket privado). Verificar que la URL de la imagen NO funciona en una ventana sin la firma (pegarla recortando el `?token=` → error).

- [ ] **Step 4: Verificar tipos y commit**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
git add src/app/adn/page.tsx src/app/adn/adn-screen.tsx
git commit -m "feat(frente-b): vista ADN — moodboard filtrable por etiqueta + filosofía cronológica"
```

---

### Task 19: Verificación integral, build, limpieza de seeds y cierre

**Files:** ninguno nuevo (verificación + limpieza).

- [ ] **Step 1: Suite completa de tests**

```bash
cd /Users/ezeotero/Documents/ravn && npm test
```

Expected: TODO verde. De este frente: `vault-parse` (11), `trabajos-validate` (6), `comando-inline` (5), `archivados-destinos` (12). Además los heredados: `zona-slug` y, si Frente A corrió, `precio-por-margen-neto` (21) y `cashflow-compute` (19). 0 failed.

- [ ] **Step 2: Tipos y build de producción**

```bash
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit && npm run build
```

Expected: `tsc` exit 0 y el build termina con `✓ Compiled successfully`, listando entre las rutas: `/` , `/actividad`, `/archivados`, `/adn`, `/api/trabajos`, `/api/referencias`, `/api/archivados/resolver` (más todas las existentes). Nota: la home usa `revalidate = 300` y `getCerebro()` no lanza (devuelve `error` adentro del objeto), así que el build no falla aunque falte `GITHUB_TOKEN`.

- [ ] **Step 3: Checklist visual final (cumple spec §4 y §10)**

Con `npm run dev` y sesión iniciada:

1. **Home cockpit:** una pantalla negra `#0a0a0a` SIN scroll de página en desktop; barra de comando arriba; los 9 módulos vivos (Obras, Plata, Pendientes, Cotizaciones, Actividad, Archivados, El cerebro, ADN) con reveal escalonado.
2. **Barra de comando:** orden nueva → fila con punto taupe latiendo → cambio de estado por SQL se refleja sin refrescar (Realtime); "anotá X" → confirmación verde y la tarea aparece en Pendientes SIN tocar `trabajos_cola`.
3. **Carcasa:** `/historial`, `/cashflow`, `/finanzas`, `/catalogo` intactas adentro de la sidebar; ítem activo con barrita taupe animada; badge de Archivados en vivo.
4. **Sin carcasa:** `/login`, `/propuesta/<id>` y `/remito/<id>` se renderizan limpias (el PDF de propuesta NO cambió: abrir una propuesta existente e imprimir a PDF para confirmar).
5. **Cero border-radius** en todo lo nuevo y tipografía Raleway en headers (inspección visual).
6. **Pantallas nuevas:** `/actividad` filtra y vive; `/archivados` resuelve a los 6 destinos; `/adn` muestra moodboard + filosofía.

- [ ] **Step 4: Limpiar TODOS los datos de prueba sembrados por este plan**

SQL Editor (el orden importa: `referencias.evento_id` referencia a `eventos`):

```sql
delete from referencias
 where fuente = 'Aristóteles'
    or texto = 'Tipografía serif grabada en hormigón'
    or fuente = 'archivados';

delete from trabajos_cola
 where prompt in ('prueba de cola desde el plan', 'prueba desde la barra');

delete from eventos
 where titulo in (
   'Mensaje sin clasificar de prueba',
   'Gasto registrado: arena x3 m3',
   'Cotización baño Pilar lista para revisión',
   'Precios top-30 refrescados'
 )
    or titulo like '[consulta] prueba%';

delete from cotizaciones where titulo = 'Baño completo — Pilar';

delete from tareas where texto in ('probar módulo pendientes', 'llamar a Oribe');
```

Expected: `Success` en cada delete. Verificar en la home que Actividad/Cotizaciones/Archivados quedan con datos reales (o vacíos con su estado vacío).

- [ ] **Step 5: Variables de producción en Vercel (antes del merge)**

En el proyecto Vercel `ravn-app-one` → Settings → Environment Variables, confirmar/crear:

- `GITHUB_TOKEN` (el de la Task 5, lectura de contents de `boveda`)
- `VAULT_GITHUB_REPO` = `ravnconstrucciones/boveda` (mismo nombre de variable que usa el bot del Frente C)

Sin esto el módulo Cerebro en producción muestra el aviso "Falta GITHUB_TOKEN" (no rompe, pero queda vacío).

- [ ] **Step 6: Commit final y push de la rama**

```bash
cd /Users/ezeotero/Documents/ravn
git status --short   # debe estar limpio; si quedó algo suelto, commitearlo con su tarea
git push -u origin frente-b-carcasa-home
```

Expected: rama publicada. **NO mergear a `main` en esta tarea:** el merge deploya a Vercel y conviene coordinarlo con Eze (y con el estado del Frente A en producción). Avisar: "Frente B listo en rama `frente-b-carcasa-home`, verificado local — ¿mergeamos?".

---

## Autorrevisión contra el spec (hecha al escribir el plan)

- §4 carcasa + navegación nueva envolviendo pantallas existentes → Tasks 2, 10 (tokens `cdm-*`, AppShell con sidebar, exclusión `/login`, `/propuesta`, `/remito`, `/landing`).
- §4.1 barra de comando → `trabajos_cola` + progreso Realtime, y "resolver inline lo simple" con UN caso en esta tanda ("anotá …" → tarea directa, con test) → Tasks 3, 6, 11. Resto de los casos inline: tanda futura declarada en la duda 8.
- §4.2 Obras con **estado** (`finalizada_at`/`cobranza_cerrada_at`), **margen al día** (propuesta − gastado real) y último gasto → Task 12 (extensión de `/cashflow/resumen` + módulo).
- §4.3 Plata con **cashflow del mes** (`caja_mes`), **gastos de hoy obra + personales** (`gastos_obra_hoy_ars` + `/api/finanzas`) y semáforo → Task 12.
- §4.4 Pendientes (CRUD `tareas`) → Task 13.
- §4.5 Cotizaciones solo lectura (pantallas de detalle = Frente D) → Task 14.
- §4.6 Actividad (módulo + feed completo) → Tasks 14, 16.
- §4.7 Archivados con badge + resolver a destino (6 destinos: gasto de obra, gasto personal, tarea, filosofía, referencia estética, descartar) → Tasks 7, 10, 14, 17.
- §4.8 El cerebro (Orientación + Patrones + FODA del vault, caché ~5 min) → Tasks 4, 5, 15.
- §4.9 + §7.2 ADN (teaser + vista completa con moodboard filtrable y signed URLs del bucket privado) → Tasks 8, 15, 18.
- §10 estética obligatoria (paleta, Raleway, cero radius, ui-ux-pro-max + 21st.dev + Framer Motion) → Task 1 (skill primero) y todos los componentes.
- TDD en la lógica con decisión: `vault-parse`, `trabajos-validate`, `comando-inline`, `archivados-destinos` (34 tests propios).
- Verificación integral + build + limpieza de seeds → Task 19.

## Dudas abiertas (para Eze / otros frentes)

1. **`/cotizaciones` es del Frente D:** la nav de la carcasa no la incluye todavía y el módulo Cotizaciones no linkea detalle. Cuando D cree sus pantallas, agregar `{ href: "/cotizaciones", label: "Cotizaciones" }` a `NAV_COCKPIT` en `app-shell.tsx`.
2. **`GITHUB_TOKEN` / `VAULT_GITHUB_REPO` son variables nuevas para la app** (local + Vercel). `VAULT_GITHUB_REPO` usa el MISMO nombre que el bot del Frente C (decisión tomada: un solo nombre para el mismo concepto). El valor (`ravnconstrucciones/boveda`) se tomó del plan del Frente C — confirmar el owner real del repo antes de la Task 5; si difiere, ajustar el valor de la variable (el código ya lo lee de env).
3. **Resolver "gasto de obra" inserta solo en `presupuestos_gastos`**, sin espejo en `cashflow_items` (la pantalla de gastos de obra SÍ crea el espejo cuando la obra tiene cashflow). Es el mismo criterio que usa el bot (plan C). Confirmar con Eze si Archivados debe crear el espejo también.
4. **Realtime a nivel proyecto:** la migración de la Task 3 agrega `cotizaciones` a la publicación (`eventos` y `trabajos_cola` son del plan A), pero si Realtime está apagado en el dashboard (Database → Replication) hay que prenderlo a mano. Si Frente A corre después que esta migración, re-ejecutar el SQL de la Task 3 (es idempotente).
5. **Dependencia del Frente A:** este plan asume el estado post-A (tablas del contrato + RLS + Vitest). Todo compila y los tests pasan sin la base, pero las verificaciones funcionales (barra, archivados, ADN) necesitan las tablas en producción.
6. **RLS de `tareas`:** el CRUD del módulo Pendientes depende de que el usuario de Eze (authenticated, no-bot) conserve update/delete según las policies del plan A (`*_no_bot`). Si la Task de RLS de `tareas` del Frente A cambiara, revisar este módulo.
7. **Raleway 900** se baja de jsdelivr (Task 1); si el CDN falla se sigue con 700 — anotarlo al cierre si pasó.
8. **Casos inline restantes de la barra (spec §4.1) — tanda futura, declarada a propósito:** esta tanda implementa SOLO "anotá/anota X" → tarea directa (Task 11, `comando-inline.ts`). Quedan para una tanda posterior: "qué gasté hoy" → respuesta inmediata con datos de `/api/finanzas` + `gastos_obra_hoy_ars`, registrar un gasto por texto ("gasté 12500 en nafta"), y cualquier otro atajo que no necesite al daemon. El parser `parseComandoInline` ya devuelve un union extensible (`accion: "tarea"` hoy) para sumarlos sin tocar la CommandBar más que en el switch del caso.



