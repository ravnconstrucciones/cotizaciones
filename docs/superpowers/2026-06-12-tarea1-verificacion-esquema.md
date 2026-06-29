# Tarea 1 — Verificación de esquema de producción
> Generado: 2026-06-12 | Branch: frente-a-cimientos

## Acceso usado
- `supabase db query --linked` (Management API) — sin Docker, sin dump pg_dump
- Read-only: cero DDL/DML ejecutado

---

## Step 2: Columnas reales de `gastos_personales`

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| fecha | date | **NO** | **CURRENT_DATE** |
| concepto | text | NO | — |
| monto | numeric | **NO** | — |
| categoria | text | NO | 'Varios'::text |
| origen | text | YES | 'whatsapp'::text |
| created_at | timestamp with time zone | YES | now() |

### Diferencias vs plan (Tarea 3):

| Columna | Plan asume | Realidad prod |
|---|---|---|
| `fecha` | `is_nullable: YES`, default `(current_date)` | **NOT NULL**, default `CURRENT_DATE` |
| `monto` | `is_nullable: YES` (comentario: "el bot inserta monto || null") | **NOT NULL** |
| `origen` | `not null default 'app'` | **NULLABLE**, default `'whatsapp'::text` |
| `created_at` | `not null` | **NULLABLE** |

**IMPACTO EN TAREA 3:** El `create table if not exists` no cambia la tabla existente (no-op en prod), pero la migración versionada debe reflejar la realidad. El comentario en el SQL de la Tarea 3 dice "nullable: el bot inserta monto || null" — eso es INCORRECTO: en producción `monto` es NOT NULL. Igualmente `fecha` es NOT NULL. El SQL de la Tarea 3 debe corregir:
- `monto numeric(14, 2),` → `monto numeric(14, 2) not null,`
- `fecha date default (current_date),` → `fecha date not null default current_date,`
- `origen text not null default 'app',` → `origen text default 'whatsapp',` (nullable, default whatsapp)
- `created_at timestamptz not null default now()` → `created_at timestamptz default now(),` (nullable)

También: no hay índices secundarios en prod (`gastos_personales_fecha_idx`, `gastos_personales_created_idx` NO existen). El `create index if not exists` de la migración los creará, lo que está bien y es mejora.

---

## Step 3: RLS y policies existentes

### Estado RLS por tabla:

| Tabla | RLS activo | Comentario |
|---|---|---|
| gastos_personales | **true** | Con 2 policies (ver abajo) |
| tareas | **true** | Con 1 policy "tareas auth full" |
| presupuestos_gastos | false | Sin RLS — esperado |
| presupuestos | false | Sin RLS — esperado |
| recetas | false | Sin RLS — esperado (catálogo, colisión confirmada) |
| obras | false | Sin RLS — esperado |
| cashflow_items | false | Sin RLS |
| cashflow_cierres_obra | false | Sin RLS |
| presupuestos_items | false | Sin RLS |
| rubros | false | Sin RLS |
| maestro_precios_items | **true** | Con policy "for all" a {public} |
| maestro_precios_gestion | **true** | Con policy "for all" a {public} |
| cotizaciones_cola | **true** | Con 3 policies propias (user_id-scoped) |
| detalles_presupuesto | false | Sin RLS |

### Policies existentes (completo):

**cotizaciones_cola:**
- `cola insert propia` — INSERT, {authenticated}, with_check: `auth.uid() = user_id`
- `cola select propia` — SELECT, {authenticated}, qual: `auth.uid() = user_id`
- `cola update propia` — UPDATE, {authenticated}, dual uid=user_id check

**gastos_personales:**
- `app puede leer` — SELECT, {authenticated}, using: `true`
- `bot puede insertar` — INSERT, {authenticated}, with_check: `true`
- (sin policy de UPDATE ni DELETE)

**maestro_precios_gestion / maestro_precios_items:**
- `maestro_precios_gestion_all` / `maestro_precios_items_all` — ALL, roles: `{public}` (= anon+authenticated), using: `true`, with_check: `true`

**tareas:**
- `tareas auth full` — ALL, {authenticated}, using: `true`, with_check: `true`

### IMPACTO EN TAREA 3 (gastos_personales):
El `do $$ ... loop` que barre policies funcionará bien. Las 2 policies actuales serán removidas y reemplazadas por las 4 del contrato. Sin surpresas.

