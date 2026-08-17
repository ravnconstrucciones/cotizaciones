# Puerta de Entrada del Cotizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eze tira un archivo (OT/PDF, fotos, texto, checklist) en el visor y nace una cotización: borrador persistido al toque, ola local que desmenuza (rubros/ítems/artefactos/maquinaria/MO con origen), Eze confirma en el visor, y recién ahí se crea la receta candidata y la cotización pasa a `en_revision` con precios del motor.

**Spec:** `docs/superpowers/specs/2026-08-17-puerta-entrada-cotizador-design.md` — leerlo entero antes de ejecutar cualquier task.

**Architecture:** Tres frentes conectados por contratos existentes. (1) El **motor** (`src/lib/cotizador/` de App RAVN, compartido) aprende el tipo `maquinaria` (modalidad alquiler/propia) y la marca `artefacto`. (2) **App RAVN** suma dos rutas de escritura al molde del pase (`x-ravn-cotizador-write` + allowlist): crear borrador y confirmar reconocimiento (receta candidata + `en_revision` en una transacción lógica). (3) El **cotizador standalone** suma la UI de la puerta (drop/pegar/adjuntar), el bridge local corre la ola de intake con Fable (`claude -p`, sin API de pago) y deja la propuesta estructurada en la tabla nueva `cotizador_intake` (base compartida, vía PostgREST — mismo molde que el taller).

**Tech Stack:** Next.js 15 (App Router) en los dos lados · Supabase (PostgREST + Storage, base compartida) · bridge local Node (`bridge/server.mjs`, ya existe) · vitest en los dos repos.

## Global Constraints

- **Ninguna cotización activa sin receta**: `trg_cotizaciones_guard` rebota `en_revision`/`aprobada`/`documento_emitido` con `receta_id` null. `borrador` queda libre. Lo hace cumplir la base.
- **Los precios no se inventan**: la IA interpreta el QUÉ y las cantidades; el CUÁNTO lo pone el motor con fuente fechada (`PrecioFechado {valor, fuente, fecha}`).
- **El cotizador sigue siendo app aparte**; base compartida; lo que toca plata o estado pasa por endpoints de App RAVN con credencial y allowlist.
- **Regla anti-slop**: nada se muestra como hecho/guardado/leído sin verificarlo. Bridge apagado se dice ("Bridge apagado"), nunca se simula.
- **Sin API de pago**: el desmenuzado corre por el bridge local (suscripción de la Mac). Mac apagada = no desmenuza, pero archivo + borrador persisten.
- **Idempotencia** al estilo del pase: reintentar es seguro; 0 filas afectadas = 409, nunca éxito fantasma.
- **Fechas**: siempre `hoyIsoAR()` (zona nombrada), nunca UTC ni zona de la máquina.
- Verificación estándar del subsistema antes de decir "hecho": `cd apps/cotizador-ravn && npm test` (hoy 175) · `npm test` en la raíz (hoy 572) · `npx tsc --noEmit` + `npm run lint` + `npm run build` del cotizador (First Load JS ~171 kB, no debe engordar fuerte) · `select * from cotizador_huerfanos` y `select * from dinero_huerfanos` vacías.
- **Migraciones y deploy a producción los aprueba Eze** — el task que aplica la migración y el deploy final se FRENAN y se le pide OK explícito ("Eze, aprobame X para Y").

## Decisiones de diseño clavadas (del spec + de esta sesión de plan)

1. **La propuesta de reconocimiento es dato del TALLER**: vive en la tabla nueva `cotizador_intake` (al lado de `cotizador_taller_items`), no en `cotizaciones`. El bridge la escribe por PostgREST con service key (mismas env que ya usa `taller/store.ts`); el visor la lee por su propio `/api/intake`.
2. **La ola de intake corre SOLO Fable** (`claude -p` con `Read` + `WebSearch` + `WebFetch`). Salida estructurada de UN agente; Codex queda fuera del intake v1 (su terminal muestra "Sin sesión lanzada"). El panel de terminales sigue mostrando la ola en vivo.
3. **Precios**: la ola PUEDE traer `precio_referencia` (internet/SISMAT, con fuente y fecha) por ítem; se aplican recién en la confirmación. La confirmación además levanta el cache `precios_items` por nombre exacto de ítem; para `sismat`/`internet` gana la fecha más nueva; `eze` sale SOLO del cache. Lo que quede sin precio cae como `sin_precio` en la cola de decisiones del visor, que ya lo maneja.
4. **Cantidades literales en v1**: la receta candidata usa la cantidad como fórmula literal (`"12"`). La parametrización real (fórmulas sobre `superficie_m2`) es evolución posterior; `evaluarFormula` acepta literales y `validarRecetaCandidata` pasa.
5. **Rubro = etapa**: cada rubro de la propuesta se traduce a una `EtapaReceta` (con `dias_min/max` y `cuadrilla` si la ola los trajo).
6. **Maquinaria `propia` NO suma al costo**: se lista (subtotales 0, `sin_precio: false`, no entra a la cola de decisiones). `alquiler` se precia como un material más y suma en un bucket propio `maquinaria_min/max` de los totales.
7. **Artefacto**: NO es tipo nuevo; `artefacto: true` sobre un ítem `material`. El agrupado visual vive en el panel de reconocimiento (v1); el tablero no cambia.
8. **Ítems manuales de la mesa siguen siendo material/MO** (`TIPOS` de `mesa-merge.ts` no cambia): la maquinaria entra por la puerta (receta), no por el alta manual del taller. Si Eze la pide a mano, es otra vuelta.
9. **Subida de archivos**: ≤4 MB por proxy multipart (`POST .../archivos`, ya existe); >4 MB por el flujo directo firmar → PUT a Storage → confirmar (rutas ya existen; se allowlistean).
10. **Estados del intake**: `esperando_ola` → `propuesta_lista` → `confirmada`; `error` con motivo. El bridge escribe `propuesta_lista`/`error`; la confirmación escribe `confirmada`. Relanzar la ola es siempre seguro.

## Mapa de archivos

| Frente | Crear | Modificar |
|---|---|---|
| Motor (App RAVN lib) | — | `src/lib/cotizador/tipos.ts`, `candidata.ts`, `instanciar.ts`, `totales.ts` + tests |
| App RAVN rutas | `src/app/api/cotizaciones/intake/route.ts`, `src/app/api/cotizaciones/[id]/confirmar-reconocimiento/route.ts`, `src/lib/cotizador/confirmacion.ts` (+ test) | `src/middleware.ts` (+ test) |
| Migración | `supabase/migrations/20260817120000_cotizador_intake.sql` | — |
| Cotizador contrato | `apps/cotizador-ravn/src/bridge/intake-contract.ts` (+ test), `src/taller/reconocimiento.ts` (+ test), `src/taller/intake-store.ts` (+ test) | `src/adapters/app-ravn-write-adapter.ts`, `app-ravn-read-adapter.ts` |
| Cotizador rutas | `src/app/api/intake/route.ts`, `intake/archivos/route.ts`, `intake/archivos/firmar/route.ts`, `intake/archivos/confirmar/route.ts`, `intake/ola/route.ts`, `intake/confirmar/route.ts` | — |
| Bridge | `apps/cotizador-ravn/bridge/intake-prompt.mjs` | `bridge/server.mjs` |
| Visor UI | `src/components/intake-gate.tsx`, `src/components/reconocimiento-panel.tsx` | `src/components/control-center.tsx`, `src/app/globals.css` |

Rama de trabajo: **`home-cards`** (la vigente del subsistema). En el working tree hay cambios de OTRA sesión (`.ravn/`, `AGENTS.md`, `CLAUDE.md`, `docs/`, `daemon/memoria/`): **no commitearlos**; commitear siempre por archivo explícito, nunca `git add -A`.

---

### Task 1: Motor — tipo `maquinaria` y marca `artefacto` en los tipos

**Files:**
- Modify: `src/lib/cotizador/tipos.ts`
- Test: `src/lib/cotizador/__tests__/candidata.test.ts` (compila contra los tipos; el test real va en Task 2)

**Interfaces:**
- Produces: `TipoItem = "material" | "mano_de_obra" | "maquinaria"`, `ModalidadMaquinaria = "alquiler" | "propia"`, `ItemReceta.modalidad?: ModalidadMaquinaria`, `ItemReceta.artefacto?: boolean`, `ItemDesglose.modalidad?`, `ItemDesglose.artefacto?`, `TotalesDesglose.maquinaria_min?/maquinaria_max?: number`.

- [ ] **Step 1: Editar `tipos.ts`**

En `src/lib/cotizador/tipos.ts`, reemplazar la línea `export type TipoItem = "material" | "mano_de_obra";` por:

```ts
export type TipoItem = "material" | "mano_de_obra" | "maquinaria";

/**
 * Maquinaria (decisión de Eze 09/08, caso sierra de sable Húsares): las
 * herramientas de capital nunca se cargan como costo de una obra puntual.
 * `alquiler` entra al costo con precio fechado; `propia` (capex) se reconoce
 * y se LISTA (logística, OT) pero no suma al costo. Sin amortización en v1.
 */
export type ModalidadMaquinaria = "alquiler" | "propia";
```

En `ItemReceta`, después de `tipo: TipoItem;` agregar:

```ts
  /** Obligatoria cuando tipo === "maquinaria"; inválida en los demás tipos. */
  modalidad?: ModalidadMaquinaria;
  /** Solo materiales: se compra E instala (grifería, sanitarios). El visor los agrupa aparte. */
  artefacto?: boolean;
```

En `ItemDesglose`, después de `tipo: TipoItem;` agregar (passthrough para que el visor los lea):

```ts
  modalidad?: ModalidadMaquinaria;
  artefacto?: boolean;
```

En `TotalesDesglose` (está al final del archivo, arranca en `materiales_min`), agregar después de `mano_de_obra_max: number;`:

```ts
  /** Maquinaria ALQUILADA (la propia no suma — capex). Opcional: desgloses viejos no lo traen. */
  maquinaria_min?: number;
  maquinaria_max?: number;
```

- [ ] **Step 2: Verificar que compila todo el monorepo**

