# Mesa de cotización conversacional — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la mesa de revisión en una mesa de cotización conversacional: chat con Fable + Codex (corriendo locales en la Mac de Eze, cero API paga), rubros llenándose en vivo, propuesta A4 redactándose sola y fotos por drag & drop.

**Architecture:** La app (Vercel) es la cara; un proceso nuevo `puente-cotizador` (launchd en la Mac) escucha `cotizacion_mensajes` por Supabase Realtime, corre `claude -p --resume` (sesión por cotización) y `codex exec` para búsquedas, y escribe las respuestas a la misma tabla. Fable toca la cotización SOLO vía las APIs de la app (curl con secret de agente) — las dos leyes intactas: el código suma, nunca inventar.

**Tech Stack:** Next.js 15 + Supabase (existente), Tailwind v4 + Framer Motion + tokens `cdm-*` (existente), tsx + @supabase/supabase-js para el puente (sin dependencias nuevas), Claude Code CLI y Codex CLI ya instalados.

**Spec:** `docs/superpowers/specs/2026-07-25-mesa-cotizacion-conversacional-design.md`

## Global Constraints

- **Ley 1 — nunca inventar**: ítem sin precio → `sin_precio: true`, hueco visible, jamás $0.
- **Ley 2 — el código suma, la IA no**: toda mutación del desglose pasa por `PATCH /api/cotizaciones/[id]/desglose` (re-corre `cotizar()` server-side). El chat jamás emite documentos.
- **`.ravn/02_AI_RULES.md` rige**: nunca editar migraciones aplicadas; cambios de esquema = migración nueva; no duplicar lógica; sin dependencias nuevas injustificadas; español en archivos, funciones y comentarios.
- **Estética**: tokens `cdm-*` / Liquid Glass / Framer Motion / `lucide-react`, como el resto del cotizador. Los mockups del brainstorm NO definen estética (pedido explícito de Eze). Antes de la tanda UI (Tareas 7–9) invocar el skill `ui-ux-pro-max`.
- **Compatibilidad**: el flujo daemon existente (`trabajos_cola` tipo `cotizar`, ruta `/conversacion`) NO se toca. Lo nuevo se suma.
- **Tests**: `npm run test` (vitest, include `src/**/*.test.ts`). Build: `npm run build`. Commits frecuentes, mensajes en español estilo repo (`feat: …`, `fix: …`).
- **Deploy**: prod = proyecto Vercel `ravn-app-one` (NO el decoy `ravn-app`). Push a `home-cards` = solo Preview → requiere `vercel promote`.
- Cerrar cada tarea con su commit. Al final: actualizar docs `.ravn/` afectados + ADR.

---

### Task 1: Migración — `cotizacion_mensajes`, `puente_latidos`, `en_propuesta`

**Files:**
- Create: `supabase/migrations/20260725120000_mesa_conversacional.sql`

**Interfaces:**
- Produces: tabla `cotizacion_mensajes` (id uuid, cotizacion_id uuid FK, autor text, texto text, adjuntos jsonb, meta jsonb, creado_at timestamptz) publicada en Realtime; tabla `puente_latidos` (id text PK, visto_at timestamptz); columna `cotizacion_archivos.en_propuesta boolean`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Mesa de cotización conversacional (spec 2026-07-25).
-- Hilo nuevo a tres voces + latido del puente local + foto marcada para la propuesta.

create table public.cotizacion_mensajes (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  autor text not null check (autor in ('eze', 'fable', 'codex', 'sistema')),
  texto text not null default '',
  -- adjuntos: [{ archivo_id, storage_path, titulo }] — fotos soltadas en la mesa.
  adjuntos jsonb not null default '[]'::jsonb,
  -- meta: { tipo: 'charla'|'busqueda'|'aviso'|'adjuntos', respuesta_a: uuid, fuentes: [...] }
  meta jsonb not null default '{}'::jsonb,
  creado_at timestamptz not null default now()
);

create index cotizacion_mensajes_cot_idx
  on public.cotizacion_mensajes (cotizacion_id, creado_at);
-- El puente chequea "¿ya respondí este mensaje?" por meta->>'respuesta_a'.
create index cotizacion_mensajes_respuesta_idx
  on public.cotizacion_mensajes ((meta ->> 'respuesta_a'));

alter table public.cotizacion_mensajes enable row level security;

-- La app lee con el usuario autenticado (Realtime + selects del browser);
-- escribe siempre vía API routes con service role (mismo patrón del módulo).
create policy "mensajes select autenticado"
  on public.cotizacion_mensajes for select to authenticated using (true);

alter publication supabase_realtime add table public.cotizacion_mensajes;

-- Latido del puente-cotizador: una fila por proceso, upsert cada 30 s.
create table public.puente_latidos (
  id text primary key,
  visto_at timestamptz not null default now()
);

alter table public.puente_latidos enable row level security;
create policy "latidos select autenticado"
  on public.puente_latidos for select to authenticated using (true);

-- Foto marcada para salir en la propuesta (pestaña Fotos de la mesa).
alter table public.cotizacion_archivos
  add column en_propuesta boolean not null default false;
```

- [ ] **Step 2: Aplicar la migración**

Aplicar con el MCP de Supabase (`mcp__supabase__apply_migration`, name `mesa_conversacional`, con el SQL de arriba) — mismo contenido que el archivo del repo. Si el MCP no está disponible: `npx supabase db push`.

- [ ] **Step 3: Verificar**

Con `mcp__supabase__list_tables` (o `select * from cotizacion_mensajes limit 1;` vía `execute_sql`): existen `cotizacion_mensajes` y `puente_latidos`, y `cotizacion_archivos` tiene `en_propuesta`. Verificar publicación: `select * from pg_publication_tables where pubname='supabase_realtime' and tablename='cotizacion_mensajes';` → 1 fila.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260725120000_mesa_conversacional.sql
git commit -m "feat: tablas de la mesa conversacional (mensajes, latidos, en_propuesta)"
```

---

### Task 2: Hilo a tres voces — lógica pura

**Files:**
- Modify: `src/lib/cotizador/conversacion.ts`
- Test: `src/lib/cotizador/conversacion-mensajes.test.ts` (nuevo)

**Interfaces:**
- Consumes: tipos existentes `MensajeHilo`, `construirHilo` (no se tocan sus firmas).
- Produces: `AutorMensaje = "eze" | "sistema" | "fable" | "codex"` (ampliado); `MensajeNuevoRow` (fila de `cotizacion_mensajes`); `mensajesDeTabla(filas: MensajeNuevoRow[]): MensajeHilo[]`; `mezclarHilos(...hilos: MensajeHilo[][]): MensajeHilo[]`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// src/lib/cotizador/conversacion-mensajes.test.ts
import { describe, expect, it } from "vitest";
import {
  mensajesDeTabla,
  mezclarHilos,
  type MensajeHilo,
  type MensajeNuevoRow,
} from "./conversacion";

function fila(sobre: Partial<MensajeNuevoRow>): MensajeNuevoRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    autor: "eze",
    texto: "hola",
    adjuntos: [],
    meta: {},
    creado_at: "2026-07-25T10:00:00Z",
    ...sobre,
  };
}

describe("mensajesDeTabla", () => {
  it("mapea autor, texto y etiqueta por meta.tipo", () => {
    const [m] = mensajesDeTabla([
      fila({ autor: "codex", texto: "micro $19-22k", meta: { tipo: "busqueda" } }),
    ]);
    expect(m.autor).toBe("codex");
    expect(m.texto).toBe("micro $19-22k");
    expect(m.etiqueta).toBe("busqueda");
    expect(m.id).toBe("m-11111111-1111-1111-1111-111111111111");
  });

  it("autor desconocido cae a sistema y sin meta.tipo etiqueta charla", () => {
    const [m] = mensajesDeTabla([fila({ autor: "marciano", meta: {} })]);
    expect(m.autor).toBe("sistema");
    expect(m.etiqueta).toBe("charla");
  });

  it("mensaje sin texto pero con adjuntos describe las fotos", () => {
    const [m] = mensajesDeTabla([
      fila({ texto: "", adjuntos: [{ archivo_id: "a" }, { archivo_id: "b" }] }),
    ]);
    expect(m.texto).toBe("2 fotos del proyecto");
  });

  it("descarta filas sin texto ni adjuntos", () => {
    expect(mensajesDeTabla([fila({ texto: "  ", adjuntos: [] })])).toHaveLength(0);
  });
});

