# Frente A — Cimientos: Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la base de datos del Centro de Mando lista (migraciones versionadas de todo el contrato de datos + RLS endurecido + bucket Storage), Vitest funcionando con tests reales sobre la lógica que toca plata, y las variables de Railway verificadas.

**Architecture:** Todas las tablas nuevas del contrato (`eventos`, `trabajos_cola`, `recetas`, `cotizaciones`, `cotizador_lecciones`, `referencias`) entran como migraciones SQL versionadas en `supabase/migrations/`, idempotentes (convención del repo), aplicadas a la Supabase de producción vía CLI (`supabase db push` después de reparar el historial). La distinción Eze/bot en RLS se resuelve con un singleton `seguridad_config` + función `es_bot()` (security definer que compara el email del JWT); las policies implementan la matriz de permisos de la **enmienda RLS definitiva 2026-06-11** (tabla en el Contexto). El testing usa Vitest con alias `@ → src`, tests de caracterización sobre `cashflow-compute.ts` y `precio-por-margen-neto.ts`.

**Tech Stack:** PostgreSQL (Supabase hosted), Supabase CLI v2.x, Next.js 15 + TypeScript (repo `/Users/ezeotero/Documents/ravn`), Vitest, Railway CLI v5.x.

---

## Contexto que el ejecutor tiene que saber (leelo antes de arrancar)

- **Repo:** `/Users/ezeotero/Documents/ravn` (git, branch `main`, deploy automático en Vercel proyecto `ravn-app-one`). Todos los paths relativos de este plan son relativos a esa raíz.
- **Las 20 migraciones existentes** en `supabase/migrations/` (de `20260326120000` a `20260522120000`) **nunca se aplicaron vía CLI**: se corrieron a mano en el SQL Editor del dashboard. El proyecto NO está linkeado (no hay `supabase/.temp/project-ref`). La Tarea 14 repara ese historial antes de pushear lo nuevo.
- **Las migraciones de este repo solo corren contra producción.** Tablas como `presupuestos`, `rubros` o `presupuestos_items` existen en prod pero NO tienen migración versionada (son anteriores). `supabase db reset` local NO funciona y no es objetivo de este plan.
- **Convenciones SQL del repo** (respetarlas): `create table if not exists public.x`, `create index if not exists`, `drop policy if exists` antes de `create policy`, `comment on table`, todo idempotente.
- **COLISIÓN CRÍTICA detectada:** ya existe en producción una tabla `public.recetas` que es el **catálogo de ítems** de la app (columnas `rubro_id`, `nombre_item`, `unidad`, `costo_base_material_unitario`, `costo_base_mo_unitario`; la usan `src/app/catalogo/catalogo-screen.tsx`, `src/app/nuevo-presupuesto/nuevo-presupuesto.tsx` y 3 modals). El contrato del Centro de Mando exige una tabla `recetas` con OTRO esquema (recetas paramétricas del cotizador). La Tarea 5 renombra la vieja a `catalogo_recetas` (migración + 5 archivos de la app) para liberar el nombre. **No saltees la Tarea 5 ni la hagas después de la Tarea 8.**
- **Autenticación de la app:** `src/middleware.ts` redirige todo a `/login` si no hay sesión → el browser SIEMPRE opera como rol `authenticated` (usuario de Eze). Las API routes usan `createSupabaseAdminClient()` (service_role, bypassa RLS). Por eso endurecer RLS no rompe la app.
- **El bot** (`/Users/ezeotero/Documents/ravn-bots`, deployado en Railway) entra a Supabase como un **usuario auth dedicado** (`BOT_EMAIL`/`BOT_PASSWORD` con la anon key — ver `ravn-bots/src/supabaseService.js`). NO usa service_role. Los permisos del bot son los de la **enmienda RLS definitiva (acordada 2026-06-11)** — exactamente estos, ni más ni menos:

| Tabla | El bot puede | Por qué |
|---|---|---|
| `eventos` | select, insert, **update** | marca estados (procesado/archivado/resuelto) |
| `trabajos_cola` | select, insert, **update** | cancela trabajos y responde fichas (esperando_datos) |
| `tareas` | select, insert, **update, delete** | "marcá hecha" / "borrá lo último" por WhatsApp |
| `gastos_personales` | select, insert, **delete** | "borrá el último gasto" por WhatsApp (sin update) |
| `presupuestos_gastos` | select, insert | contrato original |
| `referencias` | select, insert | contrato original |
| `presupuestos` | **select** | resuelve "gasto de la obra X" buscando la obra por nombre |
| `cotizaciones` | **select, update** | aprobación/rechazo de la mesa de revisión por WhatsApp |
| `cotizador_lecciones` | **insert** | rechazo por WhatsApp deja lección (no lee) |
| `recetas`, `seguridad_config`, `inmobiliario_*` | nada | — |
| `obras`, `cashflow_items`, `cashflow_cierres_obra`, `presupuestos_items`, `rubros`, `catalogo_recetas` | **select** (read-only) | datos de negocio: el bot puede leer para contexto; nunca escribe |
| `maestro_precios_items`, `maestro_precios_gestion` | nada | parámetros de precios de Eze, el bot no los toca |
| Storage bucket `referencias` | **select, insert** | sube las fotos del ADN que llegan por WhatsApp; la policy de select es para todo `authenticated` (el bot también puede leer — decisión aceptada) |
- **Commits:** convención del repo = conventional commits en castellano (`feat(...):`, `fix(...):`). Commit chico al final de cada tarea que toque archivos.

### Mapa de archivos del frente

| Archivo | Qué es |
|---|---|
| `supabase/migrations/20260612100000_base_seguridad.sql` | Create: `seguridad_config` + `es_bot()` + `set_actualizado_at()` |
| `supabase/migrations/20260612101000_gastos_personales.sql` | Create: tabla versionada + RLS contrato |
| `supabase/migrations/20260612102000_tareas.sql` | Create: tabla versionada (viene de ravn-tu-dia) + RLS contrato |
| `supabase/migrations/20260612103000_catalogo_recetas_rename.sql` | Create: rename `recetas` (catálogo) → `catalogo_recetas` |
| `src/app/catalogo/catalogo-screen.tsx` y 7 archivos más | Modify: `.from("recetas")` → `.from("catalogo_recetas")` + alias `recetas:catalogo_recetas` en 6 embeds PostgREST |
| `supabase/migrations/20260612104000_eventos.sql` | Create: tabla `eventos` + RLS + Realtime |
| `supabase/migrations/20260612105000_trabajos_cola.sql` | Create: tabla `trabajos_cola` + trigger + RLS + Realtime |
| `supabase/migrations/20260612106000_recetas.sql` | Create: tabla `recetas` del cotizador (contrato) |
| `supabase/migrations/20260612107000_cotizaciones.sql` | Create: tabla `cotizaciones` |
| `supabase/migrations/20260612108000_cotizador_lecciones.sql` | Create: tabla `cotizador_lecciones` |
| `supabase/migrations/20260612109000_referencias.sql` | Create: tabla `referencias` |
| `supabase/migrations/20260612110000_storage_referencias.sql` | Create: bucket privado `referencias` + policies de Storage |
| `supabase/migrations/20260612111000_presupuestos_gastos_rls.sql` | Create: RLS en `presupuestos_gastos` |
| `supabase/migrations/20260612112000_inmobiliario_rls.sql` | Create: endurecer `inmobiliario_*` |
| `supabase/migrations/20260612113000_presupuestos_rls.sql` | Create: RLS en `presupuestos` (bot solo select) |
| `supabase/migrations/20260612114000_negocio_rls.sql` | Create: RLS en 6 tablas de negocio pre-existentes (bot read-only) |
| `supabase/migrations/20260612115000_maestro_precios_rls.sql` | Create: endurecer `maestro_precios_*` (revocar anon, solo authenticated no-bot) |
| `vitest.config.ts` | Create: config de Vitest |
| `package.json` | Modify: devDependency `vitest` + scripts `test`/`test:watch` |
| `src/lib/precio-por-margen-neto.test.ts` | Test: caracterización del cálculo de precio/margen |
| `src/lib/cashflow-compute.test.ts` | Test: caracterización del cómputo de cashflow |

---

### Tarea 1: Verificar el esquema real de producción antes de tocar nada

Tarea de solo lectura. El esquema de `gastos_personales` está inferido del código (`src/app/api/finanzas/route.ts`, `src/app/finanzas/finanzas-screen.tsx`, `ravn-bots/src/supabaseService.js`); acá lo contrastás contra la base real y confirmás que los nombres nuevos del contrato están libres.

**Files:** ninguno (verificación en el SQL Editor del dashboard de Supabase).

- [ ] **Step 1: Abrir el SQL Editor de producción**

Dashboard de Supabase → proyecto de App RAVN (la URL del proyecto está en `NEXT_PUBLIC_SUPABASE_URL` de `.env.local`) → SQL Editor.

- [ ] **Step 2: Dump de columnas de `gastos_personales`**

Pegar y correr:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'gastos_personales'
order by ordinal_position;
```

Esperado (según el código; el orden puede variar):

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| concepto | text | NO | — |
| monto | numeric | YES | — |
| categoria | text | NO/YES | 'Varios' |
| fecha | date | YES | CURRENT_DATE (o sin default) |
| origen | text | NO/YES | — |
| created_at | timestamp with time zone | NO | now() |

**Si difiere** (columna extra, tipo distinto, NOT NULL distinto): anotá la diferencia y ajustá el SQL de la Tarea 3 para que el `create table if not exists` refleje EXACTAMENTE lo que hay en producción. La migración versionada documenta la realidad, no la teoría.

- [ ] **Step 3: Dump de RLS y policies existentes en las tablas que vamos a tocar**

```sql
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('gastos_personales','tareas','presupuestos_gastos','presupuestos','recetas');

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('gastos_personales','tareas','presupuestos_gastos','presupuestos')
order by tablename, policyname;
```

Esperado: `tareas` con RLS activo y policy `"tareas auth full"`; `gastos_personales` probablemente con RLS activo y alguna policy (por eso la app usa service_role — ver commit `651eb6e`); `presupuestos_gastos` y `presupuestos` probablemente sin RLS. Anotá los nombres de policies que aparezcan: las migraciones de las Tareas 3, 4 y 13 las barren con un loop genérico, así que no hace falta conocerlas de antemano, pero conviene tener el registro.

- [ ] **Step 4: Confirmar que los nombres nuevos del contrato están libres (menos `recetas`)**

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('eventos','trabajos_cola','cotizaciones','cotizador_lecciones','referencias','seguridad_config','catalogo_recetas');
```

Esperado: **0 filas**. Si aparece alguna, FRENÁ y revisá qué es antes de seguir (probablemente otro frente ya corrió algo, o hay una pieza vieja con ese nombre).

```sql
select count(*) as filas_catalogo from public.recetas;
```

Esperado: un número > 0 (los ítems del catálogo). Esto confirma la colisión que resuelve la Tarea 5.

- [ ] **Step 5: Cierre**

No hay commit: tarea de verificación. Dejá anotado en tu contexto cualquier drift encontrado.

---

### Tarea 2: Migración base de seguridad — `seguridad_config`, `es_bot()`, `set_actualizado_at()`

Todo lo que viene después depende de `es_bot()` (distingue al usuario bot del usuario de Eze dentro del rol `authenticated`) y de `set_actualizado_at()` (trigger genérico para columnas `actualizado_at`).