### IMPACTO EN TAREA 4 (tareas):
La policy `tareas auth full` será barrida y reemplazada por las 4 granulares del contrato. Sin surpresas.

### IMPACTO EN TAREA 13:
- **inmobiliario_*** — CRÍTICO: ver sección dedicada abajo.
- **maestro_precios_***: las policies actuales son `"maestro_precios_items_all"` y `"maestro_precios_gestion_all"` (roles `{public}`). La migración 20260612115000 hace `drop policy if exists "maestro_precios_items_all"` y `drop policy if exists "maestro_precios_gestion_all"` — los nombres coinciden exactamente. Correcto.
- **presupuestos, presupuestos_gastos**: sin policies previas, el loop de drop no hará nada. Correcto.

---

## Step 4: Nombres nuevos del contrato — verificación de colisión

```
eventos          → libre (0 filas)
trabajos_cola    → libre
cotizaciones     → libre
cotizador_lecciones → libre
referencias      → libre
seguridad_config → libre
catalogo_recetas → libre
```

**Resultado: 0 filas — todos los nombres nuevos están libres.**

```
recetas → 512 filas (ítems del catálogo)
```

**Colisión de `recetas` confirmada** — exactamente como anticipa el plan. La Tarea 5 debe correr antes de la Tarea 8.

---

## CRITICO: `inmobiliario_*` NO EXISTE EN PRODUCCIÓN

La migración `20260522120000_inmobiliario_schema.sql` está en el repo pero **NO fue aplicada en producción** (las 4 tablas `inmobiliario_zonas`, `inmobiliario_avisos_snapshot`, `inmobiliario_precios_zona_periodo`, `inmobiliario_noticias` no aparecen en ningún listado de tablas).

**IMPACTO EN TAREA 13 (migración 20260612112000_inmobiliario_rls.sql):** El SQL hace `drop policy if exists` + `create policy` + `revoke all from anon` sobre esas 4 tablas. Si las tablas no existen, el `drop policy if exists` y el `revoke` son no-op, pero el `create policy` fallará con "relation does not exist".

**Opciones para el ejecutor de la Tarea 13:**
1. Envolver cada bloque de inmobiliario en `DO $$ BEGIN IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='inmobiliario_zonas') THEN ... END IF; END $$;`
2. Omitir la migración inmobiliario_rls y agregar una nota de que se aplicará cuando se aplique la 20260522120000.
3. Fusionar ambas migraciones (inmobiliario_schema + inmobiliario_rls) en una sola.

**Recomendación:** opción 1 (guards condicionales) — mantiene la idempotencia sin cambiar la estructura del plan.

---

## Tabla extra encontrada: `gastos_reales`

Existe en producción pero no figura en ninguna tarea del plan. Es una tabla legacy (bigint ids, sin uuid, sin RLS). No interfiere con ninguna tarea del frente A.

---

## Tabla `cotizaciones_cola`

Existe en producción con RLS activo y 3 policies user_id-scoped. NO es la misma que `cotizaciones` (tabla nueva del contrato). No interfiere. El nombre `cotizaciones` está libre.

---

## Resumen de diffs para los ejecutores

### Para Tarea 3 (`gastos_personales`):
Corregir en el `create table`:
- `monto` → NOT NULL (sin default)
- `fecha` → NOT NULL, default `current_date`
- `origen` → nullable, default `'whatsapp'` (no `'app'`)
- `created_at` → nullable (sin `not null`)

### Para Tarea 4 (`tareas`):
Sin diferencias. El esquema real coincide exactamente con lo que el plan asume. Trigger `tareas_set_updated_at` ya existe. Las migraciones con `create table if not exists` + `create or replace function` + `drop trigger if exists` / `create trigger` son idempotentes.

### Para Tarea 13:
- `inmobiliario_*`: las 4 tablas NO EXISTEN en prod — el SQL de inmobiliario_rls fallará. Corregir con guards condicionales.
- `maestro_precios_*`: policy names coinciden, `revoke all from anon` correcto (anon tiene grants activos).
- `gastos_personales` grants: `anon` tiene grants completos (no solo `authenticated`). La migración hace `revoke all from anon` en T3 — correcto.
- `tareas` grants: igual que gastos_personales, `anon` tiene grants. La migración hace `revoke all from anon` en T4 — correcto.