describe("mezclarHilos", () => {
  it("mezcla y ordena por fecha", () => {
    const a: MensajeHilo[] = [
      { id: "1", fecha: "2026-07-25T12:00:00Z", autor: "eze", texto: "b", etiqueta: "x" },
    ];
    const b: MensajeHilo[] = [
      { id: "2", fecha: "2026-07-25T11:00:00Z", autor: "fable", texto: "a", etiqueta: "y" },
    ];
    expect(mezclarHilos(a, b).map((m) => m.id)).toEqual(["2", "1"]);
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `npm run test -- conversacion-mensajes`
Expected: FAIL — `mensajesDeTabla` no existe.

- [ ] **Step 3: Implementar en `conversacion.ts`**

Cambiar la línea 10 (`export type AutorMensaje = "eze" | "sistema";`) por la unión ampliada y agregar al final del archivo:

```ts
export type AutorMensaje = "eze" | "sistema" | "fable" | "codex";
```

```ts
/** Fila de cotizacion_mensajes tal como la lee la API (hilo nuevo, mesa conversacional). */
export type MensajeNuevoRow = {
  id: string;
  autor: string;
  texto: string;
  adjuntos: unknown;
  meta: Record<string, unknown> | null;
  creado_at: string;
};

const AUTORES_VALIDOS: ReadonlyArray<AutorMensaje> = ["eze", "sistema", "fable", "codex"];

/** Mapea filas de cotizacion_mensajes al formato del hilo. Autor raro cae a sistema. */
export function mensajesDeTabla(filas: MensajeNuevoRow[]): MensajeHilo[] {
  const out: MensajeHilo[] = [];
  for (const f of filas) {
    const adjuntos = Array.isArray(f.adjuntos) ? f.adjuntos.length : 0;
    if (!esTexto(f.texto) && adjuntos === 0) continue;
    const autor = (AUTORES_VALIDOS as readonly string[]).includes(f.autor)
      ? (f.autor as AutorMensaje)
      : "sistema";
    const tipo = f.meta?.["tipo"];
    out.push({
      id: `m-${f.id}`,
      fecha: f.creado_at,
      autor,
      texto: esTexto(f.texto)
        ? f.texto
        : `${adjuntos} foto${adjuntos === 1 ? "" : "s"} del proyecto`,
      etiqueta: esTexto(tipo) ? tipo : "charla",
    });
  }
  return out;
}

/** Mezcla el hilo legacy (trabajos+eventos) con el nuevo (tabla) en una línea de tiempo. */
export function mezclarHilos(...hilos: MensajeHilo[][]): MensajeHilo[] {
  return hilos.flat().sort((a, b) => a.fecha.localeCompare(b.fecha));
}
```

- [ ] **Step 4: Correr los tests**

Run: `npm run test -- conversacion`
Expected: PASS (los nuevos Y los existentes de `construirHilo` — no se rompió nada).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/conversacion.ts src/lib/cotizador/conversacion-mensajes.test.ts
git commit -m "feat: hilo a tres voces (fable/codex) — mensajesDeTabla + mezclarHilos"
```

---

### Task 3: API `/api/cotizaciones/[id]/mensajes`

**Files:**
- Create: `src/app/api/cotizaciones/[id]/mensajes/route.ts`

**Interfaces:**
- Consumes: `mensajesDeTabla`, `mezclarHilos`, `construirHilo` (Task 2); tablas de Task 1.
- Produces:
  - `GET` → `{ mensajes: MensajeHilo[], motor_conectado: boolean }` (hilo legacy + tabla nueva mezclados; `motor_conectado` = latido `puente-cotizador` < 90 s).
  - `POST { texto?: string, adjuntos?: Array<{archivo_id: string, storage_path: string, titulo?: string}> }` → `{ ok: true, id }`. Con `texto` → autor `eze`, meta `{tipo:'charla'}`. Solo `adjuntos` → autor `sistema`, meta `{tipo:'adjuntos'}`.
- La ruta vieja `/conversacion` NO se toca (compatibilidad con el flujo daemon).

- [ ] **Step 1: Implementar la ruta**

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  construirHilo,
  mensajesDeTabla,
  mezclarHilos,
  type EventoHilo,
  type MensajeNuevoRow,
  type TrabajoHilo,
} from "@/lib/cotizador/conversacion";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Latido más viejo que esto = motor desconectado (el puente late cada 30 s). */
const LATIDO_MAX_MS = 90_000;

/**
 * Hilo de la MESA CONVERSACIONAL (spec 2026-07-25): mezcla el hilo legacy
 * (trabajos_cola + eventos, construirHilo) con la tabla nueva
 * cotizacion_mensajes (tres voces: eze/fable/codex/sistema).
 * La ruta hermana /conversacion queda intacta para el flujo daemon.
 */
export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id, trabajo_id")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const filtroTrabajos = [
    `contexto->>cotizacion_anterior.eq.${id}`,
    `contexto->>cotizacion_id.eq.${id}`,
    ...(cot.trabajo_id ? [`id.eq.${cot.trabajo_id}`] : []),
  ].join(",");

  const [trabajosR, eventosR, nuevosR, latidoR] = await Promise.all([
    sb
      .from("trabajos_cola")
      .select("id, creado_at, actualizado_at, tipo, origen, estado, prompt, contexto, resultado")
      .or(filtroTrabajos)
      .order("creado_at", { ascending: true })
      .limit(500),
    sb
      .from("eventos")
      .select("id, creado_at, origen, tipo, titulo, contenido, destino_id")
      .or(`destino_id.eq.${id},contenido->>cotizacion_id.eq.${id}`)
      .order("creado_at", { ascending: true })
      .limit(200),
    sb
      .from("cotizacion_mensajes")
      .select("id, autor, texto, adjuntos, meta, creado_at")
      .eq("cotizacion_id", id)
      .order("creado_at", { ascending: true })
      .limit(500),
    sb.from("puente_latidos").select("visto_at").eq("id", "puente-cotizador").maybeSingle(),
  ]);

  const err = trabajosR.error ?? eventosR.error ?? nuevosR.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const legacy = construirHilo({
    trabajoOrigenId: cot.trabajo_id,
    trabajos: (trabajosR.data ?? []) as TrabajoHilo[],
    eventos: (eventosR.data ?? []) as EventoHilo[],
  });
  const nuevos = mensajesDeTabla((nuevosR.data ?? []) as MensajeNuevoRow[]);

  const vistoAt = latidoR.data?.visto_at ? new Date(latidoR.data.visto_at).getTime() : 0;
  const motor_conectado = Date.now() - vistoAt < LATIDO_MAX_MS;

  return NextResponse.json({ mensajes: mezclarHilos(legacy, nuevos), motor_conectado });
}

type Adjunto = { archivo_id: string; storage_path: string; titulo?: string };

export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    texto?: string;
    adjuntos?: Adjunto[];
  };
  const texto = String(body.texto ?? "").trim();
  const adjuntos = Array.isArray(body.adjuntos)
    ? body.adjuntos.filter((a) => a && typeof a.archivo_id === "string")
    : [];
  if (!texto && adjuntos.length === 0) {
    return NextResponse.json({ error: "texto o adjuntos requeridos." }, { status: 400 });
  }
  if (texto.length > 4000) {
    return NextResponse.json({ error: "texto demasiado largo (máx. 4000)." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  // Texto de Eze → charla que el puente responde. Solo fotos → mensaje de
  // sistema: informa al puente por el mismo canal Realtime (spec §Fotos).
  const fila =
    texto.length > 0
      ? { cotizacion_id: id, autor: "eze", texto, adjuntos, meta: { tipo: "charla" } }
      : { cotizacion_id: id, autor: "sistema", texto: "", adjuntos, meta: { tipo: "adjuntos" } };

  const { data, error } = await sb
    .from("cotizacion_mensajes")
    .insert(fila)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: compila sin errores de tipos.

- [ ] **Step 3: Prueba manual rápida**

Con la app corriendo (`npm run dev`) y logueado, en la consola del browser:

```js
const id = "<id de una cotización existente>";
await (await fetch(`/api/cotizaciones/${id}/mensajes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: "prueba mesa" }) })).json();
await (await fetch(`/api/cotizaciones/${id}/mensajes`)).json();
```

Expected: el POST devuelve `{ok:true, id}`; el GET trae el mensaje con `autor:"eze"` mezclado con el hilo legacy y `motor_conectado:false`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/cotizaciones/[id]/mensajes/route.ts"
git commit -m "feat: API de mensajes de la mesa conversacional (hilo mezclado + latido)"
```

---

### Task 4: La mesa funciona en estado `borrador`

**Files:**
- Modify: `src/lib/cotizador/estado.ts` (aprobar/rechazar desde `borrador`)
- Modify: `src/app/api/cotizaciones/[id]/desglose/route.ts` (guard de estado)
- Modify: `src/app/api/cotizaciones/[id]/aprobar/route.ts` y `src/app/api/cotizaciones/[id]/rechazar/route.ts` (guard de carrera)
- Test: `src/lib/cotizador/estado.test.ts` (agregar casos; si no existe, crearlo)

**Interfaces:**
- Consumes: `EstadoCotizacion` ya incluye `"borrador"` en `tipos.ts:305-310` (no hay cambio de tipos).
- Produces: `aprobar(estado, …)` y `rechazar(estado, …)` aceptan `"borrador"` además de `"en_revision"`; el PATCH de desglose edita en ambos estados.

- [ ] **Step 1: Tests que fallan**

Agregar a `src/lib/cotizador/estado.test.ts` (crear el archivo con estos imports si no existe):

```ts
import { describe, expect, it } from "vitest";
import { aprobar, rechazar, TransicionInvalida } from "./estado";

describe("mesa en borrador (spec 2026-07-25)", () => {
  it("aprobar desde borrador funciona", () => {
    const r = aprobar("borrador", null, 1000);
    expect(r.estado).toBe("aprobada");
    expect(r.revision.aprobacion?.importe_final).toBe(1000);
  });
  it("rechazar desde borrador funciona", () => {
    expect(rechazar("borrador", "no va").estado).toBe("rechazada");
  });
  it("aprobar desde aprobada sigue prohibido", () => {
    expect(() => aprobar("aprobada", null)).toThrow(TransicionInvalida);
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `npm run test -- estado`
Expected: FAIL — `TransicionInvalida` en los dos primeros.

- [ ] **Step 3: Implementar en `estado.ts`**

Agregar arriba de `aprobar` y reemplazar los guards de `aprobar` (línea 27) y `rechazar` (línea 47):

```ts
/** La mesa (spec 2026-07-25) opera en borrador Y en_revision. */
const ESTADOS_MESA: ReadonlyArray<EstadoCotizacion> = ["borrador", "en_revision"];
```

```ts
  if (!ESTADOS_MESA.includes(estado)) throw new TransicionInvalida(estado, "aprobar");
```

```ts
  if (!ESTADOS_MESA.includes(estado)) throw new TransicionInvalida(estado, "rechazar");
```

Actualizar el comentario del bloque (líneas 18-21) a: `Estados: borrador | en_revision → aprobada → documento_emitido | rechazada.`

- [ ] **Step 4: Guard del desglose**

En `desglose/route.ts:89`, reemplazar:

```ts
  if (cotizacion.estado !== "en_revision") {
```

por:

```ts
  if (cotizacion.estado !== "en_revision" && cotizacion.estado !== "borrador") {
```

(ajustar el mensaje de error del JSON que sigue para que diga `"La hoja viva solo edita en borrador o en revisión"`).

- [ ] **Step 5: Guards de carrera en aprobar/rechazar**

Leer `aprobar/route.ts` y `rechazar/route.ts`: donde el update usa `.eq("estado", "en_revision")` como guard de carrera, reemplazar por `.in("estado", ["borrador", "en_revision"])`. No tocar nada más de esas rutas.

- [ ] **Step 6: Tests + build**

Run: `npm run test && npm run build`
Expected: PASS y compila.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cotizador/estado.ts src/lib/cotizador/estado.test.ts "src/app/api/cotizaciones/[id]/desglose/route.ts" "src/app/api/cotizaciones/[id]/aprobar/route.ts" "src/app/api/cotizaciones/[id]/rechazar/route.ts"
git commit -m "feat: la mesa opera en borrador (aprobar/rechazar/editar desglose)"
```

---

### Task 5: Acceso de agentes por secret (`x-ravn-agente`)

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Produces: requests a `/api/*` con header `x-ravn-agente: $RAVN_AGENTE_SECRET` pasan sin sesión. Lo usa Fable (curl desde la Mac) para `PATCH /desglose`, `PATCH /documento-borrador`, etc.

- [ ] **Step 1: Modificar el middleware**

Al principio de `export async function middleware(request: NextRequest)` (antes de crear el client de Supabase), insertar:

```ts
  // Agentes locales (puente-cotizador): secret compartido SOLO para /api/*.
  // Sin secret configurado en el entorno, el bypass no existe.
  const claveAgente = request.headers.get("x-ravn-agente");
  if (
    request.nextUrl.pathname.startsWith("/api/") &&
    claveAgente &&
    process.env.RAVN_AGENTE_SECRET &&
    claveAgente === process.env.RAVN_AGENTE_SECRET
  ) {
    return NextResponse.next({ request });
  }
```

- [ ] **Step 2: Generar el secret y configurarlo**

```bash
openssl rand -hex 32   # copiar el valor
```

Agregar `RAVN_AGENTE_SECRET=<valor>` a `.env.local` Y en Vercel (proyecto `ravn-app-one`, Production + Preview): `vercel env add RAVN_AGENTE_SECRET` (o skill `vercel:env`). Guardar el mismo valor para el env del puente (Task 11).

- [ ] **Step 3: Probar local**

Con `npm run dev` corriendo y SIN cookies (curl):

```bash
curl -s http://localhost:3000/api/cotizaciones | head -c 120          # → redirect/login
curl -s -H "x-ravn-agente: $RAVN_AGENTE_SECRET" http://localhost:3000/api/cotizaciones | head -c 120  # → JSON
```

Expected: sin header redirige a login; con header devuelve `{"cotizaciones":[...]}`.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: acceso de agentes locales a /api/* con secret x-ravn-agente"
```

---

### Task 6: Propuesta borrador — tipo + API + precarga al emitir

**Files:**
- Modify: `src/lib/cotizador/tipos.ts` (campo en `Revision`)
- Create: `src/app/api/cotizaciones/[id]/documento-borrador/route.ts`
- Modify: `src/app/cotizaciones/[id]/revision/revision-screen.tsx` (precarga de los campos de emisión)

**Interfaces:**
- Consumes: `DatosDocumento` (`tipos.ts:275-281`), secret de Task 5.
- Produces: `Revision.documento_borrador?: DatosDocumento`; `PATCH /api/cotizaciones/[id]/documento-borrador { documento: Partial<DatosDocumento> }` → merge y persiste (solo en `borrador`/`en_revision`). El relato de la propuesta va en `documento.notas` (array de párrafos).

- [ ] **Step 1: Tipo**

En `tipos.ts`, dentro de `Revision` (después de `documento?: DatosDocumento;`):

```ts
  /** Borrador vivo de la propuesta (mesa conversacional): lo redacta Fable,
   *  la pestaña Propuesta lo muestra y precarga la emisión. El relato son
   *  las notas (párrafos). Nunca emite solo. */
  documento_borrador?: DatosDocumento;
```

- [ ] **Step 2: Ruta PATCH**

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DatosDocumento, EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function listaDeStrings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out;
}

/**
 * PATCH /api/cotizaciones/[id]/documento-borrador — la propuesta en vivo.
 * Fable la va redactando turno a turno; acá se mergea sobre lo que había.
 * Solo estados de mesa (borrador/en_revision). Emitir sigue siendo de Eze.
 */
export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { documento?: Partial<DatosDocumento> }
    | null;
  const doc = body?.documento;
  if (!doc || typeof doc !== "object") {
    return NextResponse.json({ error: "documento requerido." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id, estado, revision")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const estado = cot.estado as EstadoCotizacion;
  if (estado !== "borrador" && estado !== "en_revision") {
    return NextResponse.json(
      { error: `El borrador de propuesta solo se edita en la mesa (estado "${estado}").` },
      { status: 409 }
    );
  }

  const revision = (cot.revision ?? {
    checklist: [],
    sanidad: [],
    precios_vencidos: [],
    divergencias: [],
    dudas: [],
  }) as Revision;
  const previo: DatosDocumento =
    revision.documento_borrador ?? {
      cliente: "",
      lugar: "",
      forma_pago: [],
      plazo: [],
      notas: [],
    };

  const nuevo: DatosDocumento = {
    cliente: typeof doc.cliente === "string" ? doc.cliente.trim() : previo.cliente,
    lugar: typeof doc.lugar === "string" ? doc.lugar.trim() : previo.lugar,
    forma_pago: listaDeStrings(doc.forma_pago) ?? previo.forma_pago,
    plazo: listaDeStrings(doc.plazo) ?? previo.plazo,
    notas: listaDeStrings(doc.notas) ?? previo.notas,
  };

  const { error: eUpd } = await sb
    .from("cotizaciones")
    .update({ revision: { ...revision, documento_borrador: nuevo } })
    .eq("id", id)
    .in("estado", ["borrador", "en_revision"]); // guard de carrera
  if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });

  return NextResponse.json({ ok: true, documento_borrador: nuevo });
}
```

- [ ] **Step 3: Precarga al emitir**

En `revision-screen.tsx`: los estados `docCliente`, `docLugar`, `docFormaPago`, `docPlazo`, `docNotas` (líneas 91-95) hoy arrancan vacíos/fijos. Agregar un `useEffect` que, cuando `detalle` llega y los campos siguen vírgenes, precargue desde `detalle.revision?.documento_borrador`:

```ts
  // Precarga de la emisión desde el borrador vivo de la mesa (spec 2026-07-25).
  const [docPrecargado, setDocPrecargado] = useState(false);
  useEffect(() => {
    const b = detalle?.revision?.documento_borrador;
    if (!b || docPrecargado) return;
    setDocPrecargado(true);
    if (b.cliente) setDocCliente((v) => v || b.cliente);
    if (b.lugar) setDocLugar((v) => v || b.lugar);
    if (b.forma_pago.length) setDocFormaPago((v) => v || b.forma_pago.join("\n"));
    if (b.plazo.length) setDocPlazo((v) => v || b.plazo.join("\n"));
    if (b.notas.length) setDocNotas((v) => (v === "VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS" || !v ? b.notas.join("\n") : v));
  }, [detalle, docPrecargado]);
```

(Verificar cómo se parsean hoy esos campos al emitir — si `forma_pago`/`plazo`/`notas` se separan por `\n`, mantener ese formato.)

- [ ] **Step 4: Build + prueba manual**

`npm run build`. Después, con el secret:

```bash
curl -s -X PATCH -H "x-ravn-agente: $RAVN_AGENTE_SECRET" -H "Content-Type: application/json" \
  -d '{"documento":{"notas":["Renovación integral de dos baños."]}}' \
  http://localhost:3000/api/cotizaciones/<id>/documento-borrador
```

Expected: `{ok:true, documento_borrador:{...}}` y la fila en Supabase tiene `revision.documento_borrador`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/tipos.ts "src/app/api/cotizaciones/[id]/documento-borrador/route.ts" "src/app/cotizaciones/[id]/revision/revision-screen.tsx"
git commit -m "feat: borrador vivo de propuesta (tipo + PATCH + precarga de emisión)"
```

---

### Task 7: UI — chat de la mesa a tres voces

> Antes de arrancar esta tanda UI (Tareas 7–9): invocar el skill `ui-ux-pro-max` y leer `.ravn/06_UI.md`. Estética: tokens `cdm-*`, Liquid Glass, Framer Motion.

**Files:**
- Create: `src/app/cotizaciones/[id]/revision/mesa-chat.tsx`
- Test: build + prueba visual (componente client; la lógica pura ya está testeada en Task 2)

**Interfaces:**
- Consumes: `GET/POST /api/cotizaciones/[id]/mensajes` (Task 3), `useRealtimeTable`, `MensajeHilo` con autor ampliado (Task 2).
- Produces: `<MesaChat cotizacionId={string} onActividadMotor={() => void} />` — `onActividadMotor` se dispara cuando llega un mensaje de fable/codex (la pantalla refresca desglose/propuesta).

- [ ] **Step 1: Implementar el componente**

Basarse en `conversacion-panel.tsx` (mismo lenguaje visual: `cdm-glass`, `cdm-prompt`, burbujas Framer Motion, Enter para mandar). Diferencias clave:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import type { MensajeHilo } from "@/lib/cotizador/conversacion";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

/** Identidad visual de cada voz del hilo (mesa conversacional). */
const VOZ: Record<string, { nombre: string; clase: string }> = {
  eze: { nombre: "Eze", clase: "border-cdm-accent/40 bg-cdm-accent/10 text-cdm-fg" },
  fable: { nombre: "Fable", clase: "cdm-chip border-cdm-line text-cdm-fg/90" },
  codex: { nombre: "Codex", clase: "border-emerald-400/30 bg-emerald-400/5 text-cdm-fg/90" },
  sistema: { nombre: "Sistema", clase: "border-cdm-line bg-transparent text-cdm-muted" },
};

export function MesaChat({
  cotizacionId,
  onActividadMotor,
}: {
  cotizacionId: string;
  onActividadMotor: () => void;
}) {
  const [mensajes, setMensajes] = useState<MensajeHilo[] | null>(null);
  const [motorConectado, setMotorConectado] = useState<boolean | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const ultimoMotorRef = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/mensajes`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;
      setMensajes(json.mensajes ?? []);
      setMotorConectado(Boolean(json.motor_conectado));
      // Si llegó un mensaje nuevo de un motor, la mesa refresca datos.
      const ultimoMotor = [...(json.mensajes ?? [])]
        .reverse()
        .find((m: MensajeHilo) => m.autor === "fable" || m.autor === "codex");
      if (ultimoMotor && ultimoMotor.id !== ultimoMotorRef.current) {
        ultimoMotorRef.current = ultimoMotor.id;
        onActividadMotor();
      }
    } catch {
      // best-effort
    }
  }, [cotizacionId, onActividadMotor]);

  useEffect(() => { void cargar(); }, [cargar]);
  useRealtimeTable("cotizacion_mensajes", cargar);
  // Latido: el estado del motor se refresca aunque no haya mensajes.
  useEffect(() => {
    const t = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(t);
  }, [cargar]);
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes]);

  // "Fable está laburando…": el último mensaje es de Eze y el motor está vivo.
  const esperandoMotor =
    motorConectado === true &&
    (mensajes?.length ?? 0) > 0 &&
    mensajes![mensajes!.length - 1].autor === "eze";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al enviar");
      setTexto("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setEnviando(false);
    }
  }

  /* Render: header con chip de estado del motor (verde pulsante conectado /
     rojo "motor desconectado — la Mac tiene que estar prendida"), lista de
     burbujas con VOZ[autor] (fallback a sistema), etiqueta+hora como el panel
     actual, indicador "Fable está laburando…" animado cuando esperandoMotor,
     y el mismo form cdm-prompt de conversacion-panel.tsx con placeholder
     "Contale a Fable qué hay que cotizar…". */
}
```

Completar el render copiando la estructura JSX de `conversacion-panel.tsx` (header/lista/form) con esos cambios. El indicador de escritura:

```tsx
{esperandoMotor && (
  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    className="mt-2 text-[10px] uppercase tracking-[0.14em] text-cdm-accent/70">
    Fable está laburando…
  </motion.p>
)}
```

- [ ] **Step 2: Build + prueba visual**

`npm run build` compila. Montarlo provisoriamente será parte de la Task 9; para probarlo ya, en `revision-screen.tsx` renderizar `<MesaChat cotizacionId={id} onActividadMotor={() => cargar(true)} />` junto al `ConversacionPanel` actual y verificar en el browser: mensajes con tres estilos de voz, chip de motor desconectado, envío con Enter.

- [ ] **Step 3: Commit**

```bash
git add "src/app/cotizaciones/[id]/revision/mesa-chat.tsx" "src/app/cotizaciones/[id]/revision/revision-screen.tsx"
git commit -m "feat: chat de la mesa a tres voces con latido del motor"
```

---

### Task 8: UI — panel derecho: Propuesta viva y Fotos

**Files:**
- Create: `src/app/cotizaciones/[id]/revision/propuesta-viva.tsx`
- Create: `src/app/cotizaciones/[id]/revision/fotos-panel.tsx`
- Create: `src/app/api/cotizaciones/[id]/archivos/[archivoId]/route.ts` (PATCH `en_propuesta`)
- Modify: `src/app/api/cotizaciones/[id]/archivos/route.ts` (GET devuelve `en_propuesta` y `storage_path`; POST acepta tipo `foto`)
- Modify: `src/app/cotizaciones/[id]/documento/page.tsx` (fotos `en_propuesta` en el documento emitido)

**Interfaces:**
- Consumes: `Revision.documento_borrador` (Task 6), `cotizacion_archivos.en_propuesta` (Task 1), `formatMoneyInt` de `@/lib/format-currency` (verificar firma real al importar).
- Produces: `<PropuestaViva cotizacion={CotizacionRow} version={number} />` (render A4 del borrador, con fotos marcadas); `<FotosPanel cotizacionId={string} version={number} />` (galería + toggle "va en la propuesta"; `version` fuerza recarga tras un drop); `PATCH /api/cotizaciones/[id]/archivos/[archivoId] { en_propuesta: boolean }`.

- [ ] **Step 1: Extender GET de archivos**

En `archivos/route.ts`: al `select("*")` ya trae todo; sumar `en_propuesta: f.en_propuesta` y `storage_path: f.storage_path` al objeto que arma `archivos` (líneas 69-75) y agregar `en_propuesta: boolean` al tipo `Fila`. En el POST, la carpeta del path: agregar caso `foto` → carpeta `fotos` (línea 121):

```ts
    const carpeta =
      tipo === "diagnostico" ? "diagnosticos" : tipo === "foto" ? "fotos" : "propuestas";
```

- [ ] **Step 2: Ruta PATCH del toggle**

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; archivoId: string }> };

/** PATCH { en_propuesta: boolean } — marca una foto para salir en la propuesta. */
export async function PATCH(req: Request, ctx: Params) {
  const { id, archivoId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { en_propuesta?: boolean } | null;
  if (typeof body?.en_propuesta !== "boolean") {
    return NextResponse.json({ error: "en_propuesta (boolean) requerido." }, { status: 400 });
  }
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizacion_archivos")
    .update({ en_propuesta: body.en_propuesta })
    .eq("id", archivoId)
    .eq("cotizacion_id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: PropuestaViva**

Client component que recibe el `Detalle` ya cargado por la pantalla (sin fetch propio). Lenguaje visual del documento emitido (`/documento`): fondo claro `#f2efe8` sobre la mesa oscura, Raleway, importe protagonista.

```tsx
"use client";

import { motion } from "framer-motion";
import type { CotizacionRow } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";

/**
 * Pestaña PROPUESTA de la mesa: el borrador vivo que redacta Fable
 * (revision.documento_borrador). No es el documento emitido — es la
 * previsualización que se va escribiendo mientras charlan.
 */
export function PropuestaViva({
  cotizacion,
  version,
}: {
  cotizacion: CotizacionRow;
  version: number;
}) {
  const b = cotizacion.revision?.documento_borrador;
  const min = cotizacion.total_min;
  const max = cotizacion.total_max;

  // Fotos marcadas "en propuesta" (mismo endpoint que FotosPanel).
  const [fotos, setFotos] = useState<Array<{ id: string; url: string | null }>>([]);
  useEffect(() => {
    let vivo = true;
    void fetch(`/api/cotizaciones/${cotizacion.id}/archivos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        setFotos(
          (j?.archivos ?? []).filter(
            (a: { en_propuesta?: boolean; url?: string | null }) => a.en_propuesta && a.url
          )
        );
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [cotizacion.id, version]);

  if (!b && min == null) {
    return (
      <p className="p-6 text-[11px] leading-relaxed text-cdm-muted">
        Todavía no hay propuesta. A medida que charles con Fable, el documento
        se va redactando solo acá.
      </p>
    );
  }

  return (
    <motion.article
      key={JSON.stringify(b) + String(min)}
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto my-4 w-full max-w-[520px] bg-[#f2efe8] px-8 py-10 text-[#1a1a18] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]"
      style={{ fontFamily: "Raleway, sans-serif" }}
    >
      <p className="text-sm font-extrabold tracking-[0.4em]">R A V N</p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-[#8a857a]">
        Propuesta{b?.cliente ? ` · ${b.cliente}` : ""}{b?.lugar ? ` · ${b.lugar}` : ""}
      </p>
      <h3 className="mt-6 text-lg font-bold">{cotizacion.titulo}</h3>
      <div className="mt-4 space-y-3 text-[13px] leading-relaxed">
        {(b?.notas ?? []).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {min != null && max != null && (
        <p className="mt-8 text-3xl font-extrabold tabular-nums">
          {min === max
            ? formatMoneyInt(min)
            : `${formatMoneyInt(min)} – ${formatMoneyInt(max)}`}
        </p>
      )}
      {(b?.forma_pago?.length ?? 0) > 0 && (
        <div className="mt-6 text-[11px] leading-relaxed text-[#4a463e]">
          {b!.forma_pago.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </div>
      )}
      {fotos.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={f.url!} alt="" className="aspect-[4/3] w-full object-cover" />
          ))}
        </div>
      )}
    </motion.article>
  );
}
```

Imports necesarios: `useEffect`, `useState` de react. (Ajustar si `formatMoneyInt` tiene otra firma — verificar el import real.)

- [ ] **Step 3b: Fotos en el documento emitido**

En `src/app/cotizaciones/[id]/documento/page.tsx` (server component): sumar una query de `cotizacion_archivos` con `en_propuesta = true`, firmar las URLs (mismo patrón batch de `archivos/route.ts`, bucket `obra-archivos`) y renderizar una grilla de fotos al final del documento (respetando el CSS A4 embebido — nueva página `@page` si hay fotos). Si no hay fotos marcadas, el documento queda idéntico al actual.

- [ ] **Step 4: FotosPanel**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";

type Foto = {
  id: string;
  tipo: string;
  titulo: string | null;
  url: string | null;
  en_propuesta: boolean;
};

/** Pestaña FOTOS: galería de cotizacion_archivos con toggle "va en la propuesta". */
export function FotosPanel({ cotizacionId, version }: { cotizacionId: string; version: number }) {
  const [fotos, setFotos] = useState<Foto[] | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/cotizaciones/${cotizacionId}/archivos`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok) setFotos((json?.archivos ?? []).filter((a: Foto) => a.url));
  }, [cotizacionId]);

  useEffect(() => { void cargar(); }, [cargar, version]);

  async function marcar(f: Foto) {
    setFotos((fs) => fs?.map((x) => (x.id === f.id ? { ...x, en_propuesta: !f.en_propuesta } : x)) ?? null);
    await fetch(`/api/cotizaciones/${cotizacionId}/archivos/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ en_propuesta: !f.en_propuesta }),
    });
  }

  if (fotos === null) return null;
  if (fotos.length === 0) {
    return (
      <p className="p-6 text-[11px] leading-relaxed text-cdm-muted">
        Sin fotos todavía. Arrastrá imágenes del proyecto a cualquier parte de la mesa.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
      {fotos.map((f) => (
        <li key={f.id} className="group relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url!} alt={f.titulo ?? f.tipo} className="aspect-[4/3] w-full object-cover" />
          <button
            type="button"
            onClick={() => void marcar(f)}
            className={`absolute bottom-1 left-1 border px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] backdrop-blur ${
              f.en_propuesta
                ? "border-cdm-accent/60 bg-cdm-accent/20 text-cdm-accent"
                : "border-cdm-line bg-black/40 text-cdm-muted"
            }`}
          >
            {f.en_propuesta ? "En propuesta ✓" : "Sumar a propuesta"}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Build + commit**

`npm run build` compila.

```bash
git add "src/app/cotizaciones/[id]/revision/propuesta-viva.tsx" "src/app/cotizaciones/[id]/revision/fotos-panel.tsx" "src/app/api/cotizaciones/[id]/archivos/[archivoId]/route.ts" "src/app/api/cotizaciones/[id]/archivos/route.ts"
git commit -m "feat: propuesta viva y panel de fotos con toggle en_propuesta"
```

---

### Task 9: UI — layout B, drag & drop global y botón Nueva cotización

**Files:**
- Modify: `src/app/cotizaciones/[id]/revision/revision-screen.tsx` (layout B + pestañas + drop)
- Modify: `src/app/cotizaciones/cotizaciones-screen.tsx` (botón Nueva cotización)
- Modify: `src/app/api/cotizaciones/[id]/archivos/route.ts` (el POST devuelve `storage_path` en `archivo`)

**Interfaces:**
- Consumes: `MesaChat` (Task 7), `PropuestaViva`/`FotosPanel` (Task 8), `HojaViva` existente (`hoja-viva.tsx:95`, props `{cotizacionId, desglose, editable, onRefresh}`), `POST /api/cotizaciones` (ya crea borrador con solo `titulo`), `POST /api/cotizaciones/[id]/mensajes` (adjuntos), `useRealtimeTable`.
- Produces: la pantalla de revisión en layout B: grid `lg:grid-cols-[1.2fr_1fr]` — izquierda `MesaChat`, derecha pestañas Rubros / Propuesta / Fotos. En mobile (<lg) apilado: chat arriba, panel abajo.

- [ ] **Step 1: Layout B en revision-screen**

Reorganizar el JSX principal de `RevisionScreen`:

1. Estado nuevo: `const [pestana, setPestana] = useState<"rubros" | "propuesta" | "fotos">("rubros");` y `const [versionFotos, setVersionFotos] = useState(0);`.
2. Grid principal: `<div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">` — columna izquierda `<MesaChat cotizacionId={id} onActividadMotor={() => void cargar(true)} />` (el chat reemplaza al `ConversacionPanel` en la vista; NO borrar `conversacion-panel.tsx` — queda para el hilo legacy si hace falta volver); columna derecha un `cdm-glass` con la botonera de pestañas (mismo lenguaje de chips que la botonera de rubros de `hoja-viva.tsx`) y el contenido según `pestana`:
   - `rubros` → `<HojaViva cotizacionId={id} desglose={detalle.desglose} editable={detalle.estado === "en_revision" || detalle.estado === "borrador"} onRefresh={() => void cargar(true)} />`
   - `propuesta` → `<PropuestaViva cotizacion={detalle} version={versionFotos} />`
   - `fotos` → `<FotosPanel cotizacionId={id} version={versionFotos} />` (mostrar contador en la pestaña si se quiere: se puede derivar del fetch del panel, no es obligatorio).
3. Las secciones existentes (checklist/sanidad/aprobar/rechazar/emitir/vincular obra) quedan DEBAJO del grid, como están.
4. Realtime de la cotización (Fable edita desde afuera): agregar `useRealtimeTable("cotizaciones", refrescoSilencioso)` con `const refrescoSilencioso = useCallback(() => void cargar(true), [cargar]);`.

- [ ] **Step 2: Drag & drop global**

En el wrapper raíz del return de `RevisionScreen` (patrón de `command-bar.tsx:349-360`):

```tsx
  const [arrastrando, setArrastrando] = useState(false);

  async function soltarFotos(e: React.DragEvent) {
    e.preventDefault();
    setArrastrando(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0) return;
    const adjuntos: Array<{ archivo_id: string; storage_path: string; titulo?: string }> = [];
    for (const file of files) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("tipo", "foto");
      fd.set("titulo", file.name);
      const res = await fetch(`/api/cotizaciones/${id}/archivos`, { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.archivo?.id) {
        adjuntos.push({ archivo_id: json.archivo.id, storage_path: json.archivo.storage_path ?? "", titulo: file.name });
      }
    }
    if (adjuntos.length > 0) {
      // Aviso al puente por el mismo canal (autor sistema, meta adjuntos).
      await fetch(`/api/cotizaciones/${id}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjuntos }),
      });
      setVersionFotos((v) => v + 1);
      setPestana("fotos");
    }
  }