**Files:**
- Create: `supabase/migrations/20260612100000_base_seguridad.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Cimientos Centro de Mando — base de seguridad y helpers compartidos.
-- es_bot(): distingue al usuario auth dedicado del bot (Railway BOT_EMAIL)
--           del usuario real de Eze, ambos rol `authenticated`.
-- set_actualizado_at(): trigger genérico para columnas actualizado_at.

create table if not exists public.seguridad_config (
  id smallint primary key default 1 check (id = 1),
  bot_email text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.seguridad_config (id) values (1) on conflict (id) do nothing;

comment on table public.seguridad_config is
  'Singleton de seguridad: bot_email = email del usuario auth dedicado del bot (var BOT_EMAIL en Railway). Solo lo edita service_role / SQL Editor. Lo lee es_bot().';

alter table public.seguridad_config enable row level security;
-- Sin policies a propósito: ni anon ni authenticated la tocan directo;
-- solo service_role (bypass) y es_bot() (security definer).
revoke all on public.seguridad_config from anon, authenticated;

create or replace function public.es_bot()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = nullif((select bot_email from public.seguridad_config where id = 1), ''),
    false
  );
$$;

comment on function public.es_bot() is
  'true si la sesión actual es el usuario bot (email del JWT vs seguridad_config.bot_email). Con bot_email vacío devuelve false para todos (nadie es bot hasta sembrarlo).';

create or replace function public.set_actualizado_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_at = now();
  return new;
end $$;
```

- [ ] **Step 2: Verificar el archivo**

Run: `grep -c "create or replace function" supabase/migrations/20260612100000_base_seguridad.sql`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612100000_base_seguridad.sql
git commit -m "feat(db): base de seguridad — seguridad_config, es_bot() y set_actualizado_at()"
```

---

### Tarea 3: Migración versionada de `gastos_personales`

La tabla existe en producción SIN migración (riesgo de pérdida señalado en el spec §9). En prod el `create table if not exists` no-opea; en una base nueva crea el esquema real. Además alinea la RLS a la enmienda 2026-06-11: Eze total; bot insert/select/**delete** ("borrá el último gasto" por WhatsApp), sin update.

**Files:**
- Create: `supabase/migrations/20260612101000_gastos_personales.sql`

- [ ] **Step 1: Crear el archivo de migración**

> Si la Tarea 1 (Step 2) encontró diferencias contra producción, ajustá las columnas de este `create table` para reflejar la realidad ANTES de commitear.

```sql
-- gastos_personales: existía en producción sin migración versionada.
-- Esquema según uso real: src/app/api/finanzas/route.ts (GET/POST/DELETE) y
-- ravn-bots/src/supabaseService.js insertGastoPersonal (que manda monto/fecha null).
-- RLS enmienda 2026-06-11: Eze (authenticated no-bot) total;
-- bot insert/select/delete ("borrá el último gasto" por WhatsApp), SIN update.

create table if not exists public.gastos_personales (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,   -- NOT NULL en prod (ajuste Tarea 1: 2026-06-12)
  concepto text not null,
  monto numeric(14, 2) not null,               -- NOT NULL en prod (ajuste Tarea 1: 2026-06-12)
  categoria text not null default 'Varios',
  origen text default 'whatsapp',              -- nullable en prod, default 'whatsapp' (ajuste Tarea 1)
  created_at timestamptz default now()         -- nullable en prod (ajuste Tarea 1: 2026-06-12)
);

create index if not exists gastos_personales_fecha_idx
  on public.gastos_personales (fecha desc);

create index if not exists gastos_personales_created_idx
  on public.gastos_personales (created_at desc);

comment on table public.gastos_personales is
  'Gastos personales de Eze (módulo Finanzas + bot WhatsApp). Versionada 2026-06-12 desde el esquema real de producción.';

alter table public.gastos_personales enable row level security;
revoke all on public.gastos_personales from anon;

-- Barre cualquier policy previa (nombres desconocidos en prod) y deja las del contrato.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'gastos_personales'
  loop
    execute format('drop policy if exists %I on public.gastos_personales', p.policyname);
  end loop;
end $$;

create policy "gastos_personales_select_auth" on public.gastos_personales
  for select to authenticated using (true);

create policy "gastos_personales_insert_auth" on public.gastos_personales
  for insert to authenticated with check (true);

create policy "gastos_personales_update_no_bot" on public.gastos_personales
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

-- delete abierto a authenticated: el bot borra ("borrá el último gasto") — enmienda 2026-06-11.
create policy "gastos_personales_delete_auth" on public.gastos_personales
  for delete to authenticated
  using (true);
```

- [ ] **Step 2: Verificar el archivo**

Run: `grep -c "create policy" supabase/migrations/20260612101000_gastos_personales.sql`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612101000_gastos_personales.sql
git commit -m "feat(db): migración versionada de gastos_personales + RLS contrato"
```

---

### Tarea 4: Migración versionada de `tareas`

La tabla `tareas` se creó desde otro repo (`ravn-tu-dia/supabase/migrations/001_tareas.sql`, aplicada a mano en prod). El contrato exige policy de bot sobre ella, así que la traemos bajo control de versiones de ESTE repo con su RLS alineada. Enmienda 2026-06-11: el bot tiene CRUD completo acá (hoy ya hace update de `avisado` y delete "borrá lo último" — ese comportamiento se CONSERVA).

**Files:**
- Create: `supabase/migrations/20260612102000_tareas.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- tareas: creada originalmente por ravn-tu-dia/supabase/migrations/001_tareas.sql
-- (aplicada a mano en prod). Acá queda versionada en el repo del Centro de Mando.
-- RLS enmienda 2026-06-11: el bot tiene CRUD COMPLETO en tareas (select/insert/
-- update/delete) — hoy ya hace update (avisado) y delete ("borrá lo último") por
-- WhatsApp y ese comportamiento se conserva. Decisión acordada con Eze.

create table if not exists public.tareas (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null,
  categoria     text not null default 'Personal'
                check (categoria in ('Salud','Finanzas','Obra','Compras','Gestiones','Personal')),
  fecha         date,
  hora          time,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','hecha')),
  origen        text not null default 'whatsapp'
                check (origen in ('whatsapp','web','manual')),
  nota          text,
  avisado       boolean not null default false,
  creado_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completado_at timestamptz
);

create index if not exists tareas_estado_idx on public.tareas (estado);
create index if not exists tareas_fecha_idx  on public.tareas (fecha);

create or replace function public.tareas_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.estado = 'hecha' and old.estado <> 'hecha' then
    new.completado_at = now();
  end if;
  return new;
end $$;

drop trigger if exists tareas_set_updated_at on public.tareas;
create trigger tareas_set_updated_at
  before update on public.tareas
  for each row execute function public.tareas_set_updated_at();

alter table public.tareas enable row level security;
revoke all on public.tareas from anon;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tareas'
  loop
    execute format('drop policy if exists %I on public.tareas', p.policyname);
  end loop;
end $$;

create policy "tareas_select_auth" on public.tareas
  for select to authenticated using (true);

create policy "tareas_insert_auth" on public.tareas
  for insert to authenticated with check (true);

-- update y delete abiertos a authenticated: el bot también (enmienda 2026-06-11).
create policy "tareas_update_auth" on public.tareas
  for update to authenticated
  using (true) with check (true);

create policy "tareas_delete_auth" on public.tareas
  for delete to authenticated
  using (true);
```

- [ ] **Step 2: Verificar el archivo**

Run: `grep -c "create policy" supabase/migrations/20260612102000_tareas.sql`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612102000_tareas.sql
git commit -m "feat(db): migración versionada de tareas + RLS contrato"
```

---

### Tarea 5: Liberar el nombre `recetas` — rename del catálogo a `catalogo_recetas`

El contrato exige una tabla `recetas` para el cotizador, pero en prod `public.recetas` ES el catálogo de ítems de la app. Renombramos la vieja y actualizamos los 10 call sites en 5 archivos **más los 6 embeds PostgREST** en 3 archivos que usan join embebido `recetas ( ... )` sobre `presupuestos_items`. **Esta tarea va ANTES de la Tarea 8 sí o sí.**

> **Por qué los 6 embeds:** PostgREST resuelve joins por el nombre de la FK de destino. Tras el rename `recetas → catalogo_recetas`, el join `recetas ( ... )` ya no resuelve porque la tabla ahora se llama `catalogo_recetas`. La solución es el alias de PostgREST `recetas:catalogo_recetas ( ... )` — así PostgREST busca la tabla `catalogo_recetas` pero devuelve la clave `recetas` en el JSON, lo que mantiene compatibilidad con todos los tipos y parsers de la app (cero cambios adicionales).

**Files:**
- Create: `supabase/migrations/20260612103000_catalogo_recetas_rename.sql`
- Modify: `src/app/catalogo/catalogo-screen.tsx` (líneas ~268, 323, 349, 368, 384, 491)
- Modify: `src/app/nuevo-presupuesto/nuevo-presupuesto.tsx` (líneas ~553, ~617, ~978, ~1068) — 1 call site `.from("recetas")` + 3 embeds PostgREST
- Modify: `src/app/propuesta/[id]/propuesta-screen.tsx` (líneas ~263, ~293) — 2 embeds PostgREST
- Modify: `src/app/api/cashflow/planificar-preview/route.ts` (línea ~80) — 1 embed PostgREST
- Modify: `src/components/nuevo-receta-modal.tsx` (línea ~63)
- Modify: `src/components/crear-item-catalogo-modal.tsx` (línea ~80)
- Modify: `src/components/nuevo-item-manual-modal.tsx` (línea ~101)

- [ ] **Step 1: Crear la migración de rename**

```sql
-- El nombre `recetas` lo necesita el cotizador del Centro de Mando (contrato de datos).
-- La tabla `recetas` vieja es el catálogo de ítems (rubro_id, nombre_item, unidad,
-- costo_base_material_unitario, costo_base_mo_unitario) → pasa a llamarse catalogo_recetas.
-- Guardas: solo renombra si la vieja existe y el destino está libre (idempotente,
-- y no pisa la `recetas` nueva si esto se re-corre).

do $$
begin
  if exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'recetas'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'recetas'
         and column_name = 'nombre_item'
     )
     and not exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'catalogo_recetas'
     )
  then
    alter table public.recetas rename to catalogo_recetas;
  end if;
end $$;

comment on table public.catalogo_recetas is
  'Catálogo de ítems para presupuestos (ex tabla `recetas`, renombrada 2026-06-12 para liberar el nombre al recetario del cotizador). Las FKs (p. ej. presupuestos_items.receta_id) siguen apuntando acá: el rename no rompe constraints.';
```

- [ ] **Step 2: Actualizar los call sites de la app**

**Parte A — `.from("recetas")` → `.from("catalogo_recetas")` en 5 archivos** (catálogo, presupuesto y 3 modals):

```bash
cd /Users/ezeotero/Documents/ravn
for f in src/app/catalogo/catalogo-screen.tsx \
         src/app/nuevo-presupuesto/nuevo-presupuesto.tsx \
         src/components/nuevo-receta-modal.tsx \
         src/components/crear-item-catalogo-modal.tsx \
         src/components/nuevo-item-manual-modal.tsx; do
  sed -i '' 's/from("recetas")/from("catalogo_recetas")/g' "$f"
done
```

**Parte B — Reescribir los 6 embeds PostgREST** (join embebido `recetas ( ... )` sobre `presupuestos_items`) para usar el alias `recetas:catalogo_recetas ( ... )`. El alias conserva la clave `recetas` en la respuesta JSON → cero cambios de tipos ni de parsers.

Los 6 lugares, con el antes/después exacto:

**1. `src/app/propuesta/[id]/propuesta-screen.tsx` ~línea 263 — query principal con rubros:**
```
Antes:  recetas (
          nombre_item,
          unidad,
          rubro_id,
          rubros ( nombre )
        )

Después: recetas:catalogo_recetas (
           nombre_item,
           unidad,
           rubro_id,
           rubros ( nombre )
         )
