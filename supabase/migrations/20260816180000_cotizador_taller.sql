-- Taller del cotizador — lo que Eze arma ANTES de que exista el número.
--
-- Decisión 16/08/2026: el Cotizador es app aparte pero comparte la base de App
-- RAVN, con TABLAS PROPIAS. El límite es por momento del laburo: el taller
-- (probar, tachar, volver atrás) vive acá; la oficina (documento, plata, obra)
-- sigue en las tablas de la app. Ver
-- vault/Decisiones/2026-08-16-cotizador-app-aparte-base-compartida.md
--
-- Estas dos tablas reemplazan el localStorage del visor (qz:manual, qz:decidido).
-- NINGUNA toca plata ni estado: no hay pata en movimientos_plata que asentar.
-- El total del motor sigue viviendo en cotizaciones; el agregado a mano se suma
-- SIEMPRE aparte, para no contaminar el rango que cerró la receta.

create table if not exists public.cotizador_taller_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  rubro_id text not null,
  nombre text not null,
  tipo text not null check (tipo in ('material', 'mano_de_obra')),
  cantidad numeric not null check (cantidad > 0),
  unidad text not null,
  precio_unit numeric not null check (precio_unit >= 0),
  creado_at timestamptz not null default now()
);

comment on table public.cotizador_taller_items is
  'Ítems que Eze agrega a mano en el visor del cotizador. Se suman aparte del rango del motor.';

create index if not exists cotizador_taller_items_cotizacion_idx
  on public.cotizador_taller_items (cotizacion_id, creado_at);

-- Una decisión por ítem de la cola: qué precio eligió y cuándo. Reabrir = borrar
-- la fila, así el ítem vuelve a la cola sin dejar estado fantasma.
create table if not exists public.cotizador_taller_decisiones (
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  item_key text not null,
  origen text not null,
  valor numeric,
  decidido_at timestamptz not null default now(),
  primary key (cotizacion_id, item_key)
);

comment on table public.cotizador_taller_decisiones is
  'Decisión de precio tomada desde la tarjeta del visor. item_key = "<rubro_id>:<nombre del ítem>".';

alter table public.cotizador_taller_items enable row level security;
alter table public.cotizador_taller_decisiones enable row level security;

-- Mismo criterio que cotizador_lecciones: autenticado sí, bot no. El Cotizador
-- standalone escribe con service role desde sus rutas, detrás de su basic auth.
create policy "taller_items_select_no_bot" on public.cotizador_taller_items
  for select to authenticated using (not es_bot());
create policy "taller_items_insert_auth" on public.cotizador_taller_items
  for insert to authenticated with check (true);
create policy "taller_items_update_no_bot" on public.cotizador_taller_items
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy "taller_items_delete_no_bot" on public.cotizador_taller_items
  for delete to authenticated using (not es_bot());

create policy "taller_decisiones_select_no_bot" on public.cotizador_taller_decisiones
  for select to authenticated using (not es_bot());
create policy "taller_decisiones_insert_auth" on public.cotizador_taller_decisiones
  for insert to authenticated with check (true);
create policy "taller_decisiones_update_no_bot" on public.cotizador_taller_decisiones
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy "taller_decisiones_delete_no_bot" on public.cotizador_taller_decisiones
  for delete to authenticated using (not es_bot());