```

Handlers en el wrapper: `onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}`, `onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastrando(false); }}`, `onDrop={soltarFotos}`. Overlay Framer Motion cuando `arrastrando`:

```tsx
{arrastrando && (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
    className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-cdm-accent/60 bg-cdm-bg/70 backdrop-blur-sm">
    <p className="text-xs uppercase tracking-[0.25em] text-cdm-accent">
      Soltá las fotos del proyecto
    </p>
  </motion.div>
)}
```

(Nota: el POST de archivos devuelve `archivo` sin `storage_path` hoy — sumarlo al JSON de respuesta del POST en `archivos/route.ts`: `storage_path: path`.)

- [ ] **Step 3: Botón Nueva cotización**

En `cotizaciones-screen.tsx`, en el header junto a los filtros de estado: botón `Nueva cotización` que abre un mini form inline (input título + confirmar):

```tsx
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [creando, setCreando] = useState(false);
  const router = useRouter(); // next/navigation

  async function crearNueva(e: React.FormEvent) {
    e.preventDefault();
    const titulo = nuevoTitulo.trim();
    if (!titulo || creando) return;
    setCreando(true);
    try {
      const res = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al crear");
      router.push(`/cotizaciones/${json.id}/revision`);
    } finally {
      setCreando(false);
    }
  }