```

**2. `src/app/propuesta/[id]/propuesta-screen.tsx` ~línea 293 — fallback sin rubros:**
```
Antes:  recetas ( nombre_item, unidad, rubro_id )
Después: recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )
```

**3. `src/app/nuevo-presupuesto/nuevo-presupuesto.tsx` ~línea 617 — carga inicial de ítems:**
```
Antes:  recetas ( nombre_item, unidad, rubro_id )
Después: recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )
```

**4. `src/app/nuevo-presupuesto/nuevo-presupuesto.tsx` ~línea 978 — insert individual con `.select()`:**
```
Antes:  "id, presupuesto_id, receta_id, cantidad, precio_material_congelado, descuento_material_pct, precio_mo_congelada, recetas ( nombre_item, unidad, rubro_id )"
Después: "id, presupuesto_id, receta_id, cantidad, precio_material_congelado, descuento_material_pct, precio_mo_congelada, recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )"
```

**5. `src/app/nuevo-presupuesto/nuevo-presupuesto.tsx` ~línea 1068 — insert múltiple con `.select()`:**
```
Antes:  "id, presupuesto_id, receta_id, cantidad, precio_material_congelado, descuento_material_pct, precio_mo_congelada, recetas ( nombre_item, unidad, rubro_id )"
Después: "id, presupuesto_id, receta_id, cantidad, precio_material_congelado, descuento_material_pct, precio_mo_congelada, recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )"
```

**6. `src/app/api/cashflow/planificar-preview/route.ts` ~línea 80 — preview de planificación:**
```
Antes:  recetas ( nombre_item )
Después: recetas:catalogo_recetas ( nombre_item )
```

Ejecutar los reemplazos:
```bash
cd /Users/ezeotero/Documents/ravn

# propuesta-screen.tsx: 2 embeds
sed -i '' \
  's/recetas ( nombre_item, unidad, rubro_id, rubros ( nombre ) )/recetas:catalogo_recetas ( nombre_item, unidad, rubro_id, rubros ( nombre ) )/g' \
  src/app/propuesta/[id]/propuesta-screen.tsx
sed -i '' \
  's/recetas ( nombre_item, unidad, rubro_id )/recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )/g' \
  src/app/propuesta/[id]/propuesta-screen.tsx

# nuevo-presupuesto.tsx: 3 embeds (la línea del embed multiline ya fue pasada; las inline quedan acá)
sed -i '' \
  's/recetas ( nombre_item, unidad, rubro_id )/recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )/g' \
  src/app/nuevo-presupuesto/nuevo-presupuesto.tsx
# los embeds que están en strings de una sola línea:
sed -i '' \
  's/recetas ( nombre_item, unidad, rubro_id )"/recetas:catalogo_recetas ( nombre_item, unidad, rubro_id )"/g' \
  src/app/nuevo-presupuesto/nuevo-presupuesto.tsx

# planificar-preview/route.ts: 1 embed
sed -i '' \
  's/recetas ( nombre_item )/recetas:catalogo_recetas ( nombre_item )/g' \
  src/app/api/cashflow/planificar-preview/route.ts
```

> **Nota:** los sed anteriores usan patrones con espacios como están en el código. Si el formateo real difiere (Prettier puede compactar o expandir el select string), hacer los cambios a mano siguiendo el antes/después documentado arriba y verificar con el Step 3.

- [ ] **Step 3: Verificar que no quedó ninguna referencia vieja**

Run: `grep -rn 'from("recetas")' src/ | wc -l`
Expected: `0`

Run: `grep -rn 'from("catalogo_recetas")' src/ | wc -l`
Expected: `10`

Run: `grep -rn 'recetas (' src/`
Expected: `0` (ningún embed sin alias — todos deben haber migrado a `recetas:catalogo_recetas (`). Si aparece alguno, revisá el archivo correspondiente y aplicá el alias manualmente.

- [ ] **Step 4: Verificar que la app compila**

Run: `npx tsc --noEmit`
Expected: sin errores (los tipos no cambian, solo el string del nombre de tabla).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260612103000_catalogo_recetas_rename.sql \
        src/app/catalogo/catalogo-screen.tsx \
        src/app/nuevo-presupuesto/nuevo-presupuesto.tsx \
        src/app/propuesta/[id]/propuesta-screen.tsx \
        src/app/api/cashflow/planificar-preview/route.ts \
        src/components/nuevo-receta-modal.tsx \
        src/components/crear-item-catalogo-modal.tsx \
        src/components/nuevo-item-manual-modal.tsx
git commit -m "feat(db): renombrar catálogo recetas → catalogo_recetas + alias en 6 embeds PostgREST"
```

> **Coordinación de deploy:** desde que la migración corra en prod (Tarea 14) hasta que la app con este commit esté deployada en Vercel, el Catálogo, Nuevo Presupuesto, Propuesta y el preview de planificación van a fallar. Hacé el `db push` y el deploy en la misma ventana (Tarea 14, Step 7).

---

### Tarea 6: Migración `eventos`

Registro permanente de todo lo que entra/pasa por el sistema. SQL exacto del contrato + índices + Realtime (lo necesita el feed Actividad del Frente B) + RLS según enmienda 2026-06-11 (bot insert/select/update — necesita marcar `pendiente_pregunta → procesado/archivado/resuelto`; delete solo Eze).

**Files:**
- Create: `supabase/migrations/20260612104000_eventos.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- eventos: registro permanente de todo lo que entra/pasa por el sistema
-- (contrato de datos Centro de Mando 2026-06-11 — nombres y estados NO se cambian).

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  origen text not null check (origen in ('whatsapp','tablero','daemon','bot','sistema')),
  tipo text not null,
  estado text not null default 'procesado' check (estado in ('procesado','pendiente_pregunta','archivado','resuelto')),
  titulo text not null,
  contenido jsonb not null default '{}'::jsonb,
  destino_tabla text,
  destino_id uuid,
  wa_message_id text unique
);

create index if not exists eventos_creado_idx
  on public.eventos (creado_at desc);

create index if not exists eventos_estado_idx
  on public.eventos (estado, creado_at desc);

comment on table public.eventos is
  'Registro permanente: todo mensaje del bot, acción del daemon y orden del tablero deja fila acá. estado=archivado alimenta la vista Archivados; wa_message_id deduplica webhooks de WhatsApp.';

alter table public.eventos enable row level security;
revoke all on public.eventos from anon;

drop policy if exists "eventos_select_auth" on public.eventos;
create policy "eventos_select_auth" on public.eventos
  for select to authenticated using (true);

drop policy if exists "eventos_insert_auth" on public.eventos;
create policy "eventos_insert_auth" on public.eventos
  for insert to authenticated with check (true);

-- update abierto a authenticated: el bot marca estados (pendiente_pregunta →
-- procesado / archivado / resuelto) — enmienda 2026-06-11. delete solo Eze.
drop policy if exists "eventos_update_auth" on public.eventos;
create policy "eventos_update_auth" on public.eventos
  for update to authenticated
  using (true) with check (true);

drop policy if exists "eventos_delete_no_bot" on public.eventos;
create policy "eventos_delete_no_bot" on public.eventos
  for delete to authenticated
  using (not public.es_bot());

-- Realtime: el feed Actividad del tablero (Frente B) escucha cambios de esta tabla.
do $$
begin
  alter publication supabase_realtime add table public.eventos;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime no existe: habilitala desde Dashboard → Database → Replication';
end $$;
```

- [ ] **Step 2: Verificar el archivo contra el contrato**

Run: `grep -c "check (origen in ('whatsapp','tablero','daemon','bot','sistema'))" supabase/migrations/20260612104000_eventos.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612104000_eventos.sql
git commit -m "feat(db): tabla eventos (registro permanente) + RLS + realtime"
```

---

### Tarea 7: Migración `trabajos_cola`

Generalización de `cotizaciones_cola` (que NO se toca en este frente: sigue viva hasta que Frentes C/E migren el bot y el daemon). SQL exacto del contrato + trigger `actualizado_at` + Realtime (progreso en vivo de la barra de comando del Frente B).

**Files:**
- Create: `supabase/migrations/20260612105000_trabajos_cola.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- trabajos_cola: cola general de trabajo pesado (cotizar/redactar/consulta/orden).
-- Generaliza cotizaciones_cola (que sigue existiendo hasta que bot y daemon migren).
-- Contrato de datos Centro de Mando 2026-06-11 — nombres y estados NO se cambian.

create table if not exists public.trabajos_cola (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('cotizar','redactar','consulta','orden')),
  origen text not null check (origen in ('whatsapp','tablero')),
  estado text not null default 'pendiente' check (estado in ('pendiente','esperando_datos','procesando','en_revision','completado','error','cancelado')),
  prompt text not null,
  contexto jsonb not null default '{}'::jsonb,
  resultado jsonb,
  error text
);

create index if not exists trabajos_cola_estado_idx
  on public.trabajos_cola (estado, creado_at);

comment on table public.trabajos_cola is
  'Cola que procesa el daemon de la Mac (Claude Code headless). El bot y la barra de comando insertan; el daemon levanta `pendiente` y actualiza estado/resultado.';

drop trigger if exists trabajos_cola_actualizado_at on public.trabajos_cola;
create trigger trabajos_cola_actualizado_at
  before update on public.trabajos_cola
  for each row execute function public.set_actualizado_at();

alter table public.trabajos_cola enable row level security;
revoke all on public.trabajos_cola from anon;

drop policy if exists "trabajos_cola_select_auth" on public.trabajos_cola;
create policy "trabajos_cola_select_auth" on public.trabajos_cola
  for select to authenticated using (true);

drop policy if exists "trabajos_cola_insert_auth" on public.trabajos_cola;
create policy "trabajos_cola_insert_auth" on public.trabajos_cola
  for insert to authenticated with check (true);

-- update abierto a authenticated: el bot cancela trabajos ("cancelar") y completa
-- fichas (estado esperando_datos → pendiente con contexto.respuestas) — enmienda
-- 2026-06-11. delete solo Eze.
drop policy if exists "trabajos_cola_update_auth" on public.trabajos_cola;
create policy "trabajos_cola_update_auth" on public.trabajos_cola
  for update to authenticated
  using (true) with check (true);

drop policy if exists "trabajos_cola_delete_no_bot" on public.trabajos_cola;
create policy "trabajos_cola_delete_no_bot" on public.trabajos_cola
  for delete to authenticated
  using (not public.es_bot());

-- Realtime: el tablero muestra el progreso de la cola en vivo (Frente B).
do $$
begin
  alter publication supabase_realtime add table public.trabajos_cola;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime no existe: habilitala desde Dashboard → Database → Replication';
end $$;
```

- [ ] **Step 2: Verificar el archivo contra el contrato**

Run: `grep -c "'pendiente','esperando_datos','procesando','en_revision','completado','error','cancelado'" supabase/migrations/20260612105000_trabajos_cola.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612105000_trabajos_cola.sql
git commit -m "feat(db): tabla trabajos_cola (cola general del daemon) + RLS + realtime"
```

---

### Tarea 8: Migración `recetas` (recetario paramétrico del cotizador)

Requiere las Tareas 2 (helpers) y 5 (rename) aplicadas antes — el orden de timestamps ya lo garantiza. El bot NO toca esta tabla (solo Eze y el daemon vía su propio acceso).

**Files:**
- Create: `supabase/migrations/20260612106000_recetas.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- recetas: recetario paramétrico del cotizador (contrato Centro de Mando 2026-06-11).
-- OJO: el catálogo viejo que se llamaba `recetas` ahora es `catalogo_recetas`
-- (migración 20260612103000). Esta tabla es NUEVA y de otro dominio.

create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  nombre text not null unique,
  titulo text not null,
  estado text not null default 'investigada' check (estado in ('investigada','confiable')),
  parametros jsonb not null,
  etapas jsonb not null,
  checklist jsonb not null default '[]'::jsonb,
  fuentes jsonb not null default '[]'::jsonb,
  version int not null default 1
);

comment on table public.recetas is
  'Recetas paramétricas del cotizador: etapas + materiales con fórmula por m²/ml/unidad + MO + tiempos. estado=investigada hasta validarse en obra real (pasa a confiable).';

drop trigger if exists recetas_actualizado_at on public.recetas;
create trigger recetas_actualizado_at
  before update on public.recetas
  for each row execute function public.set_actualizado_at();

alter table public.recetas enable row level security;
revoke all on public.recetas from anon;

drop policy if exists "recetas_all_no_bot" on public.recetas;
create policy "recetas_all_no_bot" on public.recetas
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());
```

- [ ] **Step 2: Verificar el archivo contra el contrato**

Run: `grep -c "check (estado in ('investigada','confiable'))" supabase/migrations/20260612106000_recetas.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612106000_recetas.sql
git commit -m "feat(db): tabla recetas del cotizador (recetario paramétrico) + RLS"
```

---

### Tarea 9: Migración `cotizaciones`

Estados de la mesa de revisión (gate obligatorio de Eze). FKs a `trabajos_cola`, `recetas` y `presupuestos` (esta última pre-existe en prod sin migración versionada — solo funciona contra prod, igual que el resto del repo).

**Files:**
- Create: `supabase/migrations/20260612107000_cotizaciones.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- cotizaciones: mesa de revisión del cotizador (contrato Centro de Mando 2026-06-11).
-- Flujo de estados: borrador → en_revision → aprobada → documento_emitido
-- (o rechazada con motivo, que alimenta cotizador_lecciones).
-- FK a public.presupuestos: tabla pre-existente en prod (sin migración versionada).

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  trabajo_id uuid references public.trabajos_cola(id),
  titulo text not null,
  zona text,
  estado text not null default 'borrador' check (estado in ('borrador','en_revision','aprobada','rechazada','documento_emitido')),
  receta_id uuid references public.recetas(id),
  ficha jsonb not null default '{}'::jsonb,
  desglose jsonb not null default '{}'::jsonb,
  total_min numeric,
  total_max numeric,
  revision jsonb,
  motivo_rechazo text,
  presupuesto_id uuid references public.presupuestos(id)
);

create index if not exists cotizaciones_estado_idx
  on public.cotizaciones (estado, creado_at desc);

create index if not exists cotizaciones_trabajo_idx
  on public.cotizaciones (trabajo_id);

create index if not exists cotizaciones_receta_idx
  on public.cotizaciones (receta_id);

comment on table public.cotizaciones is
  'Cotizaciones del Cotizador 2.0. El documento final NUNCA se emite sin OK explícito de Eze (estado aprobada). revision guarda el paquete de la mesa: fuentes fechadas, checklist, sanidad física, divergencias de precio.';

alter table public.cotizaciones enable row level security;
revoke all on public.cotizaciones from anon;

-- RLS enmienda 2026-06-11: el bot LEE y ACTUALIZA cotizaciones (la aprobación de la
-- mesa de revisión por WhatsApp: "OK" → estado aprobada, "corregir X" → rechazada).
-- Crear y borrar: solo Eze (el alta la hace el daemon vía su propio acceso).
drop policy if exists "cotizaciones_select_auth" on public.cotizaciones;
create policy "cotizaciones_select_auth" on public.cotizaciones
  for select to authenticated using (true);

drop policy if exists "cotizaciones_insert_no_bot" on public.cotizaciones;
create policy "cotizaciones_insert_no_bot" on public.cotizaciones
  for insert to authenticated
  with check (not public.es_bot());

drop policy if exists "cotizaciones_update_auth" on public.cotizaciones;
create policy "cotizaciones_update_auth" on public.cotizaciones
  for update to authenticated
  using (true) with check (true);

drop policy if exists "cotizaciones_delete_no_bot" on public.cotizaciones;
create policy "cotizaciones_delete_no_bot" on public.cotizaciones
  for delete to authenticated
  using (not public.es_bot());
```

- [ ] **Step 2: Verificar el archivo contra el contrato**

Run: `grep -c "'borrador','en_revision','aprobada','rechazada','documento_emitido'" supabase/migrations/20260612107000_cotizaciones.sql`
Expected: `1`

Run: `grep -c "create policy" supabase/migrations/20260612107000_cotizaciones.sql`
Expected: `4` (select auth, insert no_bot, update auth, delete no_bot — matriz de la enmienda)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612107000_cotizaciones.sql
git commit -m "feat(db): tabla cotizaciones (mesa de revisión) + RLS"
```

---

### Tarea 10: Migración `cotizador_lecciones`

Los loops de mejora del cotizador (contraste con obra real, auto-crítica, rechazos).

**Files:**
- Create: `supabase/migrations/20260612108000_cotizador_lecciones.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- cotizador_lecciones: memoria de los loops de mejora del cotizador
-- (contrato Centro de Mando 2026-06-11).
-- contraste_obra = cotizado vs gastado real al cerrar obra; auto_critica = revisor
-- post-cotización; rechazo = motivo cuando Eze rechaza en la mesa.

create table if not exists public.cotizador_lecciones (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('contraste_obra','auto_critica','rechazo')),
  receta_nombre text,
  cotizacion_id uuid references public.cotizaciones(id),
  obra_presupuesto_id uuid references public.presupuestos(id),
  leccion text not null,
  ajuste jsonb
);

