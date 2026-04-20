-- Maestro de precios: ítems por m² + gestión (singleton). Idempotente.

create table if not exists public.maestro_precios_items (
  id uuid primary key default gen_random_uuid(),
  nombre_trabajo text not null default '',
  costo_mo_m2 numeric(14, 2) not null default 0 check (costo_mo_m2 >= 0),
  costo_materiales_m2 numeric(14, 2) not null default 0 check (costo_materiales_m2 >= 0),
  ganancia_pct numeric(8, 2) not null default 0 check (ganancia_pct >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maestro_precios_items
  add column if not exists ganancia_monto_m2 numeric(14, 2) not null default 0
  check (ganancia_monto_m2 >= 0);

create index if not exists maestro_precios_items_sort_idx
  on public.maestro_precios_items (sort_order, created_at);

update public.maestro_precios_items i
set ganancia_monto_m2 = round(
  (coalesce(i.costo_mo_m2, 0) + coalesce(i.costo_materiales_m2, 0))
    * (coalesce(i.ganancia_pct, 0) / 100.0),
  2
)
where
  coalesce(i.costo_mo_m2, 0) + coalesce(i.costo_materiales_m2, 0) > 0
  and coalesce(i.ganancia_pct, 0) <> 0
  and coalesce(i.ganancia_monto_m2, 0) = 0;

create table if not exists public.maestro_precios_gestion (
  id smallint primary key default 1 check (id = 1),
  ganancia_mensual_estimada_ars numeric(14, 2) not null default 0
    check (ganancia_mensual_estimada_ars >= 0),
  dias_laborables_mes smallint not null default 22
    check (dias_laborables_mes > 0 and dias_laborables_mes <= 31),
  updated_at timestamptz not null default now()
);

insert into public.maestro_precios_gestion (id, ganancia_mensual_estimada_ars, dias_laborables_mes)
values (1, 0, 22)
on conflict (id) do nothing;

alter table public.maestro_precios_items enable row level security;
alter table public.maestro_precios_gestion enable row level security;

drop policy if exists "maestro_precios_items_all" on public.maestro_precios_items;
create policy "maestro_precios_items_all"
  on public.maestro_precios_items for all using (true) with check (true);

drop policy if exists "maestro_precios_gestion_all" on public.maestro_precios_gestion;
create policy "maestro_precios_gestion_all"
  on public.maestro_precios_gestion for all using (true) with check (true);

grant select, insert, update, delete on public.maestro_precios_items to anon, authenticated, service_role;
grant select, insert, update, delete on public.maestro_precios_gestion to anon, authenticated, service_role;