```

`POST /api/cotizaciones` ya crea en `borrador` con solo `titulo` (route.ts:90-116) — no hay que tocar la API.

- [ ] **Step 4: Verificación visual completa**

`npm run dev` → `/cotizaciones` → Nueva cotización "Prueba mesa" → redirige a la mesa: layout B, chat vacío a la izquierda, pestañas a la derecha (Rubros vacío porque no hay desglose — verificar que `HojaViva` con `desglose` vacío no rompa; si rompe, condicionar: `detalle.desglose?.items ? <HojaViva…/> : <p className="p-6 text-[11px] text-cdm-muted">Sin rubros todavía — contale a Fable qué hay que cotizar.</p>`). Arrastrar una imagen → overlay → aparece en Fotos y como mensaje en el chat. Responsive: en ventana angosta se apila.

- [ ] **Step 5: Commit**

```bash
git add "src/app/cotizaciones/[id]/revision/revision-screen.tsx" src/app/cotizaciones/cotizaciones-screen.tsx "src/app/api/cotizaciones/[id]/archivos/route.ts"
git commit -m "feat: mesa de cotización layout B — chat + pestañas + drop de fotos + nueva cotización"
```

---

### Task 10: Protocolo de Fable — parseo de directivas

**Files:**
- Create: `src/lib/puente/protocolo.ts`
- Test: `src/lib/puente/protocolo.test.ts`

**Interfaces:**
- Produces: `DirectivaFable = { mensaje: string; busqueda: string | null }`; `parsearDirectiva(salida: string): DirectivaFable`. La usa el puente (Task 11). Vive en `src/lib/` para que vitest la cubra (include `src/**/*.test.ts`) y el puente la importa por ruta relativa.

- [ ] **Step 1: Tests que fallan**

```ts
// src/lib/puente/protocolo.test.ts
import { describe, expect, it } from "vitest";
import { parsearDirectiva } from "./protocolo";