create index if not exists cotizador_lecciones_receta_idx
  on public.cotizador_lecciones (receta_nombre, creado_at desc);

create index if not exists cotizador_lecciones_tipo_idx
  on public.cotizador_lecciones (tipo);

comment on table public.cotizador_lecciones is
  'Lecciones que se inyectan en la próxima cotización. ajuste = JSON con coeficientes corregidos (desperdicio, rendimiento, tiempos).';

alter table public.cotizador_lecciones enable row level security;
revoke all on public.cotizador_lecciones from anon;

-- RLS enmienda 2026-06-11: el bot solo INSERTA (el rechazo por WhatsApp deja una
-- lección tipo 'rechazo'). Leer, editar y borrar: solo Eze/daemon.
drop policy if exists "cotizador_lecciones_select_no_bot" on public.cotizador_lecciones;
create policy "cotizador_lecciones_select_no_bot" on public.cotizador_lecciones
  for select to authenticated
  using (not public.es_bot());

drop policy if exists "cotizador_lecciones_insert_auth" on public.cotizador_lecciones;
create policy "cotizador_lecciones_insert_auth" on public.cotizador_lecciones
  for insert to authenticated
  with check (true);

drop policy if exists "cotizador_lecciones_update_no_bot" on public.cotizador_lecciones;
create policy "cotizador_lecciones_update_no_bot" on public.cotizador_lecciones
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "cotizador_lecciones_delete_no_bot" on public.cotizador_lecciones;
create policy "cotizador_lecciones_delete_no_bot" on public.cotizador_lecciones
  for delete to authenticated
  using (not public.es_bot());
```

- [ ] **Step 2: Verificar el archivo contra el contrato**

Run: `grep -c "check (tipo in ('contraste_obra','auto_critica','rechazo'))" supabase/migrations/20260612108000_cotizador_lecciones.sql`
Expected: `1`

Run: `grep -c "create policy" supabase/migrations/20260612108000_cotizador_lecciones.sql`
Expected: `4` (select no_bot, insert auth, update no_bot, delete no_bot — matriz de la enmienda)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612108000_cotizador_lecciones.sql
git commit -m "feat(db): tabla cotizador_lecciones (loops de mejora) + RLS"
```

---

### Tarea 11: Migración `referencias` (ADN: filosofía + estética)

El bot inserta capturas (frases de libros, fotos de referencias estéticas); el tablero las lee para el moodboard. Bot insert/select según contrato.

**Files:**
- Create: `supabase/migrations/20260612109000_referencias.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- referencias: ADN de Ravn — filosofía (frases/reflexiones) y estética (fotos
-- etiquetadas en el bucket `referencias`). Contrato Centro de Mando 2026-06-11.

create table if not exists public.referencias (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('filosofia','estetica')),
  texto text,
  etiquetas text[] not null default '{}',
  fuente text,
  imagen_path text,
  evento_id uuid references public.eventos(id)
);

create index if not exists referencias_tipo_idx
  on public.referencias (tipo, creado_at desc);

create index if not exists referencias_etiquetas_idx
  on public.referencias using gin (etiquetas);

comment on table public.referencias is
  'Capturas de ADN vía bot: tipo=filosofia (texto + fuente) o tipo=estetica (imagen_path al bucket privado `referencias` + etiquetas de la IA). Alimenta el moodboard del tablero.';

alter table public.referencias enable row level security;
revoke all on public.referencias from anon;

drop policy if exists "referencias_select_auth" on public.referencias;
create policy "referencias_select_auth" on public.referencias
  for select to authenticated using (true);

drop policy if exists "referencias_insert_auth" on public.referencias;
create policy "referencias_insert_auth" on public.referencias
  for insert to authenticated with check (true);

drop policy if exists "referencias_update_no_bot" on public.referencias;
create policy "referencias_update_no_bot" on public.referencias
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "referencias_delete_no_bot" on public.referencias;
create policy "referencias_delete_no_bot" on public.referencias
  for delete to authenticated
  using (not public.es_bot());
```

- [ ] **Step 2: Verificar el archivo contra el contrato**

Run: `grep -c "check (tipo in ('filosofia','estetica'))" supabase/migrations/20260612109000_referencias.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612109000_referencias.sql
git commit -m "feat(db): tabla referencias (ADN filosofía + estética) + RLS"
```

---

### Tarea 12: Migración bucket Storage `referencias` (privado)

Bucket privado: las imágenes se sirven por signed URLs (las genera la app server-side). El bot sube (insert) como usuario authenticated; borrar/pisar solo Eze.

**Files:**
- Create: `supabase/migrations/20260612110000_storage_referencias.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Bucket privado `referencias` para imágenes del ADN (moodboard).
-- Acceso de lectura SIEMPRE vía signed URLs generadas server-side.
-- Patrón del repo: 20260415210000_gastos_obra_adjuntos_storage.sql (pero PRIVADO).
-- Enmienda RLS 2026-06-11: el INSERT en storage.objects de este bucket incluye al
-- BOT a propósito (la policy de insert es para todo `authenticated`, sin not es_bot():
-- el bot sube las fotos de referencias que llegan por WhatsApp). Pisar (update) y
-- borrar siguen siendo solo de Eze.

insert into storage.buckets (id, name, public, file_size_limit)
values ('referencias', 'referencias', false, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "referencias_storage_select_auth" on storage.objects;
create policy "referencias_storage_select_auth"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'referencias');

drop policy if exists "referencias_storage_insert_auth" on storage.objects;
create policy "referencias_storage_insert_auth"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'referencias');

drop policy if exists "referencias_storage_update_no_bot" on storage.objects;
create policy "referencias_storage_update_no_bot"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'referencias' and not public.es_bot())
  with check (bucket_id = 'referencias' and not public.es_bot());

drop policy if exists "referencias_storage_delete_no_bot" on storage.objects;
create policy "referencias_storage_delete_no_bot"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'referencias' and not public.es_bot());
```

- [ ] **Step 2: Verificar el archivo**

Run: `grep -c "bucket_id = 'referencias'" supabase/migrations/20260612110000_storage_referencias.sql`
Expected: `5` (select using, insert check, update using + check, delete using)

