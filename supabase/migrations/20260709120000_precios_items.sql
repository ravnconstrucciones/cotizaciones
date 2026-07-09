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