describe("parsearDirectiva", () => {
  it("JSON limpio", () => {
    expect(parsearDirectiva('{"mensaje":"hola","busqueda":null}')).toEqual({
      mensaje: "hola",
      busqueda: null,
    });
  });
  it("JSON con fences y texto alrededor", () => {
    const s = 'Va la directiva:\n```json\n{"mensaje":"cargué albañilería","busqueda":"precio microcemento m2 aplicado CABA"}\n```';
    expect(parsearDirectiva(s)).toEqual({
      mensaje: "cargué albañilería",
      busqueda: "precio microcemento m2 aplicado CABA",
    });
  });
  it("busqueda vacía o ausente normaliza a null", () => {
    expect(parsearDirectiva('{"mensaje":"ok","busqueda":"  "}').busqueda).toBeNull();
    expect(parsearDirectiva('{"mensaje":"ok"}').busqueda).toBeNull();
  });
  it("salida no-JSON cae a mensaje plano (nunca se pierde la respuesta)", () => {
    expect(parsearDirectiva("respuesta suelta sin json")).toEqual({
      mensaje: "respuesta suelta sin json",
      busqueda: null,
    });
  });
  it("JSON roto cae a mensaje plano", () => {
    expect(parsearDirectiva('{"mensaje": "sin cerrar').mensaje).toContain("sin cerrar");
  });
});
```

- [ ] **Step 2: Correr y ver el fallo**

Run: `npm run test -- protocolo`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
// src/lib/puente/protocolo.ts
/**
 * Protocolo puente ↔ Fable (mesa conversacional, spec 2026-07-25).
 * Fable responde SIEMPRE un JSON {mensaje, busqueda}. Este parser es
 * tolerante: fences, texto alrededor, JSON roto → nunca se pierde la
 * respuesta (fallback: todo el texto como mensaje).
 */

export type DirectivaFable = {
  /** Lo que se publica en el hilo como mensaje de Fable. */
  mensaje: string;
  /** Consigna de búsqueda de precios/datos (dispara la doble búsqueda) o null. */
  busqueda: string | null;
};

export function parsearDirectiva(salida: string): DirectivaFable {
  const crudo = salida.trim();
  const ini = crudo.indexOf("{");
  const fin = crudo.lastIndexOf("}");
  if (ini >= 0 && fin > ini) {
    try {
      const obj = JSON.parse(crudo.slice(ini, fin + 1)) as Record<string, unknown>;
      const mensaje = typeof obj["mensaje"] === "string" ? (obj["mensaje"] as string).trim() : "";
      const busquedaCruda = obj["busqueda"];
      const busqueda =
        typeof busquedaCruda === "string" && busquedaCruda.trim().length > 0
          ? busquedaCruda.trim()
          : null;
      if (mensaje) return { mensaje, busqueda };
    } catch {
      // JSON roto: cae al fallback.
    }
  }
  return { mensaje: crudo, busqueda: null };
}
```