> **Fallback conocido:** si al aplicar (Tarea 14) `db push` falla con `must be owner of table objects`, creá las 4 policies a mano desde Dashboard → Storage → Policies (mismas expresiones `using`/`with check`, target role `authenticated`) y marcá la migración como aplicada: `supabase migration repair --status applied 20260612110000`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260612110000_storage_referencias.sql
git commit -m "feat(storage): bucket privado referencias + policies"
```

---

### Tarea 13: Migraciones de RLS sobre tablas existentes — `presupuestos_gastos`, `inmobiliario_*`, `presupuestos`, tablas de negocio pre-existentes y `maestro_precios_*`

`presupuestos_gastos` necesita la policy de bot del contrato (hoy probablemente sin RLS). Las 4 tablas `inmobiliario_*` hoy tienen `using (true)` con grant a `anon` — quedan solo para authenticated no-bot. `presupuestos` entra por la enmienda 2026-06-11: el bot necesita SELECT (resuelve "gasto de la obra Saavedra" buscando la obra por nombre) y nada más. Las tablas de negocio pre-existentes (`obras`, `cashflow_items`, `cashflow_cierres_obra`, `presupuestos_items`, `rubros`, `catalogo_recetas`) hoy no tienen RLS: entran con el patrón ya aplicado a `presupuestos` (select para todo authenticated, insert/update/delete solo no-bot — la app opera como Eze, no la afecta; el bot queda read-only en datos de negocio). Y `maestro_precios_items` / `maestro_precios_gestion` hoy tienen la policy `for all using(true) with check(true)` más grant a `anon` (igual que `inmobiliario_*`): se revocan los grants de anon y se endurece con select/insert/update/delete solo para authenticated no-bot (el bot ni las lee ni las escribe).

**Files:**
- Create: `supabase/migrations/20260612111000_presupuestos_gastos_rls.sql`
- Create: `supabase/migrations/20260612112000_inmobiliario_rls.sql`
- Create: `supabase/migrations/20260612113000_presupuestos_rls.sql`
- Create: `supabase/migrations/20260612114000_negocio_rls.sql`
- Create: `supabase/migrations/20260612115000_maestro_precios_rls.sql`

- [ ] **Step 1: Crear `20260612111000_presupuestos_gastos_rls.sql`**

```sql
-- presupuestos_gastos: habilitar RLS (contrato Centro de Mando: Eze total, bot insert/select).
-- La app la usa con el browser logueado (gastos-screen, control-gastos-screen → authenticated)
-- y con service_role en API routes (bypass) → esto no rompe nada de la app.

alter table public.presupuestos_gastos enable row level security;
revoke all on public.presupuestos_gastos from anon;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'presupuestos_gastos'
  loop
    execute format('drop policy if exists %I on public.presupuestos_gastos', p.policyname);
  end loop;
end $$;

create policy "presupuestos_gastos_select_auth" on public.presupuestos_gastos
  for select to authenticated using (true);

create policy "presupuestos_gastos_insert_auth" on public.presupuestos_gastos
  for insert to authenticated with check (true);

create policy "presupuestos_gastos_update_no_bot" on public.presupuestos_gastos
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

create policy "presupuestos_gastos_delete_no_bot" on public.presupuestos_gastos
  for delete to authenticated
  using (not public.es_bot());
```

- [ ] **Step 2: Crear `20260612112000_inmobiliario_rls.sql`**

```sql
-- Endurecer RLS de inmobiliario_* (estándar de seguridad Ravn).
-- Antes: policies using(true) para TODOS + grants a anon (tabla abierta al público
-- con la anon key). Ahora: solo usuario autenticado real (no bot); anon afuera.
-- Los jobs de scraping/agregación usan service_role server-side (bypass) → no se rompen.

drop policy if exists "inmobiliario_zonas_all" on public.inmobiliario_zonas;
drop policy if exists "inmobiliario_avisos_all" on public.inmobiliario_avisos_snapshot;
drop policy if exists "inmobiliario_precios_all" on public.inmobiliario_precios_zona_periodo;
drop policy if exists "inmobiliario_noticias_all" on public.inmobiliario_noticias;

drop policy if exists "inmobiliario_zonas_all_no_bot" on public.inmobiliario_zonas;
create policy "inmobiliario_zonas_all_no_bot" on public.inmobiliario_zonas
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "inmobiliario_avisos_all_no_bot" on public.inmobiliario_avisos_snapshot;
create policy "inmobiliario_avisos_all_no_bot" on public.inmobiliario_avisos_snapshot
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "inmobiliario_precios_all_no_bot" on public.inmobiliario_precios_zona_periodo;
create policy "inmobiliario_precios_all_no_bot" on public.inmobiliario_precios_zona_periodo
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "inmobiliario_noticias_all_no_bot" on public.inmobiliario_noticias;
create policy "inmobiliario_noticias_all_no_bot" on public.inmobiliario_noticias
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

revoke all on public.inmobiliario_zonas from anon;
revoke all on public.inmobiliario_avisos_snapshot from anon;
revoke all on public.inmobiliario_precios_zona_periodo from anon;
revoke all on public.inmobiliario_noticias from anon;
```

- [ ] **Step 3: Crear `20260612113000_presupuestos_rls.sql`**

```sql
-- presupuestos: habilitar RLS (enmienda 2026-06-11 — el bot SOLO LEE: necesita
-- resolver "gasto de la obra X" buscando la obra por nombre; nunca escribe acá).
-- La app la opera desde el browser logueado como Eze (select/insert/update/delete
-- directos en historial-screen, nuevo-presupuesto, marcar-pdf-generado, etc.) →
-- las policies no-bot mantienen TODO eso intacto (Eze no es bot).
-- Las API routes usan service_role (bypass) → tampoco se rompen.
-- No hay rutas públicas: src/middleware.ts redirige todo a /login sin sesión,
-- así que revocar anon no afecta a nadie.

alter table public.presupuestos enable row level security;
revoke all on public.presupuestos from anon;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'presupuestos'
  loop
    execute format('drop policy if exists %I on public.presupuestos', p.policyname);
  end loop;
end $$;

create policy "presupuestos_select_auth" on public.presupuestos
  for select to authenticated using (true);

create policy "presupuestos_insert_no_bot" on public.presupuestos
  for insert to authenticated
  with check (not public.es_bot());

create policy "presupuestos_update_no_bot" on public.presupuestos
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

create policy "presupuestos_delete_no_bot" on public.presupuestos
  for delete to authenticated
  using (not public.es_bot());
```

- [ ] **Step 4: Crear `20260612114000_negocio_rls.sql`**

```sql
-- RLS en tablas de negocio pre-existentes (sin migración versionada y sin RLS):
-- obras, cashflow_items, cashflow_cierres_obra, presupuestos_items, rubros y
-- catalogo_recetas (ex recetas — ya renombrada por 20260612103000).
-- Patrón: select para todo authenticated; insert/update/delete solo no-bot.
-- La app opera como Eze (usuario autenticado no-bot) → no se rompe nada.
-- Las API routes usan service_role (bypass) → tampoco se rompen.
-- El bot queda read-only en todos los datos de negocio.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'obras','cashflow_items','cashflow_cierres_obra',
    'presupuestos_items','rubros','catalogo_recetas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (not public.es_bot())',
      t || '_insert_no_bot', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (not public.es_bot()) with check (not public.es_bot())',
      t || '_update_no_bot', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (not public.es_bot())',
      t || '_delete_no_bot', t
    );
  end loop;
end $$;
```

- [ ] **Step 5: Crear `20260612115000_maestro_precios_rls.sql`**

```sql
-- Endurecer RLS de maestro_precios_items y maestro_precios_gestion.
-- Antes (migración 20260419140000, líneas 48-57): policy "for all using(true) with check(true)"
-- + grants a anon, authenticated, service_role — tablas abiertas al público con la anon key.
-- Ahora: solo authenticated no-bot; anon afuera.
-- El bot ni las lee ni las escribe (son parámetros de precios de Eze).
-- La app los lee/escribe desde el browser logueado como Eze → no se rompe nada.

drop policy if exists "maestro_precios_items_all" on public.maestro_precios_items;
drop policy if exists "maestro_precios_gestion_all" on public.maestro_precios_gestion;

drop policy if exists "maestro_precios_items_all_no_bot" on public.maestro_precios_items;
create policy "maestro_precios_items_all_no_bot" on public.maestro_precios_items
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "maestro_precios_gestion_all_no_bot" on public.maestro_precios_gestion;
create policy "maestro_precios_gestion_all_no_bot" on public.maestro_precios_gestion
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

revoke all on public.maestro_precios_items from anon;
revoke all on public.maestro_precios_gestion from anon;
```

- [ ] **Step 6: Verificar los archivos**

Run: `grep -c "create policy" supabase/migrations/20260612111000_presupuestos_gastos_rls.sql supabase/migrations/20260612112000_inmobiliario_rls.sql supabase/migrations/20260612113000_presupuestos_rls.sql supabase/migrations/20260612115000_maestro_precios_rls.sql`
Expected:
```
supabase/migrations/20260612111000_presupuestos_gastos_rls.sql:4
supabase/migrations/20260612112000_inmobiliario_rls.sql:4
supabase/migrations/20260612113000_presupuestos_rls.sql:4
supabase/migrations/20260612115000_maestro_precios_rls.sql:2
```

> La migración `20260612114000_negocio_rls.sql` usa un loop que genera 24 policies (6 tablas × 4 ops), por eso no aparece en el `grep -c "create policy"` anterior (el `create policy` está en un `execute format`). Verificarla aparte:

Run: `grep -c "execute format" supabase/migrations/20260612114000_negocio_rls.sql`
Expected: `5` (alter enable, revoke, drop loop + 4 create policies por tabla = 1 alter + 1 revoke + 1 drop-loop body + 4 create = los que estén en el archivo — cualquier número entre 4 y 6 es correcto; lo que importa es que el SQL no tenga errores de sintaxis).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260612111000_presupuestos_gastos_rls.sql \
        supabase/migrations/20260612112000_inmobiliario_rls.sql \
        supabase/migrations/20260612113000_presupuestos_rls.sql \
        supabase/migrations/20260612114000_negocio_rls.sql \
        supabase/migrations/20260612115000_maestro_precios_rls.sql
git commit -m "feat(db): RLS en presupuestos_gastos, presupuestos, negocio pre-existente y maestro_precios_* + endurecer inmobiliario_* y anon"
```

---

### Tarea 14: Linkear la CLI, reparar el historial y aplicar todo a producción

Las 20 migraciones viejas se aplicaron a mano: hay que marcarlas como `applied` para que `db push` solo ejecute las 16 nuevas. **Esto toca producción: hacelo de corrido y con el deploy de la app en la misma ventana (por el rename de la Tarea 5).**

**Files:** ninguno (se modifica `supabase/.temp/`, que está fuera de git).

- [ ] **Step 1: Login y link del proyecto**

```bash
cd /Users/ezeotero/Documents/ravn
supabase projects list >/dev/null 2>&1 || supabase login
PROJECT_REF=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | sed -E 's#.*https://([a-z0-9]+)\.supabase\.co.*#\1#')
echo "ref: $PROJECT_REF"
supabase link --project-ref "$PROJECT_REF"
```

Expected: `Finished supabase link.` Si pide la contraseña de la base y no la tenés a mano: Dashboard → Project Settings → Database → Reset database password.

- [ ] **Step 2: Ver el estado del historial**

Run: `supabase migration list`
Expected: las 20 migraciones viejas con timestamp en la columna `Local` y `Remote` vacía (más las 16 nuevas igual). Si alguna vieja YA figura en Remote, excluila del repair del paso siguiente.

- [ ] **Step 3: Marcar las 20 viejas como aplicadas (sin ejecutarlas)**