Run: `npx tsc --noEmit` (raíz de `Documents/ravn`)
Expected: PASS sin errores (los campos nuevos son opcionales; el union nuevo no rompe consumidores porque los `if material else MO` existentes siguen tipando — el comportamiento se corrige en Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/lib/cotizador/tipos.ts
git commit -m "feat(cotizador): tipo maquinaria (alquiler/propia) y marca artefacto en el contrato de tipos"
```

---

### Task 2: Motor — `validarRecetaCandidata` exige modalidad en maquinaria y limita artefacto a materiales

**Files:**
- Modify: `src/lib/cotizador/candidata.ts`
- Test: `src/lib/cotizador/__tests__/candidata.test.ts`

**Interfaces:**
- Consumes: `TipoItem`, `ModalidadMaquinaria` (Task 1).
- Produces: `validarRecetaCandidata` (misma firma) que acepta ítems `maquinaria` con `modalidad` y rebota maquinaria sin modalidad / artefacto fuera de material.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/cotizador/__tests__/candidata.test.ts`, mirar cómo los tests existentes arman una receta base válida (hay un helper o un literal repetido — reutilizarlo) y agregar al final del `describe` existente:

```ts
function itemBase(sobre: Partial<ItemReceta>): ItemReceta {
  return {
    nombre: "Ítem de prueba",
    tipo: "material",
    unidad: "u",
    formula: "1",
    origen: { fuente: "test", confianza: "estimado" },
    ...sobre,
  } as ItemReceta;
}

describe("maquinaria y artefacto", () => {
  it("acepta maquinaria con modalidad alquiler", () => {
    const r = recetaValida(); // el helper/literal que ya usan los tests del archivo
    r.etapas[0].items.push(itemBase({ nombre: "Andamio", tipo: "maquinaria", modalidad: "alquiler", unidad: "dia" }));
    expect(validarRecetaCandidata(r).ok).toBe(true);
  });

  it("acepta maquinaria propia", () => {
    const r = recetaValida();
    r.etapas[0].items.push(itemBase({ nombre: "Sierra de sable", tipo: "maquinaria", modalidad: "propia" }));
    expect(validarRecetaCandidata(r).ok).toBe(true);
  });

  it("rebota maquinaria sin modalidad", () => {
    const r = recetaValida();
    r.etapas[0].items.push(itemBase({ nombre: "Andamio", tipo: "maquinaria" }));
    const res = validarRecetaCandidata(r);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.violaciones.join(" ")).toMatch(/modalidad/);
  });

  it("rebota modalidad en un ítem que no es maquinaria", () => {
    const r = recetaValida();
    r.etapas[0].items.push(itemBase({ nombre: "Látex", modalidad: "alquiler" }));
    expect(validarRecetaCandidata(r).ok).toBe(false);
  });

  it("acepta artefacto en material y lo rebota en MO", () => {
    const ok = recetaValida();
    ok.etapas[0].items.push(itemBase({ nombre: "Grifería", artefacto: true }));
    expect(validarRecetaCandidata(ok).ok).toBe(true);

    const mal = recetaValida();
    mal.etapas[0].items.push(itemBase({ nombre: "Colocación", tipo: "mano_de_obra", artefacto: true }));
    expect(validarRecetaCandidata(mal).ok).toBe(false);
  });
});
```

Si el archivo no tiene un helper `recetaValida()`, extraer el literal de receta válida que ya usan los tests a una función local `recetaValida()` que devuelve una copia fresca (`structuredClone` del literal).

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/cotizador/__tests__/candidata.test.ts` (raíz)
Expected: FAIL — hoy `validarItem` rebota `tipo: "maquinaria"` como "tipo inválido" y no valida modalidad/artefacto.

- [ ] **Step 3: Implementar en `candidata.ts`**

En `validarItem`, reemplazar la línea:

```ts
  if (item?.tipo !== "material" && item?.tipo !== "mano_de_obra") v.push(`${ref}: tipo inválido`);
```

por:

```ts
  const TIPOS_ITEM: TipoItem[] = ["material", "mano_de_obra", "maquinaria"];
  if (!TIPOS_ITEM.includes(item?.tipo)) v.push(`${ref}: tipo inválido`);
  // Maquinaria (capex o alquiler, decisión 09/08): sin modalidad no se sabe si
  // suma al costo, así que la candidata rebota. Y la modalidad fuera de
  // maquinaria es un dato sin sentido que se rechaza para que no se acumule.
  if (item?.tipo === "maquinaria" && item?.modalidad !== "alquiler" && item?.modalidad !== "propia") {
    v.push(`${ref}: maquinaria sin modalidad (alquiler | propia)`);
  }
  if (item?.tipo !== "maquinaria" && item?.modalidad != null) {
    v.push(`${ref}: modalidad solo aplica a maquinaria`);
  }
  if (item?.artefacto != null && (typeof item.artefacto !== "boolean" || item.tipo !== "material")) {
    v.push(`${ref}: artefacto solo aplica a materiales (boolean)`);
  }
```

y sumar `TipoItem` al import de tipos del archivo.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run src/lib/cotizador/__tests__/candidata.test.ts`
Expected: PASS todos (los viejos y los nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/candidata.ts src/lib/cotizador/__tests__/candidata.test.ts
git commit -m "feat(cotizador): la candidata valida maquinaria con modalidad y artefacto solo en materiales"
```

---

### Task 3: Motor — instanciar y totalizar maquinaria (propia no suma)

**Files:**
- Modify: `src/lib/cotizador/instanciar.ts`, `src/lib/cotizador/totales.ts`
- Test: `src/lib/cotizador/__tests__/instanciar.test.ts`, `src/lib/cotizador/__tests__/totales.test.ts` (agregar a los existentes; si no existen con ese nombre, buscar dónde se testean `instanciarItems`/`calcularTotales` con `grep -rl "instanciarItems" src/lib/cotizador/__tests__` y agregar ahí)

**Interfaces:**
- Consumes: tipos de Task 1.
- Produces: `instanciarItems` propaga `modalidad`/`artefacto`; maquinaria `propia` sale con `sin_precio: false`, `precio_min/max: null`, subtotales 0. `calcularTotales` suma maquinaria `alquiler` en `maquinaria_min/max` (y al subtotal); `propia` no suma nada.

- [ ] **Step 1: Tests que fallan**

```ts
// en el test de instanciar
it("maquinaria propia se lista sin precio ni subtotal, y no pide decisión", () => {
  const receta = recetaConItems([
    { nombre: "Sierra de sable", tipo: "maquinaria", modalidad: "propia", unidad: "u", formula: "1", origen: { fuente: "t", confianza: "estimado" } },
  ]);
  const [item] = instanciarItems(receta, {}, {});
  expect(item.modalidad).toBe("propia");
  expect(item.sin_precio).toBe(false);
  expect(item.precio_min).toBeNull();
  expect(item.subtotal_min).toBe(0);
  expect(item.subtotal_max).toBe(0);
});

it("maquinaria alquiler se precia como un material", () => {
  const receta = recetaConItems([
    { nombre: "Andamio", tipo: "maquinaria", modalidad: "alquiler", unidad: "dia", formula: "3", origen: { fuente: "t", confianza: "estimado" } },
  ]);
  const [item] = instanciarItems(receta, {}, {
    Andamio: { internet: { valor: 20000, fuente: "alquilerandamios.com.ar", fecha: "2026-08-17" } },
  });
  expect(item.sin_precio).toBe(false);
  expect(item.subtotal_min).toBe(60000);
});

// en el test de totales
it("la maquinaria alquilada suma en su bucket y la propia no suma", () => {
  const base = { etapa: "e", unidad: "u" as const, formula: "1", cantidad_base: 1, desperdicio_pct: 0, cantidad: 1, precios: {}, divergencia_pct: null, rango_fisico: undefined, notas: undefined };
  const items: ItemDesglose[] = [
    { ...base, nombre: "Andamio", tipo: "maquinaria", modalidad: "alquiler", precio_min: 100, precio_max: 100, subtotal_min: 100, subtotal_max: 100, sin_precio: false },
    { ...base, nombre: "Sierra propia", tipo: "maquinaria", modalidad: "propia", precio_min: null, precio_max: null, subtotal_min: 0, subtotal_max: 0, sin_precio: false },
    { ...base, nombre: "Látex", tipo: "material", precio_min: 50, precio_max: 50, subtotal_min: 50, subtotal_max: 50, sin_precio: false },
  ];
  const t = calcularTotales(items, [], { imprevistos_pct: 0 });
  expect(t.maquinaria_min).toBe(100);
  expect(t.materiales_min).toBe(50);
  expect(t.subtotal_min).toBe(150);
  expect(t.total_min).toBe(150);
});
```

Ajustar los helpers (`recetaConItems`, forma de `ItemDesglose`) al estilo que ya usan esos archivos de test.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/lib/cotizador/__tests__/` 
Expected: FAIL — hoy la maquinaria cae al `else` de MO en totales, y `sin_precio` de propia daría `true`.

- [ ] **Step 3: Implementar**

En `instanciarItems` (`instanciar.ts`), dentro del loop de ítems, después de calcular `cantidad` y antes del bloque de precios, insertar el corte de propia:

```ts
      // Maquinaria PROPIA (capex): se reconoce y se lista, pero no lleva precio
      // ni suma al costo — y no puede caer a la cola de decisiones como
      // "sin precio", porque no hay precio que decidir.
      if (item.tipo === "maquinaria" && item.modalidad === "propia") {
        items.push({
          nombre: item.nombre,
          etapa: etapa.nombre,
          tipo: item.tipo,
          modalidad: item.modalidad,
          unidad: item.unidad,
          formula: item.formula,
          cantidad_base: roundArs2(cantidadBase),
          desperdicio_pct: desperdicio,
          cantidad,
          precios: {},
          precio_min: null,
          precio_max: null,
          subtotal_min: 0,
          subtotal_max: 0,
          divergencia_pct: null,
          sin_precio: false,
          rango_fisico: item.rango_fisico,
          notas: item.notas,
        });
        continue;
      }
```

Y en el `items.push({...})` final existente, agregar el passthrough después de `tipo: item.tipo,`:

```ts
        ...(item.modalidad ? { modalidad: item.modalidad } : {}),
        ...(item.artefacto ? { artefacto: true } : {}),
```

En `calcularTotales` (`totales.ts`), reemplazar el loop de suma por:

```ts
  let materialesMin = 0;
  let materialesMax = 0;
  let moMin = 0;
  let moMax = 0;
  let maquinariaMin = 0;
  let maquinariaMax = 0;
  for (const it of items) {
    if (it.tipo === "maquinaria") {
      // La propia (capex) ya viene con subtotales 0 desde instanciar; sumarla
      // igual sería doble seguro, pero el criterio queda explícito acá:
      if (it.modalidad === "propia") continue;
      maquinariaMin += it.subtotal_min;
      maquinariaMax += it.subtotal_max;
    } else if (it.tipo === "material") {
      materialesMin += it.subtotal_min;
      materialesMax += it.subtotal_max;
    } else {
      moMin += it.subtotal_min;
      moMax += it.subtotal_max;
    }
  }
```

y en el objeto de retorno, después de `mano_de_obra_max: moMax,` agregar `maquinaria_min: maquinariaMin, maquinaria_max: maquinariaMax,`; y sumar maquinaria al subtotal: `const subtotalMin = materialesMin + moMin + maquinariaMin + extrasMin;` (ídem max).

- [ ] **Step 4: Correr TODA la suite del motor**

Run: `npm test` (raíz)
Expected: PASS (572 + los nuevos). Si algún test viejo fijaba la forma exacta de `TotalesDesglose`, actualizarlo sumando los dos campos nuevos con 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cotizador/instanciar.ts src/lib/cotizador/totales.ts src/lib/cotizador/__tests__/
git commit -m "feat(cotizador): maquinaria en el motor — alquiler suma en bucket propio, propia se lista sin costo"
```

---

### Task 4: Migración `cotizador_intake` (⚠️ aplicar requiere OK de Eze)

**Files:**
- Create: `supabase/migrations/20260817120000_cotizador_intake.sql`

**Interfaces:**
- Produces: tabla `public.cotizador_intake` con UNA fila por cotización (`cotizacion_id` unique), estados `esperando_ola|propuesta_lista|confirmada|error`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Puerta de entrada del cotizador (spec 2026-08-17): la propuesta de
-- reconocimiento es dato del TALLER (antes del número). Una fila por
-- cotización; el bridge local escribe la propuesta por PostgREST (service
-- role), el visor la lee por su /api/intake. Nada acá toca plata ni estado
-- de cotizaciones: eso entra por endpoints de App RAVN.
create table if not exists public.cotizador_intake (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  estado text not null default 'esperando_ola'
    check (estado in ('esperando_ola', 'propuesta_lista', 'confirmada', 'error')),
  -- Lo que tipeó/dictó Eze al entrar (además de los archivos adjuntos).
  texto text,
  -- PropuestaReconocimiento (contrato en apps/cotizador-ravn/src/bridge/intake-contract.ts).
  propuesta jsonb,
  -- Motivo cuando estado = 'error' (archivo ilegible, JSON inválido de la ola…).
  error text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create unique index if not exists cotizador_intake_cotizacion_uidx
  on public.cotizador_intake (cotizacion_id);

comment on table public.cotizador_intake is
  'Puerta de entrada del Cotizador RAVN: propuesta de reconocimiento de la ola de intake, pendiente de confirmación de Eze. on delete cascade: si se borra la cotización se va su intake.';

alter table public.cotizador_intake enable row level security;
revoke all on public.cotizador_intake from anon;

-- Mismo criterio que cotizador_taller_items: lectura/escritura authenticated,
-- el acceso real entra por service role (bridge y server del cotizador).
drop policy if exists "cotizador_intake_select_auth" on public.cotizador_intake;
create policy "cotizador_intake_select_auth" on public.cotizador_intake
  for select to authenticated using (true);

drop policy if exists "cotizador_intake_insert_auth" on public.cotizador_intake;
create policy "cotizador_intake_insert_auth" on public.cotizador_intake
  for insert to authenticated with check (true);

drop policy if exists "cotizador_intake_update_auth" on public.cotizador_intake;
create policy "cotizador_intake_update_auth" on public.cotizador_intake
  for update to authenticated using (true) with check (true);

drop policy if exists "cotizador_intake_delete_no_bot" on public.cotizador_intake;
create policy "cotizador_intake_delete_no_bot" on public.cotizador_intake
  for delete to authenticated using (not public.es_bot());
```

Antes de darla por buena, comparar policies/naming contra `supabase/migrations/20260816180000_cotizador_taller.sql` (el molde) y calcar cualquier detalle que difiera (p. ej. grants a `service_role`).

- [ ] **Step 2: FRENAR y pedir aprobación**

Decirle a Eze, textual: "Eze, aprobame aplicar la migración `cotizador_intake` a la base de producción para que la puerta tenga dónde dejar la propuesta". NO aplicar sin el OK. Con el OK: aplicar con el MCP de Supabase (`apply_migration`) y verificar con `select * from cotizador_intake limit 1` (0 filas, sin error).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817120000_cotizador_intake.sql
git commit -m "feat(cotizador): tabla cotizador_intake — la propuesta de reconocimiento de la puerta"
```

---

### Task 5: App RAVN — `POST /api/cotizaciones/intake` (crear borrador) + allowlist

**Files:**
- Create: `src/app/api/cotizaciones/intake/route.ts`
- Modify: `src/middleware.ts`
- Test: donde vivan los tests de middleware (`grep -rl "bypassCotizadorWritePermitido" src --include="*.test.ts"`; si no hay, crear `src/__tests__/middleware-cotizador.test.ts` con vitest siguiendo el patrón de tests de la raíz)

**Interfaces:**
- Produces: `POST /api/cotizaciones/intake` body `{ titulo: string }` → `201 { id: string }`. Crea `cotizaciones` en `borrador` con `ficha: { origen: "puerta-cotizador" }`, `desglose: {}`. Allowlisteada para `x-ravn-cotizador-write`.

- [ ] **Step 1: Test del middleware que falla**

```ts
import { bypassCotizadorWritePermitido, bypassCotizadorReadPermitido } from "@/middleware";

it("la credencial de escritura puede crear el borrador de la puerta", () => {
  expect(bypassCotizadorWritePermitido("/api/cotizaciones/intake", "POST")).toBe(true);
});
it("la puerta no abre nada más", () => {
  expect(bypassCotizadorWritePermitido("/api/cotizaciones/intake", "GET")).toBe(false);
  expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/aprobar", "POST")).toBe(false);
});
```

Run: `npx vitest run <archivo>` → FAIL.

- [ ] **Step 2: Allowlist**

En `src/middleware.ts`, en `RUTAS_BYPASS_COTIZADOR_WRITE`, agregar (y actualizar el comentario del bloque: ya no es "exactamente una ruta", es "el pase + la puerta de entrada"):

```ts
  { patron: /^\/api\/cotizaciones\/intake$/, metodos: ["POST"] },
```

**OJO al orden de matching:** `/api/cotizaciones/intake` también matchea `^\/api\/cotizaciones\/[^/]+$` (GET del detalle en la allowlist de LECTURA). No es problema (métodos distintos), pero verificar con el test de arriba que un GET a `/intake` no pasa por escritura.

- [ ] **Step 3: La ruta**

`src/app/api/cotizaciones/intake/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/cotizaciones/intake — la puerta de entrada del Cotizador.
 *
 * Crea SOLO un borrador vacío de alcance (guard `trg_cotizaciones_guard`:
 * borrador no exige receta). No acepta estado, desglose ni totales: la única
 * forma de que esta cotización se active es confirmar el reconocimiento, que
 * crea la receta candidata. A diferencia de POST /api/cotizaciones (sesión),
 * esta ruta está allowlisteada para la credencial de escritura del Cotizador
 * y por eso su superficie es mínima a propósito.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { titulo?: unknown } | null;
  const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";
  if (!titulo) return NextResponse.json({ error: "titulo requerido" }, { status: 400 });
  if (titulo.length > 200) {
    return NextResponse.json({ error: "titulo demasiado largo (máx. 200)" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .insert({
      titulo,
      estado: "borrador",
      ficha: { origen: "puerta-cotizador" },
      desglose: {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
```

- [ ] **Step 4: Correr tests + typecheck**

Run: `npx vitest run <test de middleware>` y `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cotizaciones/intake/route.ts src/middleware.ts src/__tests__/
git commit -m "feat(cotizador): POST /api/cotizaciones/intake — el borrador de la puerta, allowlisteado para la write credential"
```

---

### Task 6: App RAVN — allowlist de archivos (subir por la puerta, leer para la ola)

**Files:**
- Modify: `src/middleware.ts`
- Test: el mismo archivo de tests de Task 5

**Interfaces:**
- Produces: con `x-ravn-cotizador-write`: `POST /api/cotizaciones/[id]/archivos`, `POST .../archivos/firmar`, `POST .../archivos/confirmar`. Con `x-ravn-cotizador-read`: `GET /api/cotizaciones/[id]/archivos` (para firmar URLs que baja la ola).

- [ ] **Step 1: Tests que fallan**

```ts
it("la write credential puede adjuntar por las tres puertas de subida", () => {
  for (const p of [
    "/api/cotizaciones/abc/archivos",
    "/api/cotizaciones/abc/archivos/firmar",
    "/api/cotizaciones/abc/archivos/confirmar",
  ]) {
    expect(bypassCotizadorWritePermitido(p, "POST")).toBe(true);
  }
});
it("la write credential NO lee archivos ni toca otras subrutas", () => {
  expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/archivos", "GET")).toBe(false);
  expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/archivos/xyz", "PATCH")).toBe(false);
});
it("la read credential lee los archivos de la cotización (URLs firmadas para la ola)", () => {
  expect(bypassCotizadorReadPermitido("/api/cotizaciones/abc/archivos", "GET")).toBe(true);
  expect(bypassCotizadorReadPermitido("/api/cotizaciones/abc/archivos", "POST")).toBe(false);
});
```

Run → FAIL.

- [ ] **Step 2: Implementar**

En `RUTAS_BYPASS_COTIZADOR_WRITE` agregar:

```ts
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos\/firmar$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos\/confirmar$/, metodos: ["POST"] },
```

En `RUTAS_BYPASS_COTIZADOR_READ` agregar:

```ts
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos$/, metodos: ["GET"] },
```

- [ ] **Step 3: Correr tests, typecheck, commit**

```bash
npx vitest run <test> && npx tsc --noEmit
git add src/middleware.ts src/__tests__/
git commit -m "feat(cotizador): allowlist de archivos para la puerta — subir con write, firmar lectura con read"
```

---

### Task 7: App RAVN — precios de la confirmación (`confirmacion.ts`, puro)

**Files:**
- Create: `src/lib/cotizador/confirmacion.ts`
- Test: `src/lib/cotizador/__tests__/confirmacion.test.ts`

**Interfaces:**
- Consumes: `PrecioItem`, `PrecioFechado`, `PrecioItemRow` de `tipos.ts`.
- Produces:
  ```ts
  export type ReferenciaPrecio = { nombre: string; valor: number; fuente: string; fecha: string; origen: "sismat" | "internet" };
  export function preciosParaConfirmacion(nombres: string[], cache: PrecioItemRow[], referencias: ReferenciaPrecio[]): Record<string, PrecioItem>;
  export function validarReferencia(v: unknown): ReferenciaPrecio | { error: string };
  ```

- [ ] **Step 1: Tests que fallan**

```ts
import { preciosParaConfirmacion, validarReferencia } from "../confirmacion";

const row = (item: string, origen: "sismat" | "internet" | "eze", valor: number, fecha: string) =>
  ({ item, origen, valor, fuente: origen === "eze" ? "Eze" : origen, fecha, revisado_at: fecha }) as const;

describe("preciosParaConfirmacion", () => {
  it("arma el PrecioItem desde el cache", () => {
    const p = preciosParaConfirmacion(["Látex"], [row("Látex", "sismat", 100, "2026-08-01")], []);
    expect(p["Látex"].sismat?.valor).toBe(100);
  });

  it("la referencia de la ola gana si es más nueva; pierde si es más vieja", () => {
    const cache = [row("Látex", "internet", 100, "2026-08-10")];
    const nueva = preciosParaConfirmacion(["Látex"], cache, [
      { nombre: "Látex", valor: 120, fuente: "easy.com.ar", fecha: "2026-08-17", origen: "internet" },
    ]);
    expect(nueva["Látex"].internet?.valor).toBe(120);
    const vieja = preciosParaConfirmacion(["Látex"], cache, [
      { nombre: "Látex", valor: 80, fuente: "easy.com.ar", fecha: "2026-07-01", origen: "internet" },
    ]);
    expect(vieja["Látex"].internet?.valor).toBe(100);
  });

  it("eze sale SOLO del cache — una referencia nunca lo pisa", () => {
    const p = preciosParaConfirmacion(["Látex"], [row("Látex", "eze", 90, "2026-08-01")], [
      { nombre: "Látex", valor: 120, fuente: "easy", fecha: "2026-08-17", origen: "internet" },
    ]);
    expect(p["Látex"].eze?.valor).toBe(90);
    expect(p["Látex"].internet?.valor).toBe(120);
  });

  it("un ítem sin nada queda sin entrada (sin_precio aguas abajo)", () => {
    expect(preciosParaConfirmacion(["Nada"], [], [])["Nada"]).toBeUndefined();
  });

  it("una referencia de un ítem que no está en la receta se ignora", () => {
    const p = preciosParaConfirmacion(["Látex"], [], [
      { nombre: "Otro", valor: 1, fuente: "x", fecha: "2026-08-17", origen: "internet" },
    ]);
    expect(Object.keys(p)).toEqual([]);
  });
});

describe("validarReferencia", () => {
  it("rebota origen eze/retail, valores no positivos y fechas mal formadas", () => {
    expect("error" in (validarReferencia({ nombre: "x", valor: 1, fuente: "f", fecha: "2026-08-17", origen: "eze" }) as object)).toBe(true);
    expect("error" in (validarReferencia({ nombre: "x", valor: 0, fuente: "f", fecha: "2026-08-17", origen: "internet" }) as object)).toBe(true);
    expect("error" in (validarReferencia({ nombre: "x", valor: 1, fuente: "f", fecha: "17/08", origen: "internet" }) as object)).toBe(true);
    expect("error" in (validarReferencia({ nombre: "x", valor: 1, fuente: "f", fecha: "2026-08-17", origen: "internet" }) as object)).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/cotizador/__tests__/confirmacion.test.ts` → FAIL (módulo no existe).

- [ ] **Step 2: Implementar `confirmacion.ts`**

```ts
/**
 * Precios de la CONFIRMACIÓN del reconocimiento (puerta de entrada, spec
 * 2026-08-17): el motor pone el CUÁNTO con fuente fechada. Acá se fusionan el
 * cache global `precios_items` y las referencias que la ola trajo fechadas.
 * Regla: para sismat/internet gana la fecha más nueva; `eze` es intocable —
 * sale solo del cache, porque es el número que él tipeó alguna vez.
 */
import type { PrecioFechado, PrecioItem, PrecioItemRow } from "./tipos";

export type ReferenciaPrecio = {
  nombre: string;
  valor: number;
  fuente: string;
  fecha: string; // YYYY-MM-DD
  origen: "sismat" | "internet";
};

export function validarReferencia(v: unknown): ReferenciaPrecio | { error: string } {
  const r = v as ReferenciaPrecio;
  if (!r || typeof r !== "object") return { error: "referencia inválida" };
  if (typeof r.nombre !== "string" || !r.nombre.trim()) return { error: "referencia sin nombre" };
  if (!(typeof r.valor === "number" && Number.isFinite(r.valor) && r.valor > 0)) {
    return { error: `referencia "${r.nombre}": valor inválido` };
  }
  if (typeof r.fuente !== "string" || !r.fuente.trim()) {
    return { error: `referencia "${r.nombre}": sin fuente (un precio sin fuente es un invento)` };
  }
  if (typeof r.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) {
    return { error: `referencia "${r.nombre}": fecha inválida (YYYY-MM-DD)` };
  }
  if (r.origen !== "sismat" && r.origen !== "internet") {
    return { error: `referencia "${r.nombre}": origen inválido (sismat | internet)` };
  }
  return { nombre: r.nombre, valor: r.valor, fuente: r.fuente, fecha: r.fecha, origen: r.origen };
}

export function preciosParaConfirmacion(
  nombres: string[],
  cache: PrecioItemRow[],
  referencias: ReferenciaPrecio[]
): Record<string, PrecioItem> {
  const enReceta = new Set(nombres);
  const out: Record<string, PrecioItem> = {};

  const slot = (nombre: string): PrecioItem => (out[nombre] ??= {});

  for (const fila of cache) {
    if (!enReceta.has(fila.item)) continue;
    const fechado: PrecioFechado = { valor: fila.valor, fuente: fila.fuente, fecha: fila.fecha };
    slot(fila.item)[fila.origen] = fechado;
  }

  for (const ref of referencias) {
    if (!enReceta.has(ref.nombre)) continue;
    const actual = slot(ref.nombre)[ref.origen];
    // Fecha ISO: la comparación lexicográfica ES la cronológica.
    if (!actual || ref.fecha > actual.fecha) {
      slot(ref.nombre)[ref.origen] = { valor: ref.valor, fuente: ref.fuente, fecha: ref.fecha };
    }
  }

  // Entradas que quedaron vacías (ni cache ni referencia) no se devuelven:
  // aguas abajo `instanciarItems` las lee como sin_precio.
  for (const nombre of Object.keys(out)) {
    if (Object.keys(out[nombre]).length === 0) delete out[nombre];
  }
  return out;
}
```

- [ ] **Step 3: Correr, ver verde, commit**

```bash
npx vitest run src/lib/cotizador/__tests__/confirmacion.test.ts
git add src/lib/cotizador/confirmacion.ts src/lib/cotizador/__tests__/confirmacion.test.ts
git commit -m "feat(cotizador): fusión de precios de la confirmación — cache + referencias de la ola, fecha más nueva gana"
```

---

### Task 8: App RAVN — `POST /api/cotizaciones/[id]/confirmar-reconocimiento` + allowlist

**Files:**
- Create: `src/app/api/cotizaciones/[id]/confirmar-reconocimiento/route.ts`
- Modify: `src/middleware.ts`
- Test: middleware test (mismo archivo de Task 5); la ruta se verifica por curl en Task 14

**Interfaces:**
- Consumes: `validarRecetaCandidata` (candidata.ts), `cotizar` (cotizar.ts), `preciosParaConfirmacion`/`validarReferencia` (Task 7), `IMPREVISTOS_DEFAULT_PCT`.
- Produces: `POST` body:
  ```ts
  {
    receta: Receta;                       // estado "candidata", sin id — la valida validarRecetaCandidata
    parametros: Record<string, number | string>;
    zona?: string | null;
    precios_referencia?: ReferenciaPrecio[];
  }
  ```
  → `200 { ok: true, receta_id, total_min, total_max, sin_precio: string[] }` · `409` si la cotización no está en `borrador` · `400` con `violaciones` si la candidata rebota.

- [ ] **Step 1: Test de allowlist que falla, luego allowlist**

Test:
```ts
it("la write credential puede confirmar el reconocimiento", () => {
  expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/confirmar-reconocimiento", "POST")).toBe(true);
});
```
Allowlist (`RUTAS_BYPASS_COTIZADOR_WRITE`):
```ts
  { patron: /^\/api\/cotizaciones\/[^/]+\/confirmar-reconocimiento$/, metodos: ["POST"] },
```

- [ ] **Step 2: La ruta**

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { validarRecetaCandidata } from "@/lib/cotizador/candidata";
import { cotizar, IMPREVISTOS_DEFAULT_PCT } from "@/lib/cotizador/cotizar";
import {
  preciosParaConfirmacion,
  validarReferencia,
  type ReferenciaPrecio,
} from "@/lib/cotizador/confirmacion";
import type { PrecioItemRow, Receta } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cotizaciones/[id]/confirmar-reconocimiento — el acto que convierte
 * la propuesta confirmada por Eze en cotización de verdad.
 *
 * Crea la receta CANDIDATA (validada: cada cantidad con origen, lo ambiguo en
 * preguntas_abiertas) y pasa la cotización borrador → en_revision con su
 * receta_id. El guard `trg_cotizaciones_guard` queda satisfecho POR DISEÑO:
 * la receta existe antes del cambio de estado.
 *
 * Los precios no los trae la lectura: acá los pone el motor, fusionando el
 * cache `precios_items` con las referencias fechadas que la ola investigó.
 * Lo que queda sin precio cae como sin_precio a la cola del visor.
 *
 * Esta credencial NO puede aprobar, emitir ni tocar plata (allowlist).
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    receta?: unknown;
    parametros?: unknown;
    zona?: unknown;
    precios_referencia?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  // ── Validación de forma antes de tocar la base ────────────────────────────
  const validada = validarRecetaCandidata(body.receta);
  if (!validada.ok) {
    return NextResponse.json(
      { error: "La receta candidata no pasa la ley 1", violaciones: validada.violaciones },
      { status: 400 }
    );
  }
  const receta = validada.receta;

  const parametros =
    body.parametros && typeof body.parametros === "object" && !Array.isArray(body.parametros)
      ? (body.parametros as Record<string, number | string>)
      : {};

  const referencias: ReferenciaPrecio[] = [];
  for (const cruda of Array.isArray(body.precios_referencia) ? body.precios_referencia : []) {
    const ref = validarReferencia(cruda);
    if ("error" in ref) return NextResponse.json({ error: ref.error }, { status: 400 });
    referencias.push(ref);
  }
  const zona = typeof body.zona === "string" && body.zona.trim() ? body.zona.trim() : null;

  // ── La cotización tiene que ser un borrador ───────────────────────────────
  const sb = createSupabaseAdminClient();
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("id, estado, receta_id")
    .eq("id", id)
    .maybeSingle();
  if (errCot) return NextResponse.json({ error: errCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (cot.estado !== "borrador") {
    return NextResponse.json(
      { error: "Esta cotización ya está confirmada — el reconocimiento no la toca." },
      { status: 409 }
    );
  }

  // ── Precios: cache global + referencias de la ola ─────────────────────────
  const nombres = receta.etapas.flatMap((e) => e.items.map((i) => i.nombre));
  const { data: cacheRows, error: errCache } = await sb
    .from("precios_items")
    .select("*")
    .in("item", nombres);
  if (errCache) return NextResponse.json({ error: errCache.message }, { status: 500 });
  const precios = preciosParaConfirmacion(
    nombres,
    (cacheRows ?? []) as PrecioItemRow[],
    referencias
  );

  // ── El motor corre ANTES de escribir nada: si revienta, no queda basura ───
  let calculada;
  try {
    calculada = cotizar({
      receta,
      parametros,
      precios,
      imprevistos_pct: IMPREVISTOS_DEFAULT_PCT,
      zona: zona ?? undefined,
      dudas: receta.preguntas_abiertas ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "El motor no pudo cotizar la candidata" },
      { status: 400 }
    );
  }

  // ── Escritura: receta primero, cotización después ─────────────────────────
  const { data: recetaRow, error: errReceta } = await sb
    .from("recetas")
    .insert({
      nombre: receta.nombre,
      titulo: receta.titulo,
      estado: "candidata",
      parametros: receta.parametros,
      etapas: receta.etapas,
      checklist: receta.checklist,
      fuentes: receta.fuentes,
      version: receta.version,
      preguntas_abiertas: receta.preguntas_abiertas ?? [],
    })
    .select("id")
    .single();
  if (errReceta) return NextResponse.json({ error: errReceta.message }, { status: 500 });

  const { data: actualizada, error: errUpd } = await sb
    .from("cotizaciones")
    .update({
      estado: "en_revision",
      receta_id: recetaRow.id,
      zona,
      desglose: calculada.desglose,
      revision: calculada.revision,
      total_min: calculada.total_min,
      total_max: calculada.total_max,
    })
    .eq("id", id)
    .eq("estado", "borrador")
    .select("id");
  if (errUpd || !actualizada || actualizada.length === 0) {
    // La cotización cambió de estado en el medio (o la base rechazó): la
    // receta recién creada quedaría huérfana — se limpia, best effort, y se
    // dice la verdad. Reintentar es seguro: nada quedó a medias.
    await sb.from("recetas").delete().eq("id", recetaRow.id);
    return NextResponse.json(
      { error: errUpd?.message ?? "La cotización dejó de ser borrador mientras confirmabas — recargá." },
      { status: errUpd ? 500 : 409 }
    );
  }

  const sinPrecio = calculada.desglose.items
    .filter((i) => i.sin_precio)
    .map((i) => i.nombre);

  return NextResponse.json({
    ok: true,
    receta_id: recetaRow.id,
    total_min: calculada.total_min,
    total_max: calculada.total_max,
    sin_precio: sinPrecio,
  });
}
```

Antes de darla por buena: mirar la tabla `recetas` real (`grep -n "recetas" supabase/migrations/*.sql | head`) y ajustar el insert a las columnas exactas (si `nombre` tiene unique, el slug de Task 10 ya lo hace único por cotización; si hay columnas NOT NULL extra, completarlas con el default que usen las migraciones).

- [ ] **Step 3: Verificación**

Run: `npx vitest run <middleware test>` · `npx tsc --noEmit` · `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/cotizaciones/[id]/confirmar-reconocimiento/route.ts" src/middleware.ts src/__tests__/
git commit -m "feat(cotizador): confirmar-reconocimiento — receta candidata + en_revision con precios del motor, por la write credential"
```

---

### Task 9: Cotizador — contrato de la propuesta (`intake-contract.ts`)

**Files:**
- Create: `apps/cotizador-ravn/src/bridge/intake-contract.ts`
- Test: `apps/cotizador-ravn/src/bridge/intake-contract.test.ts`

**Interfaces:**
- Produces (lo consumen bridge, panel y traducción):
  ```ts
  export type PropuestaItem = {
    nombre: string;
    tipo: "material" | "mano_de_obra" | "maquinaria";
    modalidad?: "alquiler" | "propia";
    artefacto?: boolean;
    unidad: string;               // se valida contra UNIDADES del motor en la traducción
    cantidad: number;
    origen: { fuente: string; confianza: "verificado" | "estimado" };
    precio_referencia?: { valor: number; fuente: string; fecha: string; origen: "sismat" | "internet" };
    notas?: string;
  };
  export type PropuestaRubro = {
    nombre: string;
    items: PropuestaItem[];
    dias_min?: number;
    dias_max?: number;
    cuadrilla?: number;
  };
  export type PropuestaReconocimiento = {
    titulo: string;
    resumen: string;
    parametros: Array<{ nombre: string; etiqueta: string; valor: number | string }>;
    rubros: PropuestaRubro[];
    preguntas_abiertas: string[];
    fuentes: Array<{ titulo: string; tipo: "obra" | "internet" | "tarifario"; url?: string; fecha: string }>;
  };
  export function validarPropuesta(v: unknown): { ok: true; propuesta: PropuestaReconocimiento } | { ok: false; motivo: string };
  export function extraerJson(texto: string): unknown | null;  // saca el primer bloque ```json ... ``` (o el texto entero si ES json)
  ```

- [ ] **Step 1: Tests que fallan**

```ts
import { extraerJson, validarPropuesta } from "./intake-contract";

const propuestaOk = {
  titulo: "Vanos en Húsares",
  resumen: "Apertura de dos vanos con dintel",
  parametros: [{ nombre: "cantidad_vanos", etiqueta: "Vanos", valor: 2 }],
  rubros: [
    {
      nombre: "Demolición",
      dias_min: 1,
      dias_max: 2,
      cuadrilla: 2,
      items: [
        {
          nombre: "Demolición de vano",
          tipo: "mano_de_obra",
          unidad: "u",
          cantidad: 2,
          origen: { fuente: "lo dice la OT, p.1", confianza: "verificado" },
        },
        {
          nombre: "Sierra de sable",
          tipo: "maquinaria",
          modalidad: "propia",
          unidad: "u",
          cantidad: 1,
          origen: { fuente: "deducido del alcance", confianza: "estimado" },
        },
      ],
    },
  ],
  preguntas_abiertas: ["¿El muro es portante?"],
  fuentes: [{ titulo: "OT adjunta", tipo: "obra", fecha: "2026-08-17" }],
};

it("acepta la propuesta completa", () => {
  expect(validarPropuesta(propuestaOk)).toEqual({ ok: true, propuesta: propuestaOk });
});

it("rebota cantidad no positiva, ítem sin origen y maquinaria sin modalidad", () => {
  const conCantidadMala = structuredClone(propuestaOk);
  conCantidadMala.rubros[0].items[0].cantidad = 0;
  expect(validarPropuesta(conCantidadMala).ok).toBe(false);

  const sinOrigen = structuredClone(propuestaOk) as Record<string, never>;
  delete (sinOrigen as never as { rubros: { items: { origen?: unknown }[] }[] }).rubros[0].items[0].origen;
  expect(validarPropuesta(sinOrigen).ok).toBe(false);

  const sinModalidad = structuredClone(propuestaOk);
  delete sinModalidad.rubros[0].items[1].modalidad;
  expect(validarPropuesta(sinModalidad).ok).toBe(false);
});

it("rebota precio_referencia sin fecha o con origen inventado", () => {
  const p = structuredClone(propuestaOk);
  p.rubros[0].items[0].precio_referencia = { valor: 100, fuente: "easy", fecha: "hoy", origen: "internet" };
  expect(validarPropuesta(p).ok).toBe(false);
});

it("extraerJson saca el bloque cercado o el json pelado, y devuelve null si no hay", () => {
  expect(extraerJson('bla\n```json\n{"a":1}\n```\nchau')).toEqual({ a: 1 });
  expect(extraerJson('{"a":1}')).toEqual({ a: 1 });
  expect(extraerJson("no hay json acá")).toBeNull();
});
```

Run: `cd apps/cotizador-ravn && npx vitest run src/bridge/intake-contract.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

```ts
/**
 * Contrato de la PROPUESTA DE RECONOCIMIENTO (puerta de entrada, spec
 * 2026-08-17). Lo comparten el bridge (que valida lo que devuelve la ola
 * antes de persistirlo), el panel del visor y la traducción a receta
 * candidata. La ley acá es la misma del motor: cada dato con origen; lo
 * ambiguo es pregunta, nunca número inventado.
 */

export type PropuestaItem = { /* … exactamente como en Interfaces … */ };
export type PropuestaRubro = { /* … */ };
export type PropuestaReconocimiento = { /* … */ };

function esTexto(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function esNumeroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
function esFechaIso(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function validarPropuesta(
  v: unknown
): { ok: true; propuesta: PropuestaReconocimiento } | { ok: false; motivo: string } {
  const p = v as PropuestaReconocimiento;
  const mal = (motivo: string) => ({ ok: false as const, motivo });
  if (!p || typeof p !== "object") return mal("la propuesta no es un objeto");
  if (!esTexto(p.titulo)) return mal("falta titulo");
  if (typeof p.resumen !== "string") return mal("falta resumen");
  if (!Array.isArray(p.parametros)) return mal("parametros debe ser lista");
  for (const par of p.parametros) {
    if (!esTexto(par?.nombre) || !esTexto(par?.etiqueta)) return mal("parámetro sin nombre/etiqueta");
    if (typeof par.valor !== "number" && typeof par.valor !== "string") return mal(`parámetro "${par.nombre}" sin valor`);
  }
  if (!Array.isArray(p.rubros) || p.rubros.length === 0) return mal("sin rubros");
  for (const rubro of p.rubros) {
    if (!esTexto(rubro?.nombre)) return mal("rubro sin nombre");
    if (!Array.isArray(rubro.items) || rubro.items.length === 0) return mal(`rubro "${rubro.nombre}" sin ítems`);
    for (const campo of ["dias_min", "dias_max", "cuadrilla"] as const) {
      if (rubro[campo] != null && !esNumeroPositivo(rubro[campo])) return mal(`rubro "${rubro.nombre}": ${campo} inválido`);
    }
    for (const item of rubro.items) {
      const ref = `"${item?.nombre ?? "?"}" (${rubro.nombre})`;
      if (!esTexto(item?.nombre)) return mal(`ítem sin nombre en "${rubro.nombre}"`);
      if (item.tipo !== "material" && item.tipo !== "mano_de_obra" && item.tipo !== "maquinaria") {
        return mal(`${ref}: tipo inválido`);
      }
      if (item.tipo === "maquinaria" && item.modalidad !== "alquiler" && item.modalidad !== "propia") {
        return mal(`${ref}: maquinaria sin modalidad (alquiler | propia)`);
      }
      if (item.tipo !== "maquinaria" && item.modalidad != null) return mal(`${ref}: modalidad solo en maquinaria`);
      if (item.artefacto != null && (typeof item.artefacto !== "boolean" || item.tipo !== "material")) {
        return mal(`${ref}: artefacto solo en materiales`);
      }
      if (!esTexto(item.unidad)) return mal(`${ref}: sin unidad`);
      if (!esNumeroPositivo(item.cantidad)) return mal(`${ref}: cantidad inválida`);
      if (!esTexto(item?.origen?.fuente) || (item.origen.confianza !== "verificado" && item.origen.confianza !== "estimado")) {
        return mal(`${ref}: sin origen (fuente + confianza) — un dato sin fuente es un invento`);
      }
      const pr = item.precio_referencia;
      if (pr != null) {
        if (!esNumeroPositivo(pr.valor) || !esTexto(pr.fuente) || !esFechaIso(pr.fecha) || (pr.origen !== "sismat" && pr.origen !== "internet")) {
          return mal(`${ref}: precio_referencia inválido (valor > 0, fuente, fecha YYYY-MM-DD, origen sismat|internet)`);
        }
      }
    }
  }
  if (!Array.isArray(p.preguntas_abiertas) || !p.preguntas_abiertas.every(esTexto)) {
    return mal("preguntas_abiertas debe ser lista de textos (vacía si no quedó ninguna duda)");
  }
  if (!Array.isArray(p.fuentes) || p.fuentes.length === 0) return mal("sin fuentes");
  for (const f of p.fuentes) {
    if (!esTexto(f?.titulo) || !esFechaIso(f?.fecha)) return mal("fuente sin titulo o fecha");
    if (f.tipo !== "obra" && f.tipo !== "internet" && f.tipo !== "tarifario") return mal(`fuente "${f.titulo}": tipo inválido`);
  }
  return { ok: true, propuesta: p };
}

export function extraerJson(texto: string): unknown | null {
  const cercado = texto.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  const candidato = cercado ? cercado[1] : texto.trim();
  try {
    return JSON.parse(candidato);
  } catch {
    return null;
  }
}
```

(Los tres tipos exportados van completos, calcados de la sección Interfaces.)

- [ ] **Step 3: Correr, verde, commit**

```bash
cd apps/cotizador-ravn && npx vitest run src/bridge/intake-contract.test.ts
git add apps/cotizador-ravn/src/bridge/intake-contract.ts apps/cotizador-ravn/src/bridge/intake-contract.test.ts
git commit -m "feat(cotizador): contrato de la propuesta de reconocimiento — validación compartida bridge/visor"
```

---

### Task 10: Cotizador — traducción propuesta → receta candidata (`reconocimiento.ts`)

**Files:**
- Create: `apps/cotizador-ravn/src/taller/reconocimiento.ts`
- Test: `apps/cotizador-ravn/src/taller/reconocimiento.test.ts`

**Interfaces:**
- Consumes: `PropuestaReconocimiento` (Task 9); tipos del motor por ruta relativa `../../../../src/lib/cotizador/tipos` (mismo patrón que el write adapter).
- Produces:
  ```ts
  export type ConfirmacionPayload = {
    receta: Receta;                                   // estado "candidata"
    parametros: Record<string, number | string>;
    zona: string | null;
    precios_referencia: Array<{ nombre: string; valor: number; fuente: string; fecha: string; origen: "sismat" | "internet" }>;
  };
  export function recetaDesdePropuesta(propuesta: PropuestaReconocimiento, cotizacionId: string, zona: string | null): ConfirmacionPayload;
  ```

- [ ] **Step 1: Tests que fallan**

```ts
import { recetaDesdePropuesta } from "./reconocimiento";
// reutilizar el literal propuestaOk del test del contrato (importarlo o copiarlo local)

const ID = "3718c02c-4c36-452c-bae9-48b972935289";

it("traduce rubros a etapas con cantidades literales como fórmula", () => {
  const { receta } = recetaDesdePropuesta(propuestaOk, ID, null);
  expect(receta.estado).toBe("candidata");
  expect(receta.nombre).toBe(`puerta-vanos-en-husares-${ID.slice(0, 8)}`);
  expect(receta.etapas[0].nombre).toBe("Demolición");
  expect(receta.etapas[0].orden).toBe(1);
  expect(receta.etapas[0].items[0].formula).toBe("2");
  expect(receta.etapas[0].items[1].tipo).toBe("maquinaria");
  expect(receta.etapas[0].items[1].modalidad).toBe("propia");
  expect(receta.preguntas_abiertas).toEqual(["¿El muro es portante?"]);
});

it("una unidad que el motor no conoce cae a 'u' y deja nota de traza", () => {
  const p = structuredClone(propuestaOk);
  p.rubros[0].items[0].unidad = "jornada";
  const { receta } = recetaDesdePropuesta(p, ID, null);
  expect(receta.etapas[0].items[0].unidad).toBe("u");
  expect(receta.etapas[0].items[0].notas).toMatch(/jornada/);
});

it("junta los precios de referencia y los parámetros numéricos", () => {
  const p = structuredClone(propuestaOk);
  p.rubros[0].items[0].precio_referencia = { valor: 45000, fuente: "homesolution.net", fecha: "2026-08-17", origen: "internet" };
  const payload = recetaDesdePropuesta(p, ID, "Nordelta");
  expect(payload.precios_referencia).toEqual([
    { nombre: "Demolición de vano", valor: 45000, fuente: "homesolution.net", fecha: "2026-08-17", origen: "internet" },
  ]);
  expect(payload.parametros).toEqual({ cantidad_vanos: 2 });
  expect(payload.zona).toBe("Nordelta");
});
```

Run → FAIL.

- [ ] **Step 2: Implementar**

```ts
/**
 * Traducción propuesta (confirmada por Eze) → receta CANDIDATA.
 *
 * Decisiones del plan 2026-08-17:
 * - Rubro = etapa; el orden es el de la propuesta.
 * - Cantidades LITERALES como fórmula ("12"): la parametrización real es
 *   evolución posterior. evaluarFormula acepta literales, la candidata pasa.
 * - Unidad fuera del enum del motor cae a "u" con nota de traza (no se
 *   inventa una conversión).
 * - Los parámetros de la propuesta viajan como parámetros NO requeridos de la
 *   receta (traza de qué midió la ola), con su valor en `parametros`.
 */
import type { Receta, Unidad } from "../../../../src/lib/cotizador/tipos";
import type { PropuestaItem, PropuestaReconocimiento } from "../bridge/intake-contract";

const UNIDADES: Unidad[] = ["m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];

export type ConfirmacionPayload = { /* … como en Interfaces … */ };

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function unidadDelMotor(item: PropuestaItem): { unidad: Unidad; nota?: string } {
  if ((UNIDADES as string[]).includes(item.unidad)) return { unidad: item.unidad as Unidad };
  return { unidad: "u", nota: `unidad original de la propuesta: "${item.unidad}"` };
}

export function recetaDesdePropuesta(
  propuesta: PropuestaReconocimiento,
  cotizacionId: string,
  zona: string | null
): ConfirmacionPayload {
  const parametros: Record<string, number | string> = {};
  for (const par of propuesta.parametros) parametros[par.nombre] = par.valor;

  const precios_referencia: ConfirmacionPayload["precios_referencia"] = [];

  const receta: Receta = {
    nombre: `puerta-${slug(propuesta.titulo)}-${cotizacionId.slice(0, 8)}`,
    titulo: propuesta.titulo,
    estado: "candidata",
    parametros: propuesta.parametros.map((par) => ({
      nombre: par.nombre,
      etiqueta: par.etiqueta,
      tipo: typeof par.valor === "number" ? ("numero" as const) : ("texto" as const),
      requerido: false,
    })),
    etapas: propuesta.rubros.map((rubro, i) => ({
      nombre: rubro.nombre,
      orden: i + 1,
      ...(rubro.dias_min != null ? { dias_min: rubro.dias_min } : {}),
      ...(rubro.dias_max != null ? { dias_max: rubro.dias_max } : {}),
      ...(rubro.cuadrilla != null ? { cuadrilla: rubro.cuadrilla } : {}),
      items: rubro.items.map((item) => {
        const { unidad, nota } = unidadDelMotor(item);
        if (item.precio_referencia) {
          precios_referencia.push({ nombre: item.nombre, ...item.precio_referencia });
        }
        const notas = [item.notas, nota].filter(Boolean).join(" · ");
        return {
          nombre: item.nombre,
          tipo: item.tipo,
          ...(item.modalidad ? { modalidad: item.modalidad } : {}),
          ...(item.artefacto ? { artefacto: true } : {}),
          unidad,
          formula: String(item.cantidad),
          origen: item.origen,
          ...(notas ? { notas } : {}),
        };
      }),
    })),
    checklist: [],
    fuentes: propuesta.fuentes.map((f) => ({
      titulo: f.titulo,
      tipo: f.tipo === "internet" ? ("internet" as const) : f.tipo === "tarifario" ? ("tarifario" as const) : ("obra" as const),
      ...(f.url ? { url: f.url } : {}),
      fecha: f.fecha,
    })),
    version: 1,
    preguntas_abiertas: propuesta.preguntas_abiertas,
  };

  return { receta, parametros, zona, precios_referencia };
}
```

- [ ] **Step 3: Correr, verde, y validar contra el validador REAL**

Agregar un test de integración que importe `validarRecetaCandidata` del motor y verifique que lo que produce la traducción PASA:

```ts
import { validarRecetaCandidata } from "../../../../src/lib/cotizador/candidata";
it("lo que sale de la traducción pasa validarRecetaCandidata", () => {
  const { receta } = recetaDesdePropuesta(propuestaOk, ID, null);
  const res = validarRecetaCandidata(receta);
  expect(res).toEqual({ ok: true, receta });
});
```

Run: `npx vitest run src/taller/reconocimiento.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/cotizador-ravn/src/taller/reconocimiento.ts apps/cotizador-ravn/src/taller/reconocimiento.test.ts
git commit -m "feat(cotizador): traducción propuesta→receta candidata — rubro=etapa, cantidades literales, referencias fechadas"
```

---

### Task 11: Cotizador — intake store (PostgREST) + extensiones de adaptadores + rutas `/api/intake/*`

**Files:**
- Create: `apps/cotizador-ravn/src/taller/intake-store.ts` (+ `intake-store.test.ts`)
- Modify: `apps/cotizador-ravn/src/adapters/app-ravn-write-adapter.ts`, `app-ravn-read-adapter.ts`
- Create: `apps/cotizador-ravn/src/app/api/intake/route.ts`, `intake/archivos/route.ts`, `intake/archivos/firmar/route.ts`, `intake/archivos/confirmar/route.ts`, `intake/ola/route.ts`, `intake/confirmar/route.ts`

**Interfaces:**
- Consumes: `recetaDesdePropuesta` (Task 10), `validarPropuesta` (Task 9), `tallerJson`/`tallerErrorResponse`/`requireQuoteId` (`taller/http.ts`), `isPersistableQuoteId` (`taller/types.ts`).
- Produces (server del cotizador, browser-facing):
  - `POST /api/intake` `{ titulo, texto? }` → `201 { cotizacionId }`
  - `GET /api/intake?quote=` → `{ intake: FilaIntake | null, archivos: Array<{ id, titulo, url }> }`
  - `POST /api/intake/archivos?quote=` (multipart `file`) → `{ ok: true }` (≤4 MB, proxy)
  - `POST /api/intake/archivos/firmar?quote=` `{ nombre, size, contentType }` → `{ upload_url, path }` (>4 MB, PUT directo del browser a Storage)
  - `POST /api/intake/archivos/confirmar?quote=` `{ path, titulo }` → `{ ok: true }`
  - `POST /api/intake/ola?quote=` → `{ wave: { kind: "intake", cotizacionId, texto, archivos: [{ titulo, url }] } }` (el browser lo POSTea al bridge)
  - `POST /api/intake/confirmar?quote=` body `PropuestaReconocimiento` (editada) + `{ zona? }` → `{ ok: true, total_min, total_max, sin_precio }`
- Adaptadores nuevos (server-only, molde exacto del pase):
  ```ts
  // write adapter
  export async function crearIntake(titulo: string): Promise<{ id: string }>;
  export async function subirArchivo(quoteId: string, file: File, titulo: string): Promise<void>;      // multipart a POST .../archivos
  export async function firmarSubida(quoteId: string, args: { nombre: string; size: number; contentType: string }): Promise<{ path: string; token: string }>;
  export async function confirmarSubida(quoteId: string, args: { path: string; titulo: string }): Promise<void>;
  export async function confirmarReconocimiento(quoteId: string, payload: ConfirmacionPayload): Promise<{ recetaId: string; totalMin: number | null; totalMax: number | null; sinPrecio: string[] }>;
  // read adapter
  export async function loadQuoteArchivos(quoteId: string): Promise<Array<{ id: string; titulo: string | null; url: string | null }>>;
  ```
- `intake-store.ts` (PostgREST, molde de `taller/store.ts`):
  ```ts
  export type FilaIntake = { cotizacion_id: string; estado: "esperando_ola" | "propuesta_lista" | "confirmada" | "error"; texto: string | null; propuesta: unknown; error: string | null; actualizado_at: string };
  export function intakeStore(): { crear(cotizacionId: string, texto: string | null): Promise<void>; leer(cotizacionId: string): Promise<FilaIntake | null>; marcarConfirmada(cotizacionId: string): Promise<void>; relanzar(cotizacionId: string): Promise<void> /* estado→esperando_ola, error→null */ };
  ```

- [ ] **Step 1: `intake-store.ts` con tests (fetch inyectado, molde de `store.test.ts`)**

Implementar contra PostgREST igual que `tallerStore` (mismas env `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, mismo manejo de errores y de 0 filas). `crear` usa upsert por `cotizacion_id` (`Prefer: resolution=merge-duplicates`) para que reintentar el alta sea seguro. Tests: crear → POST con headers correctos; leer → GET filtrado devuelve la fila o null; `relanzar` → PATCH con `{estado: "esperando_ola", error: null}` y verificación de filas afectadas (0 filas = error, molde del fix ronda 2 bug 4).

Run: `npx vitest run src/taller/intake-store.test.ts` → verde.

- [ ] **Step 2: Extensiones del write adapter (con tests calcados de los del pase)**

Cada función nueva usa el mismo `validateConfig`/`QuoteWriteError`/manejo de timeout del pase (factorizarlos: extraer un helper privado `postJson(config, path, body)` que el pase también use). `subirArchivo` manda `FormData` (sin `Content-Type` manual — lo pone fetch) al path `/api/cotizaciones/{id}/archivos`. `firmarSubida` y `confirmarSubida` POSTean JSON a sus rutas. `confirmarReconocimiento` POSTea `{ receta, parametros, zona, precios_referencia }` a `/api/cotizaciones/{id}/confirmar-reconocimiento` y traduce la respuesta (`receta_id`→`recetaId`, etc.); 409 → `QuoteWriteError("conflict", detalle)`.

Tests (en `app-ravn-write-adapter.test.ts`, siguiendo los del pase): headers con `x-ravn-cotizador-write`, body correcto, 409→conflict, timeout→mensaje "puede haber entrado".

Run: `npx vitest run src/adapters/` → verde.

- [ ] **Step 3: `loadQuoteArchivos` en el read adapter**

Nueva función exportada al lado de `loadQuoteWorkspace`, mismo `getJson` con `x-ravn-cotizador-read`, path `/api/cotizaciones/{id}/archivos`; valida `{ archivos: [...] }` y devuelve `{id, titulo, url}` (url puede ser null — se filtra en el consumidor). Test con fetch inyectado.

- [ ] **Step 4: Las seis rutas `/api/intake/*`**

Todas con `export const dynamic = "force-dynamic"` y el molde de `api/pase/route.ts` (STATUS map de `QuoteWriteError`). Puntos no obvios:

- `POST /api/intake`: valida `titulo` no vacío; `crearIntake(titulo)` → `intakeStore().crear(id, texto ?? null)` → `201 { cotizacionId: id }`. Si el store falla DESPUÉS de crear el borrador, devolver igual el id con `advertencia` en el JSON (el borrador existe y es recuperable; regla anti-slop: decir exactamente qué quedó).
- `GET /api/intake`: `requireQuoteId` + `isPersistableQuoteId` (para el preview devuelve `{ intake: null, archivos: [] }`); `Promise.all([intakeStore().leer(id), loadQuoteArchivos(id)])`.
- `POST /api/intake/archivos`: lee `req.formData()`, valida `file instanceof File`, tamaño ≤ 4 MB (413 con el mensaje que manda a la subida directa), llama `subirArchivo`.
- `firmar`/`confirmar`: proxies finos. `firmar` compone `upload_url` así: `` `${process.env.SUPABASE_URL}/storage/v1/object/upload/sign/obra-archivos/${path}?token=${token}` `` — el browser hace `PUT upload_url` con el archivo como body y header `x-upsert: false`.
- `POST /api/intake/ola`: junta `intakeStore().leer` (texto) + `loadQuoteArchivos` (urls firmadas, filtrar null) y devuelve el payload de la ola; si NO hay ni texto ni archivos → 409 "No hay nada que desmenuzar". También llama `intakeStore().relanzar(id)` si el estado era `error` (relanzar limpia el error).
- `POST /api/intake/confirmar`: body `{ propuesta, zona? }` → `validarPropuesta` (400 con motivo) → `recetaDesdePropuesta(propuesta, quoteId, zona ?? null)` → `confirmarReconocimiento` → `intakeStore().marcarConfirmada(quoteId)` (best-effort DESPUÉS del éxito, como la calibración del pase: si falla se loguea, no se esconde el éxito) → `{ ok: true, ... }`.

- [ ] **Step 5: Verificación del subsistema**

Run: `cd apps/cotizador-ravn && npm test && npx tsc --noEmit && npm run lint`
Expected: PASS todo.

- [ ] **Step 6: Commit**

```bash
git add apps/cotizador-ravn/src/taller/intake-store.ts apps/cotizador-ravn/src/taller/intake-store.test.ts \
  apps/cotizador-ravn/src/adapters/ apps/cotizador-ravn/src/app/api/intake/
git commit -m "feat(cotizador): la puerta por dentro — intake store, adaptadores y rutas /api/intake"
```

---

### Task 12: Bridge — la ola de intake (Fable estructurado + persistencia PostgREST)

**Files:**
- Create: `apps/cotizador-ravn/bridge/intake-prompt.mjs`
- Modify: `apps/cotizador-ravn/bridge/server.mjs`

**Interfaces:**
- Consumes: `extraerJson`, `validarPropuesta` de `../src/bridge/intake-contract.ts` (server.mjs ya importa `.ts` de ahí — mismo mecanismo).
- Produces: `POST /waves` acepta además `{ kind: "intake", cotizacionId, texto, archivos: [{ titulo, url }] }`. La ola de intake: baja los archivos a un tmp dir, corre SOLO Fable con `Read` habilitado, valida el JSON final y hace PATCH a `cotizador_intake` (estado `propuesta_lista` + propuesta, o `error` + motivo). El stream SSE sigue mostrando todo en vivo.

- [ ] **Step 1: `intake-prompt.mjs`**

```js
/**
 * Prompt de la ola de INTAKE (puerta de entrada, spec 2026-08-17). La ley:
 * la IA reconoce el QUÉ y las CANTIDADES con origen; los precios que
 * investigue van como referencia fechada; lo ambiguo es pregunta. NUNCA
 * inventa un número.
 */
export function intakePrompt({ texto, archivos, hoy }) {
  const listaArchivos = archivos.length
    ? archivos.map((a) => `- ${a.titulo}: ${a.pathLocal}`).join("\n")
    : "(sin archivos — solo el texto)";
  return `Sos el desmenuzador de la puerta de entrada del Cotizador RAVN (empresa de construcción y reformas, zona norte GBA). Eze te tiró un laburo para cotizar y tu único trabajo es RECONOCERLO: rubros, ítems con cantidad y unidad, artefactos, maquinaria y mano de obra. Hoy es ${hoy}.

ARCHIVOS LOCALES (leelos con la herramienta Read; los PDF y las fotos se leen igual):
${listaArchivos}

TEXTO DE EZE:
${texto || "(no escribió texto)"}

REGLAS, sin excepción:
1. Cada dato lleva origen: fuente ("lo dice la OT, p.2" / "deducido de la foto 1" / "lo dice el texto") y confianza ("verificado" si está escrito, "estimado" si lo dedujiste).
2. Lo ambiguo va a preguntas_abiertas — NUNCA un número inventado. Si el archivo es ilegible o no es un laburo de obra, devolvé un JSON con rubros: [] no: devolvé el error como texto plano SIN bloque json, explicando qué necesitás.
3. Rubros: los que salgan del laburo (demolición, durlock, pintura, electricidad…), no una lista fija. Cada rubro con dias_min/dias_max/cuadrilla si podés estimarlos del alcance.
4. tipo de cada ítem: "material" | "mano_de_obra" | "maquinaria". Maquinaria SIEMPRE con modalidad: "alquiler" (se alquila para esta obra) o "propia" (herramienta de mano/capital de RAVN: sierra, taladro, andamio propio). Artefactos (se compran E instalan: grifería, sanitarios, luminarias) = material con "artefacto": true.
5. unidad: usá m2, ml, u, kg, l, bolsa, caja, m3, rollo, dia o global.
6. Precios: NO son tu trabajo. Si buscás alguno en internet (WebSearch) para ítems grandes, va en precio_referencia con {valor, fuente (sitio), fecha "${hoy}", origen "internet"} — solo precios que VISTE hoy en una página, jamás de memoria.
7. parametros: las medidas clave que detectaste (superficie_m2, cantidad_vanos…), con su valor.

SALIDA: tu último mensaje debe contener UN solo bloque \`\`\`json con exactamente esta forma:
{
  "titulo": "…", "resumen": "una o dos frases",
  "parametros": [{"nombre": "superficie_m2", "etiqueta": "Superficie (m²)", "valor": 40}],
  "rubros": [{"nombre": "…", "dias_min": 1, "dias_max": 2, "cuadrilla": 2, "items": [
    {"nombre": "…", "tipo": "material|mano_de_obra|maquinaria", "modalidad": "alquiler|propia (solo maquinaria)", "artefacto": true, "unidad": "m2", "cantidad": 12, "origen": {"fuente": "…", "confianza": "verificado|estimado"}, "precio_referencia": {"valor": 45000, "fuente": "easy.com.ar", "fecha": "${hoy}", "origen": "internet"}, "notas": "…"}
  ]}],
  "preguntas_abiertas": ["…"],
  "fuentes": [{"titulo": "OT adjunta", "tipo": "obra", "fecha": "${hoy}"}]
}
Los campos opcionales (modalidad, artefacto, precio_referencia, notas, dias_*, cuadrilla) se OMITEN si no aplican — no van en null.`;
}
```

- [ ] **Step 2: server.mjs — aceptar y correr la ola de intake**

Cambios, en orden:

1. Imports nuevos arriba:
```js
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { extraerJson, validarPropuesta } from "../src/bridge/intake-contract.ts";
import { intakePrompt } from "./intake-prompt.mjs";
```

2. Config de persistencia (después de `TOKEN`):
```js
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
```

3. Helper PostgREST (fail-closed y con verificación de filas — 0 filas afectadas es error, no éxito):
```js
async function persistirIntake(cotizacionId, cambios) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cotizador_intake?cotizacion_id=eq.${encodeURIComponent(cotizacionId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ ...cambios, actualizado_at: new Date().toISOString() }),
    }
  );
  const filas = res.ok ? await res.json() : [];
  if (!res.ok || !Array.isArray(filas) || filas.length === 0) {
    throw new Error(`PATCH cotizador_intake: ${res.status}, filas ${Array.isArray(filas) ? filas.length : "?"}`);
  }
}
```

4. En `agentCommand`, agregar el modo intake para fable (los paths locales necesitan `Read`):
```js
function agentCommand(agent, prompt, opciones = {}) {
  if (agent === "fable") {
    const tools = opciones.intake ? ["Read", "WebSearch", "WebFetch"] : ["WebSearch", "WebFetch"];
    return {
      command: "claude",
      args: ["-p", prompt, "--output-format", "stream-json", "--verbose", "--allowedTools", ...tools],
    };
  }
  // … codex igual que hoy …
}
```
y propagar `opciones` desde `spawnAgent(agent, prompt, opciones)`.

5. Captura del resultado de Fable para el intake: en `spawnAgent`, cuando `opciones.intake`, además de `pushEvent` acumular el texto del evento `result` (en `formatCliLine` el stream-json de `claude -p` termina con la línea de tipo `result` — verificar en `src/bridge/stream-format.ts` qué `kind` le asigna y capturar el texto crudo de esa línea ANTES de formatear: parsear `JSON.parse(line)` y si `parsed.type === "result"` guardar `parsed.result` en `wave.resultadoIntake`).

6. La ola de intake (nueva función, al lado de `startWave`):
```js
async function startIntakeWave({ cotizacionId, texto, archivos }) {
  const dir = await mkdtemp(join(tmpdir(), "ravn-intake-"));
  const locales = [];
  for (const [i, archivo] of archivos.entries()) {
    const res = await fetch(archivo.url);
    if (!res.ok) throw new Error(`No se pudo bajar "${archivo.titulo}" (${res.status})`);
    const ext = extname(new URL(archivo.url).pathname) || ".bin";
    const pathLocal = join(dir, `archivo-${i + 1}${ext}`);
    await writeFile(pathLocal, Buffer.from(await res.arrayBuffer()));
    locales.push({ titulo: archivo.titulo, pathLocal });
  }
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const prompt = intakePrompt({ texto, archivos: locales, hoy });

  wave = { id: randomUUID(), prompt: `[intake ${cotizacionId}]`, startedAt: new Date().toISOString(), status: "running", seq: 0, events: [], children: new Map(), timeout: null, resultadoIntake: null,
    alTerminar: async () => {
      try {
        const crudo = wave.resultadoIntake ?? "";
        const json = extraerJson(crudo);
        if (json === null) throw new Error(crudo.trim() ? crudo.slice(0, 500) : "La ola no devolvió una propuesta.");
        const v = validarPropuesta(json);
        if (!v.ok) throw new Error(`Propuesta inválida: ${v.motivo}`);
        await persistirIntake(cotizacionId, { estado: "propuesta_lista", propuesta: v.propuesta, error: null });
        pushEvent("wave", "result", "Propuesta de reconocimiento persistida — abrila en el visor");
      } catch (error) {
        await persistirIntake(cotizacionId, { estado: "error", error: String(error.message ?? error) }).catch((e) =>
          pushEvent("wave", "raw", `✗ No se pudo persistir el error: ${e.message}`)
        );
        pushEvent("wave", "raw", `✗ Intake sin propuesta: ${String(error.message ?? error).slice(0, 300)}`);
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
  pushEvent("wave", "status", `Ola de intake · ${locales.length} archivo(s) · desmenuzando con Fable`);
  spawnAgent("fable", prompt, { intake: true });
  wave.timeout = setTimeout(() => stopWave("Corte por tiempo máximo de ola"), WAVE_TIMEOUT_MS);
  wave.timeout.unref();
  return wave.id;
}
```
En `markAgentDone`, donde hoy se cierra la ola (`wave.status = "done"`), disparar `if (wave.alTerminar) void wave.alTerminar();` DESPUÉS de marcar done.

7. En el handler de `POST /waves`, antes de la validación del prompt:
```js
if (body.kind === "intake") {
  const cotizacionId = typeof body.cotizacionId === "string" ? body.cotizacionId.trim() : "";
  const texto = typeof body.texto === "string" ? body.texto.slice(0, 16_000) : "";
  const archivos = Array.isArray(body.archivos)
    ? body.archivos.filter((a) => a && typeof a.titulo === "string" && typeof a.url === "string" && a.url.startsWith("https://"))
    : [];
  if (!cotizacionId) return json(res, 400, { error: "Falta la cotización del intake." });
  if (!texto && archivos.length === 0) return json(res, 400, { error: "No hay nada que desmenuzar." });
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(res, 503, { error: "El bridge no tiene SUPABASE_URL/SERVICE_ROLE_KEY: la propuesta no tendría dónde persistir." });
  }
  try {
    const id = await startIntakeWave({ cotizacionId, texto, archivos });
    return json(res, 201, { waveId: id });
  } catch (error) {
    return json(res, 502, { error: `La ola de intake no arrancó: ${error.message}` });
  }
}
```

- [ ] **Step 3: Probar el bridge a mano (sin gastar una ola real)**

Levantar `npm run bridge` y verificar con curl:
- `POST /waves` con `kind: "intake"` sin cotizacionId → 400.
- Sin `SUPABASE_URL` en el env (correr una vez con la var vaciada) → 503 con el mensaje.
- `persistirIntake` contra una fila real de `cotizador_intake` de prueba (crearla por PostgREST, patchearla, verificar `estado`, borrarla). NO lanzar `claude`/`codex` de verdad en este paso.

Expected: los tres caminos contestan como se diseñó.

- [ ] **Step 4: Commit**

```bash
git add apps/cotizador-ravn/bridge/server.mjs apps/cotizador-ravn/bridge/intake-prompt.mjs
git commit -m "feat(cotizador): la ola de intake — Fable desmenuza local y la propuesta persiste por PostgREST"
```

---

### Task 13: Visor — la puerta (`intake-gate`) y el panel de reconocimiento

**Files:**
- Create: `apps/cotizador-ravn/src/components/intake-gate.tsx`, `apps/cotizador-ravn/src/components/reconocimiento-panel.tsx`
- Modify: `apps/cotizador-ravn/src/components/control-center.tsx`, `apps/cotizador-ravn/src/app/globals.css`, `apps/cotizador-ravn/src/adapters/app-ravn-read-adapter.ts` (una línea: `isLegacyItem` acepta `maquinaria`)

**Interfaces:**
- Consumes: `GET/POST /api/intake*` (Task 11), `BridgeConfig` y el molde de lanzamiento de olas de `live-terminals.tsx`, `PropuestaReconocimiento` (Task 9).
- Produces: flujo completo de UI: "+ Nueva cotización" → soltar/adjuntar/pegar → borrador creado → ola → propuesta editable → confirmar → tablero normal.

- [ ] **Step 1: `isLegacyItem` del read adapter acepta maquinaria**

En `app-ravn-read-adapter.ts`, reemplazar `(value.tipo === "material" || value.tipo === "mano_de_obra")` por `(value.tipo === "material" || value.tipo === "mano_de_obra" || value.tipo === "maquinaria")`. Sin esto, la PRIMERA cotización confirmada con maquinaria vuelve ilegible el expediente entero en el visor. Test en el archivo de tests del adapter: un detalle con un ítem `tipo: "maquinaria", modalidad: "propia"` se normaliza bien.

- [ ] **Step 2: `intake-gate.tsx`**

Client component. Estado: `archivos: File[]`, `texto: string`, `titulo: string`, `fase: "editando" | "creando" | "subiendo" | "lanzando"`, `aviso: string | null`. Render: zona de drop (`onDrop`/`onDragOver` + `<input type="file" multiple accept=".pdf,image/*,.json,.txt,.md">`), textarea para pegar/dictar, input de título (default: primer nombre de archivo sin extensión), botón "Crear y desmenuzar".

Al confirmar, EN ORDEN y contando cada paso en `aviso` (anti-slop: cada paso dice lo que REALMENTE pasó):
1. `POST /api/intake` `{ titulo, texto }` → `cotizacionId`. Si falla, se dice y no se sigue.
2. Por cada archivo: ≤4 MB → `POST /api/intake/archivos?quote=` multipart; >4 MB → `firmar` + `PUT upload_url` (body: el File, header `x-upsert: false`) + `confirmar`. Un archivo que falla corta con "El borrador ya existe; el archivo X no subió — reintentá desde la cotización".
3. `POST /api/intake/ola?quote=` → payload → `fetch(bridge.url + "/waves", …)` con el molde exacto de `launchWave` de `live-terminals.tsx`. Sin bridge → aviso "Bridge apagado: el borrador y los archivos quedaron guardados; levantá el bridge y relanzá la ola desde la cotización" (el flujo NO falla: persistió).
4. `onCreated(cotizacionId)` (prop) → el control-center navega a esa cotización.

Usar `apiUrl()` de `src/lib/api-url.ts` para TODAS las rutas relativas (regla del bug 1 ronda 4).

- [ ] **Step 3: `reconocimiento-panel.tsx`**

Client component. Props: `{ quoteId: string; bridge: BridgeConfig | null; onConfirmada: () => void }`. Poll de `GET /api/intake?quote=` cada 5 s mientras `estado === "esperando_ola"` (con `document.visibilityState === "visible"`, molde del poll de `loadQuote`).

Render por estado:
- `esperando_ola`: los archivos adjuntos (título + link), el texto, y la banda de la ola (el componente `LiveTerminals` ya está en la página; acá solo el aviso "La ola está desmenuzando — mirala abajo" o, si el bridge está `off`, "Bridge apagado: la ola no está corriendo. El borrador persiste; levantá el bridge y relanzá." + botón **Relanzar la ola** → `POST /api/intake/ola` + POST al bridge, mismo molde del gate).
- `error`: el motivo textual + Relanzar.
- `propuesta_lista`: la propuesta EDITABLE en estado local (`useState<PropuestaReconocimiento>` inicializado de la fila):
  - por rubro: nombre editable, días/cuadrilla editables, tabla de ítems (nombre, tipo como select, modalidad si maquinaria, cantidad `input number`, unidad select con las 11 del motor, origen como texto chico de solo lectura, precio_referencia visible si vino) — sacar ítem, agregar ítem (fila nueva con origen `{fuente: "agregado por Eze", confianza: "verificado"}`), sacar/agregar rubro.
  - artefactos: los ítems `artefacto: true` se listan también en un bloque aparte "Se compran e instalan" (solo lectura, es un agrupado).
  - maquinaria: bloque propio con el toggle alquiler/propia y la leyenda "propia no suma al costo".
  - `preguntas_abiertas`: cada una con un input de respuesta opcional; una pregunta RESPONDIDA se saca de la lista y su respuesta se agrega a `notas` del panel → se concatena al `resumen` (v1: la respuesta es contexto, no re-desmenuzado).
  - Botón **Confirmar y cotizar** → `POST /api/intake/confirmar?quote=` con la propuesta editada → mostrar el resultado REAL (`total_min/max`, `sin_precio: [...]` con "estos ítems van a la cola de decisiones") → `onConfirmada()` que recarga el quote (ahora `en_revision` → tablero normal).
- `confirmada`: nada (el control-center ya no muestra el panel porque el estado del quote cambió).

- [ ] **Step 4: Integración en `control-center.tsx`**

1. En el `<select>` del picker de cotizaciones (buscar `id="quote-picker"`), agregar primera opción `+ Nueva cotización` con value `"__nueva__"`; elegirla setea `intakeMode: true` (estado nuevo) en vez de `loadQuote`.
2. Con `intakeMode`, renderizar `<IntakeGate bridge={bridge} onCreated={(id) => { setIntakeMode(false); void loadQuote(id); }} />` en el lugar del tablero.
3. Cuando `snapshot.quote.estado === "borrador"` (el summary ya trae estado), renderizar `<ReconocimientoPanel quoteId={...} bridge={bridge} onConfirmada={() => void loadQuote(quoteId)} />` en el lugar del tablero; la conversación y `LiveTerminals` quedan como están.
4. El botón `qz-attach` del composer sigue deshabilitado (los adjuntos del hilo son otro contrato); actualizar su `title` a "Los archivos entran por la puerta: + Nueva cotización".

**OJO:** los borradores pueden no aparecer en el picker si `projectQuoteSummary`/el orden los filtra — verificar en `domain/quote-workspace.ts` (`isActiveLegacyState`) que `borrador` cuenta como activo para el selector; si no, incluirlo en la lista del picker (el spec necesita poder volver a un borrador para relanzar la ola).

5. CSS en `globals.css`: clases nuevas con el prefijo del sistema (`qz-intake`, `qz-reco`) siguiendo los tokens existentes (mismos grises/acentos; cero border-radius, Raleway — es la marca).

- [ ] **Step 5: Probar en el navegador (sin gastar ola real)**

```
cd apps/cotizador-ravn && pkill -f "next dev --port 3010"; rm -rf .next; COTIZADOR_PREVIEW_ENABLED=1 npm run dev
```
Con Playwright contra `http://localhost:3010/?preview=1&k=$COTIZADOR_ACCESS_KEY`:
- El picker muestra "+ Nueva cotización"; elegirlo abre el gate; el gate en preview avisa que no hay escritura (el POST rebota con el mensaje del server — verificar que se MUESTRA, no que se simula éxito).
- Interceptar `POST /waves` con `page.route` (regla del handoff: no despertar a Codex/Fable de verdad).
- Para el panel: crear una fila de `cotizador_intake` de prueba con `estado: "propuesta_lista"` y una propuesta válida contra una cotización borrador REAL creada por curl (write secret local), abrirla en el visor SIN preview (App RAVN local en 3000, molde del handoff), editar cantidades, confirmar, y ver el tablero con precios/cola. Borrar después la cotización de prueba.

Expected: el flujo entero se ve y se puede operar; ningún estado se muestra como hecho sin serlo.

- [ ] **Step 6: Verificación del subsistema + commit**

```bash
cd apps/cotizador-ravn && npm test && npx tsc --noEmit && npm run lint && npm run build
git add apps/cotizador-ravn/src/components/ apps/cotizador-ravn/src/app/globals.css apps/cotizador-ravn/src/adapters/
git commit -m "feat(cotizador): la puerta en el visor — intake gate, panel de reconocimiento y confirmación"
```

---

### Task 14: Punta a punta contra la base real + verificación estándar

**Files:** ninguno nuevo (es verificación; los fixes que salgan van en commits propios).

- [ ] **Step 1: E2E por curl (sin UI), con una cotización descartable**

Molde de la verificación del pase (16/08). Con App RAVN local (`npx next dev --port 3000` en `Documents/ravn`) y los secretos de `.env.local`:

1. Sin credencial → `POST /api/cotizaciones/intake` → **401**.
2. Credencial de LECTURA sobre intake → **401**.
3. Credencial de ESCRITURA → **201** con id; verificar en la base: `estado = 'borrador'`, `ficha->>'origen' = 'puerta-cotizador'`.
4. `POST .../archivos` (write) con un PDF chico → **200**; `GET .../archivos` con credencial de LECTURA → **200** con url firmada; el mismo GET con la de escritura → **401**.
5. `POST .../confirmar-reconocimiento` con una receta candidata armada a mano (2 rubros, 1 maquinaria propia + 1 alquiler con precio_referencia, 1 pregunta abierta) → **200**; verificar: fila en `recetas` con `estado = 'candidata'`, cotización `en_revision` con `receta_id`, `desglose.totales.maquinaria_min` presente, el ítem propia con subtotal 0, el sin precio en `revision`/cola.
6. Repetir el mismo POST → **409** (ya no es borrador) y **ninguna receta nueva** en la base.
7. Candidata con maquinaria sin modalidad → **400** con la violación.
8. La credencial de escritura sobre `/aprobar` y `/emitir` → **401** (la frontera sigue).
9. Borrar la cotización de prueba y su receta por el mismo camino de siempre; `select * from cotizador_huerfanos` y `select * from dinero_huerfanos` → **vacías**.

- [ ] **Step 2: E2E real con la ola (requiere la Mac con bridge y gasta UNA ola)**

Avisar a Eze antes (regla de aviso de gasto — es su suscripción). Con el bridge vivo y App RAVN + cotizador locales: tirar por la UI una OT real de `~/Documents/Plantillas/` (plantilla Fran) y un checklist de visita real (JSON de `schemas/relevamiento.ravn.schema.json`). Verificar: el borrador nace al toque, la ola se ve desmenuzando en las terminales, la propuesta llega con orígenes y preguntas, la confirmación deja la cotización en el visor con precios del motor y la cola de decisiones con los sin-precio. Capturas a `.impeccable/finish/puerta-entrada-*.png`.

- [ ] **Step 3: La verificación estándar completa**

```bash
cd /Users/ezeotero/Documents/ravn && npm test          # 572 + nuevos
cd apps/cotizador-ravn && npm test                      # 175 + nuevos
npx tsc --noEmit && npm run lint && npm run build       # First Load JS: anotar el número
cd /Users/ezeotero/Documents/ravn && npx tsc --noEmit
```
`TZ=UTC npm run dev` + navegador en Buenos Aires para el smoke de fechas (las fechas nuevas usan zona nombrada — verificar el `hoy` del bridge y `precio_referencia.fecha`).

- [ ] **Step 4: Cierre de sesión (reglas de la casa)**

1. Actualizar `Documents/ravn/handoff-cotizador-visor.md` (sección nueva arriba: qué quedó construido, cómo se prueba, qué falta) y la fila del índice `~/handoff.md`.
2. Cierre JSON por `ravn-memoria cerrar` + commit/push del vault (`memoria: puerta de entrada del cotizador`).
3. **FRENAR para el deploy**: pedir a Eze el OK para los dos deploys de producción por API (`target: production`, ref `home-cards`, los dos proyectos — tres piezas viven en App RAVN). Recordar: el push solo genera Preview.

---

## Self-review (hecha al escribir el plan)

- **Cobertura del spec:** entrada 4 formatos (gate: file input acepta pdf/imagen/json/texto + textarea) ✓ · persistencia inmediata (Task 5 + 6) ✓ · desmenuzado con origen y preguntas (Tasks 9, 12) ✓ · confirmación de Eze antes de crear nada (Task 13; la receta recién existe en Task 8 al confirmar) ✓ · guard satisfecho por diseño (borrador → receta → en_revision en ese orden) ✓ · precios del motor con fuente fechada (Task 7) ✓ · ola por bridge, Mac apagada = persiste y se retoma (Tasks 12, 13: relanzar) ✓ · maquinaria alquiler/propia (Tasks 1–3) ✓ · artefacto como marca (Tasks 1–2, panel) ✓ · escritura por molde del pase (Tasks 5, 6, 8, 11) ✓ · manejo de error (ilegible → texto sin json → estado error con motivo; bridge caído → relanzar; idempotencia → 409/upsert) ✓ · testing del spec (unit candidata/traducción, endpoints allowlist/guard/idempotencia, punta a punta OT + checklist, verificación estándar) ✓ · fuera de alcance respetado (sin audio, sin amortización, sin perfil de cliente, sin OT de salida) ✓.
- **Checklist de visita como entrada:** entra como archivo JSON adjunto; el prompt de intake lo lee con Read (es el caso fácil — ya viene estructurado). No necesita rama propia en v1.
- **Tipos consistentes entre tasks:** `ConfirmacionPayload` (Task 10) = body de `confirmar-reconocimiento` (Task 8, claves snake en el wire: el adapter de Task 11 traduce `precios_referencia` tal cual — misma clave). `ReferenciaPrecio` (Task 7) = `precio_referencia` + `nombre` (Task 9/10). `FilaIntake.estado` = enum de la migración (Task 4) = estados del bridge (Task 12) = render del panel (Task 13). `maquinaria_min/max` (Task 1) = totales (Task 3) = verificación E2E (Task 14).
- **Riesgo conocido aceptado:** el insert de `recetas` en Task 8 se ajusta a las columnas reales de la tabla (el task lo instruye); `stream-format.ts` decide cómo capturar la línea `result` (Task 12 paso 5 lo instruye contra el archivo real). Son los dos únicos puntos donde el implementador debe mirar código vivo antes de pegar el bloque.