- [ ] **Step 4: Correr los tests**

Run: `npm run test -- protocolo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puente/protocolo.ts src/lib/puente/protocolo.test.ts
git commit -m "feat: protocolo puente-Fable (parseo tolerante de directivas)"
```

---

### Task 11: El puente-cotizador (proceso en la Mac)

**Files:**
- Create: `daemon/puente-cotizador/puente.ts`
- Create: `daemon/puente-cotizador/motor-fable.ts`
- Create: `daemon/puente-cotizador/motor-codex.ts`
- Create: `daemon/puente-cotizador/prompt-sistema.md`
- Create: `daemon/puente-cotizador/run-puente.sh`
- Create: `daemon/launchd/com.ravn.puente-cotizador.plist`
- Create: `daemon/puente-cotizador/install.sh`

**Interfaces:**
- Consumes: tablas Task 1, `parsearDirectiva` (Task 10, import relativo `../../src/lib/puente/protocolo`), APIs con secret (Tasks 5/6), CLIs `claude` (`~/.local/bin/claude`) y `codex` (`/opt/homebrew/bin/codex`).
- Produces: proceso launchd `com.ravn.puente-cotizador` (KeepAlive) que responde mensajes y late cada 30 s. Estado local en `~/.ravn-puente/` (env, sesiones.json, procesados.json, logs).

**Env (`~/.ravn-puente/env`):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (copiar de `.env.local`), `RAVN_APP_URL` (prod `ravn-app-one`; para pruebas locales `http://localhost:3000`), `RAVN_AGENTE_SECRET` (Task 5), opcionales `PUENTE_MODELO` (default `sonnet`), `PUENTE_CODEX_TIMEOUT_MS` (default `180000`).

- [ ] **Step 1: Verificar flags de los CLIs**

```bash
claude --help | grep -E "resume|session|append-system-prompt|output-format"
codex exec --help | grep -E "search|output-last-message|skip-git|-C"
```

Confirmar que existen `--resume`, `--append-system-prompt`, `--output-format json` (claude) y `--search`, `--output-last-message`, `--skip-git-repo-check`, `-C` (codex). Si algún flag difiere en la versión instalada, adaptar los spawns de los Steps 3-4 al flag real.

- [ ] **Step 2: `prompt-sistema.md`**