```bash
supabase migration repair --status applied \
  20260326120000 20260327120000 20260327140000 20260327150000 \
  20260402220000 20260403010000 20260412120000 20260412180000 \
  20260412190000 20260415120000 20260415140000 20260415160000 \
  20260415170000 20260415180000 20260415190000 20260415210000 \
  20260415220000 20260417230000 20260419140000 20260522120000
```

Expected: `Repaired migration history: [...] => applied` (una línea por timestamp).

- [ ] **Step 4: Dry-run y push**

```bash
supabase db push --dry-run
```

Expected: lista EXACTAMENTE las 16 migraciones nuevas (`20260612100000` … `20260612115000`), ninguna vieja.

```bash
supabase db push
```

Expected: `Applying migration 20260612100000_base_seguridad.sql...` … hasta `20260612115000` y `Finished supabase db push.` Si falla la de storage (`must be owner of table objects`), aplicá el fallback documentado en la Tarea 12 y re-corré `supabase db push`.

- [ ] **Step 5: Verificar historial alineado**

Run: `supabase migration list`
Expected: todas las filas con Local y Remote iguales.

- [ ] **Step 6: Verificación REST de las tablas y del bucket**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a

# Todas las tablas nuevas + las pre-existentes con RLS nuevo responden 200 con service_role:
for t in \
  seguridad_config gastos_personales tareas eventos trabajos_cola \
  recetas cotizaciones cotizador_lecciones referencias \
  catalogo_recetas presupuestos \
  obras cashflow_items cashflow_cierres_obra presupuestos_items rubros \
  maestro_precios_items maestro_precios_gestion; do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$t?select=id&limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
  echo "$t -> $code"
done
```

Expected: las 18 líneas con `-> 200`.

```bash
# La anon key sola NO puede insertar (revoke + RLS):
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/eventos" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"origen":"sistema","tipo":"prueba","titulo":"no deberia entrar"}'
```

Expected: error `42501` / `permission denied for table eventos` (cualquier 4xx con permission denied vale; lo que NO puede pasar es un 201).

```bash
# El bucket existe y es privado:
curl -s "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/bucket/referencias" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool
```

Expected: JSON con `"id": "referencias"` y `"public": false`.

- [ ] **Step 7: Deploy de la app (cierra la ventana del rename)**

Mergear/pushear la rama a `main` según el flujo de la sesión (Vercel deploya automático desde `main`). Después verificar a mano en la app deployada:
- Abrir la pantalla **Catálogo** → los ítems cargan (la app ya consulta `catalogo_recetas`).
- Abrir una **Propuesta existente** → los ítems cargan con nombre, unidad y rubro (los 2 embeds de `propuesta-screen.tsx` funcionan con el alias).
- Ir a **Nuevo Presupuesto → pestaña Cashflow → preview de planificación** de una obra existente → el resumen de ítems proyectados se genera sin error (el embed de `planificar-preview/route.ts` funciona con el alias).

Si el plan se ejecuta en una rama que no se mergea todavía, NO corras esta tarea hasta que el merge esté listo — coordiná con Eze.

---

### Tarea 15: Sembrar `bot_email` y verificar la RLS del bot end-to-end

`es_bot()` devuelve `false` para todos hasta que `seguridad_config.bot_email` tenga el email real del bot. Acá lo sembramos desde Railway y probamos logueándonos COMO el bot la **matriz completa de la enmienda RLS 2026-06-11**: eventos (insert/select/update sí, delete no), trabajos_cola (insert/select/update sí, delete no), tareas (CRUD completo), gastos_personales (insert/select/delete sí, update no), presupuestos (solo select), cotizaciones (select/update sí, insert no), cotizador_lecciones (solo insert), recetas (nada) y el bucket Storage (solo insert).

**Files:** ninguno (config en base + verificación por REST).

> **Shell:** los Steps 2–13 usan las variables de los Steps 1 y 3 (`$BOT_EMAIL`, `$BOT_PASSWORD`, `$BOT_TOKEN` y las de `.env.local`). Corré toda la tarea en UNA misma shell; si la cortás, repetí Step 1 + `set -a; source .env.local; set +a` + Step 3 antes de seguir. El token del bot expira en ~1 hora: si algún curl empieza a dar `401`, regenerá `$BOT_TOKEN` con el Step 3.

- [ ] **Step 1: Traer las credenciales del bot desde Railway (sin imprimirlas)**

```bash
cd /Users/ezeotero/Documents/ravn-bots
railway status || railway link   # si pide elegir: proyecto del bot (ravn-bots) y su servicio
BOT_EMAIL=$(railway variables --kv | grep '^BOT_EMAIL=' | cut -d= -f2-)
BOT_PASSWORD=$(railway variables --kv | grep '^BOT_PASSWORD=' | cut -d= -f2-)
echo "BOT_EMAIL presente: ${BOT_EMAIL:+si}  BOT_PASSWORD presente: ${BOT_PASSWORD:+si}"
```

Expected: `BOT_EMAIL presente: si  BOT_PASSWORD presente: si`. Si falta alguna, frená y resolvé primero la Tarea 19.

- [ ] **Step 2: Sembrar el email en `seguridad_config`**

```bash
cd /Users/ezeotero/Documents/ravn
set -a; source .env.local; set +a
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/seguridad_config?id=eq.1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"bot_email\": \"$BOT_EMAIL\"}"
```

Expected: JSON con `"bot_email"` igual al email del bot.

- [ ] **Step 3: Loguearse como el bot y obtener token**

```bash
BOT_TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$BOT_EMAIL\",\"password\":\"$BOT_PASSWORD\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
echo "token: ${BOT_TOKEN:+ok}"
```

Expected: `token: ok`. Si viene vacío, el usuario bot no existe o la password no coincide → revisar Authentication → Users en el dashboard.

- [ ] **Step 4: `eventos` — el bot inserta, ACTUALIZA (enmienda) y no borra**

```bash
# Sanity check de la shell (todo tiene que decir ok; si no, repetí Steps 1-3):
echo "URL:${NEXT_PUBLIC_SUPABASE_URL:+ok} ANON:${NEXT_PUBLIC_SUPABASE_ANON_KEY:+ok} SR:${SUPABASE_SERVICE_ROLE_KEY:+ok} BOT:${BOT_TOKEN:+ok}"

# INSERT permitido:
curl -s -o /dev/null -w 'eventos insert: %{http_code}\n' -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/eventos" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"origen":"bot","tipo":"verificacion_rls","titulo":"prueba RLS Frente A"}'

# UPDATE permitido (enmienda: el bot marca estados):
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/eventos?tipo=eq.verificacion_rls" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"estado":"archivado"}'

# DELETE bloqueado (delete_no_bot filtra todas las filas → lista vacía, no borra nada):
curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/eventos?tipo=eq.verificacion_rls" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Prefer: return=representation"
```

Expected: `eventos insert: 201`; el PATCH devuelve un array NO vacío con `"estado":"archivado"` (si devuelve `[]`, la policy `eventos_update_auth` quedó mal); el DELETE devuelve `[]` (la fila sigue viva — se limpia en el Step 13).

- [ ] **Step 5: `trabajos_cola` — el bot encola, ACTUALIZA (enmienda) y no borra**

```bash
TRABAJO_ID=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"tipo":"consulta","origen":"whatsapp","prompt":"prueba RLS Frente A"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "trabajo insertado: ${TRABAJO_ID:+ok}"

# UPDATE permitido (enmienda: cancelar trabajos / responder fichas):
curl -s -o /dev/null -w 'trabajos_cola update: %{http_code}\n' -X PATCH \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?id=eq.$TRABAJO_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estado":"cancelado"}'

# DELETE bloqueado → lista vacía:
curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/trabajos_cola?id=eq.$TRABAJO_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Prefer: return=representation"
```

Expected: `trabajo insertado: ok`, `trabajos_cola update: 204`, y el DELETE devuelve `[]` (se limpia en el Step 13).

- [ ] **Step 6: `tareas` — CRUD completo del bot (enmienda)**

```bash
TAREA_ID=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/tareas" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"texto":"prueba RLS Frente A","origen":"whatsapp"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "tarea insertada: ${TAREA_ID:+ok}"

# UPDATE permitido ("marcá hecha"):
curl -s -o /dev/null -w 'tareas update: %{http_code}\n' -X PATCH \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/tareas?id=eq.$TAREA_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estado":"hecha"}'

# DELETE permitido ("borrá lo último") — devuelve la fila borrada:
curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/tareas?id=eq.$TAREA_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Prefer: return=representation"
```

Expected: `tarea insertada: ok`, `tareas update: 204`, y el DELETE devuelve un array NO vacío con la tarea (el bot borra de verdad; no queda nada que limpiar).

- [ ] **Step 7: `gastos_personales` — insert y delete sí (enmienda), update NO**

```bash
GASTO_ID=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/gastos_personales" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"concepto":"prueba RLS Frente A","origen":"whatsapp"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "gasto insertado: ${GASTO_ID:+ok}"

# UPDATE bloqueado → lista vacía, no toca la fila:
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/gastos_personales?id=eq.$GASTO_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"concepto":"hackeado"}'

# DELETE permitido (enmienda: "borrá el último gasto") — devuelve la fila borrada:
curl -s -X DELETE "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/gastos_personales?id=eq.$GASTO_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Prefer: return=representation"
```

Expected: `gasto insertado: ok`; el PATCH devuelve `[]`; el DELETE devuelve un array NO vacío (no queda nada que limpiar).

- [ ] **Step 8: `presupuestos` — el bot LEE (enmienda) pero no escribe**

```bash
# SELECT permitido:
curl -s -o /dev/null -w 'presupuestos select: %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/presupuestos?select=id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN"

# Fila sintética con service_role para probar el bloqueo de escritura SIN tocar
# datos reales (mismas columnas que inserta la app en nuevo-presupuesto.tsx):
PRES_ID=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/presupuestos" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"nombre_obra":"prueba RLS Frente A","nombre_cliente":"prueba RLS Frente A","domicilio":"-","fecha":"2026-06-12","ajuste_total_obra_pct":0,"estado":"borrador"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "presupuesto sintético: ${PRES_ID:+ok}"

# UPDATE del bot bloqueado → lista vacía:
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/presupuestos?id=eq.$PRES_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"domicilio":"hackeado"}'

# INSERT del bot bloqueado → 403:
curl -s -o /dev/null -w 'presupuestos insert bot: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/presupuestos" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre_obra":"no deberia entrar","nombre_cliente":"x","estado":"borrador"}'
```

Expected: `presupuestos select: 200`; `presupuesto sintético: ok`; el PATCH devuelve `[]`; `presupuestos insert bot: 403`. La fila sintética se borra en el Step 13.

- [ ] **Step 9: `cotizaciones` — el bot lee y APRUEBA con update (enmienda), no crea**

```bash
# Fila en revisión creada con service_role (el alta de cotizaciones NO es del bot):
COTIZ_ID=$(curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"titulo":"prueba RLS Frente A","estado":"en_revision"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "cotización de prueba: ${COTIZ_ID:+ok}"

# SELECT del bot permitido:
curl -s -o /dev/null -w 'cotizaciones select: %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones?id=eq.$COTIZ_ID&select=id,estado" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN"

# UPDATE del bot permitido (enmienda: el "OK" de la mesa por WhatsApp):
curl -s -X PATCH "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones?id=eq.$COTIZ_ID" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"estado":"aprobada"}'

# INSERT del bot bloqueado → 403:
curl -s -o /dev/null -w 'cotizaciones insert bot: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizaciones" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"no deberia entrar"}'
```

Expected: `cotización de prueba: ok`; `cotizaciones select: 200`; el PATCH devuelve un array NO vacío con `"estado":"aprobada"`; `cotizaciones insert bot: 403`. La fila se borra en el Step 13.

- [ ] **Step 10: `cotizador_lecciones` — el bot inserta (enmienda) pero no lee**

```bash
# INSERT permitido (el rechazo por WhatsApp deja lección):
curl -s -o /dev/null -w 'leccion insert: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizador_lecciones" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"rechazo","leccion":"prueba RLS Frente A"}'

# SELECT del bot filtrado por policy → lista vacía (la fila existe pero no la ve):
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizador_lecciones?leccion=eq.prueba%20RLS%20Frente%20A&select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN"

# La misma consulta con service_role SÍ la ve (confirma que el insert entró):
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/cotizador_lecciones?leccion=eq.prueba%20RLS%20Frente%20A&select=id,tipo" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: `leccion insert: 201`; la consulta del bot devuelve `[]`; la de service_role devuelve un array con 1 fila. Se limpia en el Step 13.

- [ ] **Step 11: `recetas` bloqueada + Storage — el bot SUBE al bucket (enmienda), no borra**

```bash
# Insert en recetas bloqueado → 403:
curl -s -o /dev/null -w 'recetas insert bot: %{http_code}\n' -X POST "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/recetas" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"prueba_bot","titulo":"x","parametros":{},"etapas":[]}'

# Upload al bucket referencias permitido (enmienda: las fotos del ADN) → 200:
curl -s -o /dev/null -w 'storage upload bot: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/referencias/verificacion-rls/prueba.txt" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary 'prueba RLS Frente A'

# Borrar del bucket bloqueado (delete de storage es no_bot):
curl -s -o /dev/null -w 'storage delete bot: %{http_code}\n' -X DELETE \
  "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/referencias/verificacion-rls/prueba.txt" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN"
```

Expected: `recetas insert bot: 403`; `storage upload bot: 200`; `storage delete bot: 4xx` (400/403/404 según versión de Storage — lo único que NO puede dar es 200). El objeto se borra en el Step 13.

- [ ] **Step 12: `obras` (tablas de negocio) — el bot lee pero no escribe**

```bash
# SELECT permitido (bot read-only en datos de negocio):
curl -s -o /dev/null -w 'obras select bot: %{http_code}\n' \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/obras?select=id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN"

# INSERT bloqueado → 403:
curl -s -o /dev/null -w 'obras insert bot: %{http_code}\n' -X POST \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/obras" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"no deberia entrar","estado":"activa"}'
```

Expected: `obras select bot: 200`; `obras insert bot: 403`.

- [ ] **Step 13: Limpieza con service_role (todo lo que quedó de la prueba)**

```bash
for ruta in \
  'eventos?tipo=eq.verificacion_rls' \
  'trabajos_cola?prompt=eq.prueba%20RLS%20Frente%20A' \
  'cotizador_lecciones?leccion=eq.prueba%20RLS%20Frente%20A' \
  'cotizaciones?titulo=eq.prueba%20RLS%20Frente%20A' \
  'presupuestos?nombre_obra=eq.prueba%20RLS%20Frente%20A'; do
  curl -s -o /dev/null -w "$ruta -> %{http_code}\n" -X DELETE \
    "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/$ruta" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
done

curl -s -o /dev/null -w 'storage objeto -> %{http_code}\n' -X DELETE \
  "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/referencias/verificacion-rls/prueba.txt" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: las 5 líneas REST con `-> 204` y `storage objeto -> 200`.

No hay commit: tarea de configuración y verificación.

---

### Tarea 16: Setup de Vitest

Ya hay un test huérfano en el repo (`src/lib/inmobiliario/__tests__/zona-slug.test.ts`, importa `vitest` pero `vitest` NO está en `package.json` ni en `node_modules` (solo hay un symlink roto en `.bin/` y caché `.vite`) ni tiene config ni script). Esta tarea instala vitest y lo deja todo formalizado.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (devDependencies + scripts)

- [ ] **Step 1: Instalar vitest como devDependency**

Run: `cd /Users/ezeotero/Documents/ravn && npm install -D vitest`
Expected: `package.json` gana `"vitest"` en `devDependencies` y `node_modules/vitest/` se crea. Este paso instala vitest desde cero — no asumir que ya está en `node_modules`.

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Agregar los scripts a `package.json`**

En el bloque `"scripts"`, después de la línea `"lint": "next lint",` agregar:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

El bloque queda:

```json
  "scripts": {
    "dev": "bash scripts/dev.sh",
    "dev:clean": "rm -rf .next && bash scripts/dev.sh",
    "dev:turbo": "RAVN_TURBOPACK=1 bash scripts/dev.sh",
    "dev:webpack": "RAVN_TURBOPACK=0 bash scripts/dev.sh",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "extract-fonts": "python3 scripts/extract_pdf_fonts.py"
  },
```

- [ ] **Step 4: Correr la suite (encuentra el test huérfano existente)**

Run: `npm test`
Expected: `Test Files  1 passed (1)` — el de `zona-slug.test.ts` (resuelve el alias `@/` gracias al config). Si falla la resolución del alias, revisá el `resolve.alias` del Step 2 antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "feat(test): setup Vitest (config + scripts) — adopta el test huérfano de zona-slug"
```

---

### Tarea 17: Tests de caracterización de `precio-por-margen-neto.ts`

La lib YA existe y está en producción: estos tests **fijan el comportamiento actual** (caracterización). Por eso acá el orden es test → correr → esperar VERDE. **Si un test falla, el equivocado es el test, no la lib: revisá tu lectura del código y corregí el test.** No toques `src/lib/precio-por-margen-neto.ts`.

**Files:**
- Test: `src/lib/precio-por-margen-neto.test.ts`
- Referencia (NO modificar): `src/lib/precio-por-margen-neto.ts`, `src/lib/format-currency.ts` (`roundArs2` redondea a centavos)

- [ ] **Step 1: Escribir el archivo de test completo**

```ts
import { describe, expect, it } from "vitest";
import {
  aplicarBonificacionSobrePrecio,
  margenSobreVentaPct,
  precioObjetivoPorMargenNeto,
  precioObjetivoPorRemarqueSobreCosto,
} from "@/lib/precio-por-margen-neto";

describe("precioObjetivoPorRemarqueSobreCosto", () => {
  it("aplica el remarque sobre el costo", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(100, 40)).toBe(140);
  });

  it("con remarque 0 devuelve el costo", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(100, 0)).toBe(100);
  });

  it("clampa remarques negativos a 0", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(100, -20)).toBe(100);
  });

  it("devuelve 0 si el costo es 0 o negativo", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(0, 50)).toBe(0);
    expect(precioObjetivoPorRemarqueSobreCosto(-5, 50)).toBe(0);
  });

  it("redondea a centavos", () => {
    // 99.99 × 1.355 = 135.48645 → 135.49
    expect(precioObjetivoPorRemarqueSobreCosto(99.99, 35.5)).toBe(135.49);
  });
});

describe("margenSobreVentaPct", () => {
  it("calcula el margen neto sobre la venta", () => {
    // remarque 40% sobre costo equivale a ≈28,57% sobre venta
    expect(margenSobreVentaPct(100, 140)).toBe(28.57);
  });

  it("margen 0 cuando precio = costo", () => {
    expect(margenSobreVentaPct(100, 100)).toBe(0);
  });

  it("margen negativo cuando se vende abajo del costo", () => {
    expect(margenSobreVentaPct(140, 100)).toBe(-40);
  });

  it("devuelve 0 si el precio es 0 o negativo", () => {
    expect(margenSobreVentaPct(100, 0)).toBe(0);
  });

  it("costo 0 da 100% de margen", () => {
    expect(margenSobreVentaPct(0, 200)).toBe(100);
  });
});

describe("precioObjetivoPorMargenNeto", () => {
  it("calcula el precio que deja el margen pedido sobre la venta", () => {
    expect(precioObjetivoPorMargenNeto(100, 50)).toBe(200);
  });

  it("margen 0 devuelve el costo", () => {
    expect(precioObjetivoPorMargenNeto(100, 0)).toBe(100);
  });

  it("es la inversa del remarque: 28,57% sobre venta ≈ remarque 40%", () => {
    expect(precioObjetivoPorMargenNeto(100, 28.57)).toBe(140);
  });

  it("devuelve 0 si el costo es 0 o negativo", () => {
    expect(precioObjetivoPorMargenNeto(0, 30)).toBe(0);
  });

  it("clampa el margen a 99,99% (no divide por cero)", () => {
    expect(precioObjetivoPorMargenNeto(100, 150)).toBe(1_000_000);
  });

  it("clampa márgenes negativos a 0", () => {
    expect(precioObjetivoPorMargenNeto(100, -10)).toBe(100);
  });
});

describe("aplicarBonificacionSobrePrecio", () => {
  it("descuenta el porcentaje sobre el precio", () => {
    expect(aplicarBonificacionSobrePrecio(200, 10)).toBe(180);
  });

  it("bonificación 0 no cambia el precio", () => {
    expect(aplicarBonificacionSobrePrecio(200, 0)).toBe(200);
  });

  it("clampa la bonificación a 100 (precio queda en 0)", () => {
    expect(aplicarBonificacionSobrePrecio(200, 150)).toBe(0);
  });

  it("precio 0 o negativo devuelve 0", () => {
    expect(aplicarBonificacionSobrePrecio(0, 10)).toBe(0);
  });

  it("redondea a centavos", () => {
    // 199.99 × 0.875 = 174.99125 → 174.99
    expect(aplicarBonificacionSobrePrecio(199.99, 12.5)).toBe(174.99);
  });
});
```

- [ ] **Step 2: Correr y verificar verde**

Run: `npx vitest run src/lib/precio-por-margen-neto.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  21 passed (21)`. Si algo falla: el test leyó mal el comportamiento — corregí el TEST contra el código real de `src/lib/precio-por-margen-neto.ts` (no toques la lib) y volvé a correr.

- [ ] **Step 3: Commit**

```bash
git add src/lib/precio-por-margen-neto.test.ts
git commit -m "test(precios): caracterización de precio-por-margen-neto (remarque, margen, bonificación)"
```

---

### Tarea 18: Tests de caracterización de `cashflow-compute.ts`

Misma regla que la Tarea 17: tests de caracterización sobre lógica viva de plata. **Verde esperado; si falla, se corrige el test, no la lib.**

**Files:**
- Test: `src/lib/cashflow-compute.test.ts`
- Referencia (NO modificar): `src/lib/cashflow-compute.ts`

- [ ] **Step 1: Escribir el archivo de test completo**