```markdown
# Puente-cotizador — system prompt de Fable

Sos Fable, el cotizador de RAVN Construcciones, conversando con Eze en la mesa
de cotización de App RAVN. Cada mensaje tuyo aparece como burbuja en el chat.

## Leyes (NO negociables)
1. NUNCA inventar un precio ni un dato. Sin precio → el ítem queda sin precio
   (hueco visible). Todo número lleva fuente y fecha.
2. VOS NO SUMÁS. Toda cuenta la hace la app: tocás la cotización SOLO vía las
   APIs de abajo. Jamás escribís totales a mano.
3. NUNCA emitís ni aprobás. Eso es de Eze, con sus botones.

## Formato de respuesta — SIEMPRE
Respondé ÚNICAMENTE un JSON válido, sin texto afuera:
{"mensaje": "<lo que le decís a Eze, tono directo, sin humo>", "busqueda": <null o "consigna de búsqueda de precios/datos">}

- "busqueda" ≠ null SOLO cuando Eze pide precios/datos que requieren
  investigar (dispara la búsqueda doble tuya y de Codex, en paralelo).
- Charla común (alcance, preguntas, decisiones) → busqueda null.

## Fuentes de precios (regla doble)
- SISMAT local: /Users/ezeotero/Obsidian/RAVN/Conocimiento/Precios/sismat/
- Internet en vivo (WebSearch): SIEMPRE con link y fecha.
- Teoría de obra: /Users/ezeotero/Obsidian/RAVN/Conocimiento/Construccion/Marcelo-Seia/_INDICE.md
- Los importes de Eze son LITERALES (700 = $700, no $700.000 salvo "lucas/palo").

## Tocar la cotización (curl, header obligatorio)
Header en TODOS los curl: -H "x-ravn-agente: $RAVN_AGENTE_SECRET"
Base: $RAVN_APP_URL

- Ver estado: GET  /api/cotizaciones/{id}
- Ítem manual:  PATCH /api/cotizaciones/{id}/desglose
    {"manual": {"nombre": "...", "rubro": "<id de rubro>", "tipo": "material"|"mano_de_obra",
     "unidad": "m2|ml|u|kg|l|bolsa|caja|m3|rollo|dia|global", "cantidad": N,
     "precio": N (omitir si no hay precio → hueco visible), "notas": "fuente: <link/SISMAT> (<fecha>)"}}
- Ajustar ítem:  PATCH /api/cotizaciones/{id}/desglose
    {"ajuste": {"nombre": "...", "precio": N|null, "cantidad": N|null, "activo": true|false}}
- Quitar manual: PATCH /api/cotizaciones/{id}/desglose  {"quitar_manual": "<nombre>"}
- Propuesta:     PATCH /api/cotizaciones/{id}/documento-borrador
    {"documento": {"cliente": "...", "lugar": "...", "notas": ["párrafo 1", "párrafo 2"], "forma_pago": [...], "plazo": [...]}}
  → Actualizala en CADA avance importante: es la propuesta que Eze ve
    redactarse en vivo. Redacción RAVN: formal, directa, sin humo.

Rubros válidos: obra, humedad, revestimientos, plomeria, electricidad,
sanitarios, griferias, mobiliario, extras, mano_de_obra.
UNA operación por request. Después de cada PATCH la app recalcula sola.

## Estilo
Directo, de obra, sin verso. Preguntá lo que falte para cotizar bien (alcance,
medidas, calidades) — de a una o dos preguntas por turno. Nunca cierres un
precio final: eso lo decide Eze con su margen.
```

- [ ] **Step 3: `motor-fable.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude`;
const MODELO = process.env.PUENTE_MODELO ?? "sonnet";
const TIMEOUT_MS = 10 * 60 * 1000;

export type RespuestaFable = { texto: string; sessionId: string | null };

/**
 * Un turno de Fable vía Claude Code headless. Sesión persistente por
 * cotización (--resume) — el contexto de la charla vive en el CLI.
 * Env heredado: RAVN_APP_URL y RAVN_AGENTE_SECRET para los curl de Fable.
 */
export async function correrFable(args: {
  prompt: string;
  sistema: string;
  sesionPrevia: string | null;
}): Promise<RespuestaFable> {
  const cli = [
    "-p",
    "--model", MODELO,
    "--output-format", "json",
    "--dangerously-skip-permissions",
    "--append-system-prompt", args.sistema,
    ...(args.sesionPrevia ? ["--resume", args.sesionPrevia] : []),
    args.prompt,
  ];
  const { stdout } = await ejecutar(CLAUDE_BIN, cli, {
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    cwd: process.env.HOME,
    env: process.env,
  });
  const salida = JSON.parse(stdout) as { result?: string; session_id?: string };
  return { texto: salida.result ?? "", sessionId: salida.session_id ?? null };
}
```

- [ ] **Step 4: `motor-codex.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ejecutar = promisify(execFile);

const CODEX_BIN = "/opt/homebrew/bin/codex";
const TIMEOUT_MS = Number(process.env.PUENTE_CODEX_TIMEOUT_MS ?? 180_000);

/**
 * Búsqueda de Codex (segunda opinión, spec: doble motor solo en búsquedas).
 * Devuelve el texto final o null si falló/expiró — el puente publica el aviso.
 */