```ts
import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  eventosProximos14Dias,
  parseNum,
  saldoMixtoEnFecha,
  saldoRealEnFecha,
  semaforoDesdeSaldos,
  serieSaldoLibreta,
  signedMonto,
  todayBuenosAires,
  totalesProyectados,
  totalesReales,
  type CashflowItemRow,
} from "@/lib/cashflow-compute";

let seq = 0;
/** Item de cashflow con defaults razonables; cada test pisa solo lo que le importa. */
function item(partial: Partial<CashflowItemRow>): CashflowItemRow {
  seq += 1;
  return {
    id: `item-${seq}`,
    obra_id: "obra-1",
    tipo: "egreso",
    categoria: "materiales",
    descripcion: "",
    monto_proyectado: 0,
    fecha_proyectada: "2026-01-10",
    monto_real: null,
    fecha_real: null,
    estado: "pendiente",
    notas: "",
    ...partial,
  };
}

describe("todayBuenosAires", () => {
  it("devuelve una fecha ISO yyyy-mm-dd", () => {
    expect(todayBuenosAires()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDaysIso", () => {
  it("suma días cruzando fin de mes y de año", () => {
    expect(addDaysIso("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("resta días con números negativos", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("maneja años bisiestos", () => {
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("parseNum", () => {
  it("parsea números válidos", () => {
    expect(parseNum("12.5")).toBe(12.5);
    expect(parseNum(7)).toBe(7);
  });

  it("devuelve 0 para basura, null, undefined e infinito", () => {
    expect(parseNum("abc")).toBe(0);
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum(Infinity)).toBe(0);
  });
});

describe("signedMonto", () => {
  it("ingreso queda positivo, egreso negativo", () => {
    expect(signedMonto("ingreso", 100)).toBe(100);
    expect(signedMonto("egreso", 100)).toBe(-100);
  });
});

describe("saldoRealEnFecha", () => {
  const items = [
    item({ tipo: "ingreso", monto_real: 1000, fecha_real: "2026-01-05" }),
    item({ tipo: "egreso", monto_real: 400, fecha_real: "2026-01-07" }),
    item({ tipo: "egreso", monto_real: 100, fecha_real: "2026-01-20" }), // posterior al corte
    item({ tipo: "ingreso", monto_real: 0, fecha_real: "2026-01-06" }), // monto 0 se ignora
    item({ tipo: "ingreso", monto_proyectado: 500 }), // sin real: se ignora
  ];

  it("suma solo movimientos reales hasta la fecha, inclusive", () => {
    expect(saldoRealEnFecha(items, "2026-01-10")).toBe(600);
  });

  it("incluye los movimientos del mismo día del corte", () => {
    expect(saldoRealEnFecha(items, "2026-01-06")).toBe(1000);
    expect(saldoRealEnFecha(items, "2026-01-07")).toBe(600);
  });

  it("sin items devuelve 0", () => {
    expect(saldoRealEnFecha([], "2026-01-10")).toBe(0);
  });
});

describe("saldoMixtoEnFecha", () => {
  it("usa el monto real para lo ejecutado y el proyectado para lo pendiente", () => {
    const items = [
      item({
        tipo: "ingreso",
        monto_proyectado: 900,
        fecha_proyectada: "2026-01-04",
        monto_real: 1000,
        fecha_real: "2026-01-05",
      }),
      item({ tipo: "egreso", monto_proyectado: 300, fecha_proyectada: "2026-01-08" }),
    ];
    expect(saldoMixtoEnFecha(items, "2026-01-10")).toBe(700);
  });

  it("si el real cae después del corte, cuenta el proyectado", () => {
    const items = [
      item({
        tipo: "egreso",
        monto_proyectado: 200,
        fecha_proyectada: "2026-01-09",
        monto_real: 50,
        fecha_real: "2026-01-15",
      }),
    ];
    expect(saldoMixtoEnFecha(items, "2026-01-10")).toBe(-200);
  });
});

describe("semaforoDesdeSaldos", () => {
  it("verde si el saldo mixto a 7 días no es negativo", () => {
    expect(semaforoDesdeSaldos(0, -100)).toBe("verde");
  });

  it("amarillo si a 7 días es negativo pero a 30 no", () => {
    expect(semaforoDesdeSaldos(-1, 0)).toBe("amarillo");
  });

  it("rojo si ambos son negativos", () => {
    expect(semaforoDesdeSaldos(-1, -1)).toBe("rojo");
  });
});

describe("totalesProyectados / totalesReales", () => {
  const items = [
    item({ tipo: "ingreso", monto_proyectado: 1000, monto_real: 950, fecha_real: "2026-01-05" }),
    item({ tipo: "ingreso", monto_proyectado: 250.5 }),
    item({ tipo: "egreso", monto_proyectado: 300.25, monto_real: 310, fecha_real: "2026-01-06" }),
    // monto real SIN fecha real: no cuenta como ejecutado
    item({ tipo: "egreso", monto_proyectado: 100, monto_real: 80, fecha_real: null }),
  ];

  it("proyectados suma todo por monto proyectado", () => {
    expect(totalesProyectados(items)).toEqual({
      ingresos: 1250.5,
      egresos: 400.25,
      neto: 850.25,
    });
  });

  it("reales suma solo líneas con monto Y fecha real", () => {
    expect(totalesReales(items)).toEqual({ ingresos: 950, egresos: 310, neto: 640 });
  });
});

describe("serieSaldoLibreta", () => {
  it("acumula por día solo los movimientos reales", () => {
    const items = [item({ tipo: "ingreso", monto_real: 100, fecha_real: "2026-01-02" })];
    expect(serieSaldoLibreta(items, "2026-01-01", "2026-01-03")).toEqual([
      { fecha: "2026-01-01", saldo: 0 },
      { fecha: "2026-01-02", saldo: 100 },
      { fecha: "2026-01-03", saldo: 100 },
    ]);
  });
});

describe("eventosProximos14Dias", () => {
  const meta = new Map([["obra-1", { presupuesto_id: "pres-1", nombreObra: "Casa Pilar" }]]);
  const items = [
    item({ tipo: "ingreso", monto_proyectado: 500, fecha_proyectada: "2026-06-03" }),
    item({
      obra_id: "obra-2",
      tipo: "egreso",
      monto_proyectado: 180,
      fecha_proyectada: "2026-05-20",
      monto_real: 200,
      fecha_real: "2026-06-02",
    }),
    item({ tipo: "egreso", monto_proyectado: 50, fecha_proyectada: "2026-06-20" }), // fuera de los 14 días
    item({
      tipo: "egreso",
      monto_proyectado: 70,
      fecha_proyectada: "2026-05-28",
      monto_real: 70,
      fecha_real: "2026-05-30",
    }), // en el pasado
  ];

  it("filtra a [hoy, hoy+14], ordena por fecha y distingue real de proyectado", () => {
    const out = eventosProximos14Dias(items, meta, "2026-06-01");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      obra_id: "obra-2",
      nombreObra: "Obra", // obra sin meta → fallback
      presupuesto_id: null,
      fechaReferencia: "2026-06-02",
      montoMostrado: 200, // muestra el real, no el proyectado
      esProyectado: false,
    });
    expect(out[1]).toMatchObject({
      obra_id: "obra-1",
      nombreObra: "Casa Pilar",
      presupuesto_id: "pres-1",
      fechaReferencia: "2026-06-03",
      montoMostrado: 500,
      esProyectado: true,
    });
  });
});
```

- [ ] **Step 2: Correr y verificar verde**

Run: `npx vitest run src/lib/cashflow-compute.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  19 passed (19)`. Si algo falla: corregí el TEST contra el comportamiento real de `src/lib/cashflow-compute.ts` — la lib no se toca.

- [ ] **Step 3: Correr la suite completa**

Run: `npm test`
Expected: `Test Files  3 passed (3)` (zona-slug + precio-por-margen-neto + cashflow-compute), 0 failed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/cashflow-compute.test.ts
git commit -m "test(cashflow): caracterización de cashflow-compute (saldos, semáforo, totales, próximos 14 días)"
```

---

### Tarea 19: Verificación de variables de entorno en Railway

El explorador local nunca pudo confirmar qué variables tiene el bot deployado (spec §5). Acá se verifica con la CLI, sin imprimir secretos en pantalla.

**Files:** ninguno (verificación operativa).

- [ ] **Step 1: Login y link**

```bash
railway whoami || railway login
cd /Users/ezeotero/Documents/ravn-bots
railway status
```

Expected: `railway status` muestra Project / Environment / Service del bot. Si dice que no hay proyecto linkeado: `railway link` (interactivo) → elegir el proyecto del bot (ravn-bots) y su servicio.

- [ ] **Step 2: Verificar presencia de las 6 variables (solo nombres, sin valores)**

```bash
railway variables --kv > /tmp/railway-vars.txt
for v in GITHUB_TOKEN SUPABASE_URL SUPABASE_ANON_KEY BOT_EMAIL BOT_PASSWORD GEMINI_API_KEY; do
  grep -q "^$v=" /tmp/railway-vars.txt && echo "OK     $v" || echo "FALTA  $v"
done
```

Expected: 6 líneas `OK`. Por cada `FALTA`, setearla con el valor correcto (tomado del dashboard del servicio que corresponda o del .env local del bot):

```bash
railway variables --set "NOMBRE_VAR=valor"   # dispara redeploy automático
```

Alternativa por dashboard: railway.app → proyecto del bot → servicio → pestaña **Variables**.

- [ ] **Step 3: Verificar que el bot apunta a la MISMA Supabase que la app**

```bash
APP_URL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' /Users/ezeotero/Documents/ravn/.env.local | cut -d= -f2-)
BOT_URL=$(grep '^SUPABASE_URL=' /tmp/railway-vars.txt | cut -d= -f2-)
[ "$APP_URL" = "$BOT_URL" ] && echo "OK: misma Supabase" || echo "ERROR: bases distintas — app=$APP_URL bot=$BOT_URL"
```

Expected: `OK: misma Supabase`. Si difieren, el principio "una sola base" del Centro de Mando está roto: frenar y avisarle a Eze antes de tocar nada.

- [ ] **Step 4: Verificar que los tokens están vivos (sin imprimirlos)**

```bash
GH_TOKEN=$(grep '^GITHUB_TOKEN=' /tmp/railway-vars.txt | cut -d= -f2-)
curl -s -o /dev/null -w 'github: %{http_code}\n' \
  -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user

GK=$(grep '^GEMINI_API_KEY=' /tmp/railway-vars.txt | cut -d= -f2-)
curl -s -o /dev/null -w 'gemini: %{http_code}\n' \
  "https://generativelanguage.googleapis.com/v1beta/models?key=$GK"
```

Expected: `github: 200` y `gemini: 200`. Un `401`/`403` = token vencido o revocado → regenerarlo (GitHub: Settings → Developer settings → Tokens; Gemini: AI Studio → API keys) y actualizarlo con `railway variables --set`.

- [ ] **Step 5: Limpiar**

```bash
rm /tmp/railway-vars.txt
```

No hay commit: tarea de verificación operativa. Reportar el resultado (qué estaba, qué faltó, qué se corrigió) en el resumen de ejecución.

---

## Autorrevisión contra el spec (hecha al escribir el plan)

- §9 migración versionada `gastos_personales` → Tarea 3 (con contraste contra prod en Tarea 1).
- §9 auditoría/endurecimiento RLS + usuario dedicado del bot → Tareas 2–4, 6–15, con la **matriz de la enmienda RLS definitiva 2026-06-11**: bot con update en `eventos`/`trabajos_cola`/`tareas`, delete en `tareas`/`gastos_personales`, select en `presupuestos` y tablas de negocio pre-existentes, select+update en `cotizaciones`, insert en `cotizador_lecciones` e insert en el bucket Storage `referencias`. La Tarea 15 prueba la matriz completa end-to-end logueada como el bot, incluyendo el caso `obras select 200 / insert 403`.
- Contrato: 6 tablas nuevas + bucket → Tareas 6–12 (SQL textual del contrato, estados y checks idénticos).
- RLS completa: tablas de negocio pre-existentes sin RLS → Tarea 13 migración `20260612114000`; `maestro_precios_*` con anon abierta → Tarea 13 migración `20260612115000`.
- §9 Vitest con tests en lógica de plata → Tareas 16–18. Vitest se instala desde cero en Step 1 de la Tarea 16 (no hay copia previa funcional).
- §5 verificación de variables Railway → Tarea 19.
- Colisión `recetas` (no prevista en el contrato) → Tarea 5, decisión documentada en el Contexto ("COLISIÓN CRÍTICA detectada"). Los 6 embeds PostgREST con join `recetas ( ... )` sobre `presupuestos_items` también se corrigen con alias `recetas:catalogo_recetas ( ... )` en `propuesta-screen.tsx`, `nuevo-presupuesto.tsx` y `planificar-preview/route.ts`.