export async function correrCodex(consigna: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "puente-codex-"));
  const salida = join(dir, "ultimo.txt");
  try {
    await ejecutar(
      CODEX_BIN,
      [
        "exec",
        "--search",
        "--skip-git-repo-check",
        "-C", process.env.HOME ?? "/",
        "--output-last-message", salida,
        `Sos el buscador de precios de RAVN Construcciones (zona norte GBA/CABA). ${consigna}. Respondé CORTO: tabla de valores con moneda, unidad y FUENTE (link) de cada uno, fecha de hoy. Nunca inventes: si no encontrás, decilo.`,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, env: process.env }
    );
    const texto = (await readFile(salida, "utf8")).trim();
    return texto || null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: `puente.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parsearDirectiva } from "../../src/lib/puente/protocolo";
import { correrFable } from "./motor-fable";
import { correrCodex } from "./motor-codex";

/**
 * puente-cotizador — el motor local de la mesa de cotización (spec 2026-07-25).
 * Escucha cotizacion_mensajes por Realtime, corre Fable (Claude Code) con
 * sesión por cotización y Codex para búsquedas, y publica las respuestas.
 * Late a puente_latidos cada 30 s. Barrido al arrancar y cada 60 s (mensajes
 * que llegaron con el puente caído).
 */

const DIR = join(process.env.HOME ?? "", ".ravn-puente");
const LATIDO_MS = 30_000;
const BARRIDO_MS = 60_000;

type MensajeRow = {
  id: string;
  cotizacion_id: string;
  autor: string;
  texto: string;
  adjuntos: Array<{ archivo_id?: string; storage_path?: string; titulo?: string }>;
  meta: Record<string, unknown>;
  creado_at: string;
};

const sb: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let sistema = "";
const sesiones = new Map<string, string>(); // cotizacion_id → claude session_id
const procesados = new Set<string>(); // ids de mensajes ya atendidos (persistido)
const colas = new Map<string, Promise<void>>(); // serialización por cotización

async function cargarEstadoLocal() {
  await mkdir(DIR, { recursive: true });
  // URL relativa al módulo: funciona igual bajo tsx desde cualquier cwd.
  sistema = await readFile(new URL("./prompt-sistema.md", import.meta.url), "utf8");
  try {
    const crudo = JSON.parse(await readFile(join(DIR, "sesiones.json"), "utf8"));
    Object.entries(crudo).forEach(([k, v]) => sesiones.set(k, String(v)));
  } catch {
    // primera corrida: no existe todavía
  }
  try {
    const crudo = JSON.parse(await readFile(join(DIR, "procesados.json"), "utf8"));
    (crudo as string[]).forEach((id) => procesados.add(id));
  } catch {
    // primera corrida: no existe todavía
  }
}

async function guardarEstadoLocal() {
  await writeFile(join(DIR, "sesiones.json"), JSON.stringify(Object.fromEntries(sesiones)));
  await writeFile(join(DIR, "procesados.json"), JSON.stringify([...procesados].slice(-2000)));
}

async function publicar(
  cotizacionId: string,
  autor: "fable" | "codex" | "sistema",
  texto: string,
  meta: Record<string, unknown>
) {
  const { error } = await sb
    .from("cotizacion_mensajes")
    .insert({ cotizacion_id: cotizacionId, autor, texto, meta });
  if (error) console.error("[puente] publicar:", error.message);
}

async function yaRespondido(mensajeId: string): Promise<boolean> {
  if (procesados.has(mensajeId)) return true;
  const { data } = await sb
    .from("cotizacion_mensajes")
    .select("id")
    .eq("meta->>respuesta_a", mensajeId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Contexto corto de la cotización para el primer turno de una sesión. */
async function contextoCotizacion(id: string): Promise<string> {
  const { data } = await sb
    .from("cotizaciones")
    .select("id, titulo, estado, zona, total_min, total_max, ficha")
    .eq("id", id)
    .maybeSingle();
  if (!data) return `Cotización ${id} (no encontrada).`;
  return `Cotización id=${data.id} · "${data.titulo}" · estado=${data.estado} · zona=${data.zona ?? "s/d"} · total=${data.total_min ?? "s/d"}–${data.total_max ?? "s/d"} · ficha=${JSON.stringify(data.ficha)}`;
}

async function turnoFable(cotizacionId: string, prompt: string): Promise<ReturnType<typeof parsearDirectiva>> {
  const sesionPrevia = sesiones.get(cotizacionId) ?? null;
  const encabezado = sesionPrevia ? "" : `${await contextoCotizacion(cotizacionId)}\n\n`;
  const r = await correrFable({ prompt: encabezado + prompt, sistema, sesionPrevia });
  if (r.sessionId) sesiones.set(cotizacionId, r.sessionId);
  return parsearDirectiva(r.texto);
}

async function procesarMensaje(m: MensajeRow) {
  if (await yaRespondido(m.id)) return;
  procesados.add(m.id);
  await guardarEstadoLocal();

  const esAdjuntos = m.autor === "sistema";
  const prompt = esAdjuntos
    ? `Eze soltó ${m.adjuntos.length} foto(s) del proyecto en la mesa (paths en el bucket obra-archivos: ${m.adjuntos.map((a) => a.storage_path).join(", ")}). Pedile por GET /api/cotizaciones/${m.cotizacion_id}/archivos las URLs firmadas, miralas (Read de imágenes por URL no — bajalas con curl a /tmp y leelas) y comentá qué ves que afecte la cotización.`
    : m.texto;

  try {
    // Turno 1: Fable responde (y decide si hay búsqueda).
    const d1 = await turnoFable(m.cotizacion_id, prompt);
    await publicar(m.cotizacion_id, "fable", d1.mensaje, { tipo: "charla", respuesta_a: m.id });

    if (d1.busqueda) {
      // Doble búsqueda en paralelo: Codex y Fable, cada uno por su lado.
      const [codexTexto, d2] = await Promise.all([
        correrCodex(d1.busqueda),
        turnoFable(
          m.cotizacion_id,
          `Hacé AHORA tu búsqueda: "${d1.busqueda}". SISMAT local + internet (WebSearch). Devolvé en "mensaje" tus valores con fuente y fecha; "busqueda" null.`
        ),
      ]);
      await publicar(m.cotizacion_id, "fable", d2.mensaje, { tipo: "busqueda", respuesta_a: m.id });
      await publicar(
        m.cotizacion_id,
        "codex",
        codexTexto ?? "Codex no respondió a tiempo — va solo la búsqueda de Fable.",
        { tipo: codexTexto ? "busqueda" : "aviso", respuesta_a: m.id }
      );

      // Turno de consolidación: la charla entre los tres.
      const d3 = await turnoFable(
        m.cotizacion_id,
        `Codex trajo esto:\n---\n${codexTexto ?? "(falló/timeout)"}\n---\nConsolidá con lo tuyo: coincidencias, diferencias y qué banda tomás (con fuente). APLICÁ los cambios a la cotización con curl (desglose ítem por ítem, y actualizá el documento-borrador). "busqueda" null.`
      );
      await publicar(m.cotizacion_id, "fable", d3.mensaje, { tipo: "charla", respuesta_a: m.id });
    }
  } catch (e) {
    console.error("[puente] procesarMensaje:", e);
    await publicar(m.cotizacion_id, "sistema", "El motor tuvo un problema con este mensaje — probá de nuevo.", {
      tipo: "aviso",
      respuesta_a: m.id,
    });
  }
}

/** Serializa por cotización: los mensajes de una misma mesa van en orden. */
function encolar(m: MensajeRow) {
  if (m.autor !== "eze" && m.autor !== "sistema") return;
  if (m.autor === "sistema" && (m.meta?.["tipo"] ?? "") !== "adjuntos") return;
  const previa = colas.get(m.cotizacion_id) ?? Promise.resolve();
  colas.set(m.cotizacion_id, previa.then(() => procesarMensaje(m)));
}

async function barrido() {
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from("cotizacion_mensajes")
    .select("*")
    .in("autor", ["eze", "sistema"])
    .gte("creado_at", desde)
    .order("creado_at", { ascending: true })
    .limit(200);
  if (error) return console.error("[puente] barrido:", error.message);
  for (const m of (data ?? []) as MensajeRow[]) {
    if (!procesados.has(m.id)) encolar(m);
  }
}

async function main() {
  await cargarEstadoLocal();

  setInterval(() => {
    void sb.from("puente_latidos").upsert({ id: "puente-cotizador", visto_at: new Date().toISOString() });
  }, LATIDO_MS);

  sb.channel("puente-cotizador")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "cotizacion_mensajes" },
      (payload) => encolar(payload.new as MensajeRow)
    )
    .subscribe((estado) => console.log("[puente] realtime:", estado));

  await barrido();
  setInterval(() => void barrido(), BARRIDO_MS);
  console.log("[puente] vivo — escuchando cotizacion_mensajes");
}

void main();
```

- [ ] **Step 6: wrapper, plist e install**

`run-puente.sh`:

```bash
#!/bin/zsh
# Wrapper del puente-cotizador: carga el env local y corre el proceso.
set -euo pipefail
source /Users/ezeotero/.ravn-puente/env
cd /Users/ezeotero/Documents/ravn
exec npx tsx daemon/puente-cotizador/puente.ts
```

`com.ravn.puente-cotizador.plist` (patrón de `com.ravn.jobs.plist`, pero KeepAlive — es un escucha, no un cron; el websocket idle no gasta batería):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ravn.puente-cotizador</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>/Users/ezeotero/.ravn-puente/run-puente.sh</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
    <string>/Users/ezeotero/.ravn-puente/logs/puente.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/ezeotero/.ravn-puente/logs/puente.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/Users/ezeotero/.local/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/ezeotero</string>
    </dict>
</dict>
</plist>
```

`install.sh` (espejo de `daemon/install.sh`):

```bash
#!/bin/zsh
# Instala (o reinstala) com.ravn.puente-cotizador.
set -euo pipefail
mkdir -p /Users/ezeotero/.ravn-puente/logs
if [ ! -f /Users/ezeotero/.ravn-puente/env ]; then
  echo "FALTA /Users/ezeotero/.ravn-puente/env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAVN_APP_URL, RAVN_AGENTE_SECRET)"; exit 1
fi
cp /Users/ezeotero/Documents/ravn/daemon/puente-cotizador/run-puente.sh /Users/ezeotero/.ravn-puente/run-puente.sh
chmod +x /Users/ezeotero/.ravn-puente/run-puente.sh
cp /Users/ezeotero/Documents/ravn/daemon/launchd/com.ravn.puente-cotizador.plist /Users/ezeotero/Library/LaunchAgents/
launchctl bootout "gui/$(id -u)/com.ravn.puente-cotizador" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" /Users/ezeotero/Library/LaunchAgents/com.ravn.puente-cotizador.plist
launchctl list | grep com.ravn.puente-cotizador
echo "OK com.ravn.puente-cotizador instalado"
```

- [ ] **Step 7: Prueba a mano (sin launchd todavía)**

Crear `~/.ravn-puente/env` con los 4 valores. Correr `zsh daemon/puente-cotizador/run-puente.sh` en una terminal. En la app: mandar un mensaje en una cotización borrador ("hola, ¿estás?"). Expected: en <30 s aparece la burbuja de Fable en el chat y el chip pasa a "motor conectado". `Ctrl-C` y verificar que el chip cae a desconectado a los ~90 s.

- [ ] **Step 8: Instalar el launchd + commit**

```bash
zsh daemon/puente-cotizador/install.sh
git add daemon/puente-cotizador daemon/launchd/com.ravn.puente-cotizador.plist
git commit -m "feat: puente-cotizador — motor local Fable+Codex de la mesa conversacional"
```

---

### Task 12: Prueba end-to-end real + docs + ADR

**Files:**
- Create: `.ravn/decisions/0005-mesa-cotizacion-conversacional.md` (verificar numeración libre en `.ravn/decisions/`; usar el siguiente número)
- Modify: `.ravn/01_ARCHITECTURE.md`, `.ravn/03_DATABASE.md`, `.ravn/04_APIS.md`, `.ravn/06_UI.md` (secciones afectadas, con fecha de verificación)

- [ ] **Step 1: Deploy**

Push + verificar deploy en `ravn-app-one` (si la rama es `home-cards`: `vercel promote`). Confirmar que `RAVN_AGENTE_SECRET` está en Production y que `~/.ravn-puente/env` apunta `RAVN_APP_URL` a prod.

- [ ] **Step 2: E2E real (checklist de aceptación de la spec)**

Con el puente corriendo por launchd y la app en prod:

1. `/cotizaciones` → Nueva cotización "Pintura interior living Prueba" → mesa en borrador.
2. Chat: "cotizame pintura interior de un living de 4x5, techos 2,6, paredes en buen estado" → responde Fable (pregunta lo que falte).
3. Pedir precios: "¿a cuánto está el látex y la mano de obra?" → mensaje de Fable + mensaje de Codex (cada uno con fuentes) + consolidación → pestaña Rubros con ítems nuevos (los sin precio, en hueco visible).
4. Pestaña Propuesta: el borrador se redactó solo.
5. Arrastrar una foto → overlay → aparece en Fotos y en el hilo; marcar "En propuesta".
6. Apagar el puente (`launchctl bootout gui/$(id -u)/com.ravn.puente-cotizador`) → chip "motor desconectado"; mandar un mensaje; reinstalar (`install.sh`) → el barrido lo responde solo.
7. Aprobar desde borrador → funciona; emitir con los campos precargados del borrador → documento como siempre.

Registrar cualquier falla, arreglar y re-probar antes de dar por viva la mesa.

- [ ] **Step 3: Docs `.ravn/` + ADR**

ADR corto (contexto: spec 2026-07-25; decisión: motores locales por suscripción + secret de agente + tabla de mensajes; alternativas descartadas: API paga en Vercel, todo por trabajos_cola). Actualizar en los docs HECHOS: tablas nuevas (03), rutas nuevas `/mensajes`, `/documento-borrador`, `/archivos/[archivoId]`, bypass de agente (04), mesa layout B (06), puente en el mapa (01).

- [ ] **Step 4: Cierre**

`npm run test && npm run build` verdes. Commit final:

```bash
git add .ravn
git commit -m "docs: mesa conversacional — ADR + docs .ravn actualizados"
```

Avisar a Eze: mesa viva, qué se probó, y el pendiente de calibración de prompts (el tono/criterio de Fable se ajusta usándola).
