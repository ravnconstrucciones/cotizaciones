-- Medición ejecutada independiente de cantidades y precios presupuestados.
create table public.obra_rubro_mediciones (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  rubro_id text not null check (rubro_id ~ '^[0-9]+$'),
  cantidad numeric(14,4) not null check (cantidad > 0),
  unidad text not null check (unidad in ('m2','m','u','jornal','global')),
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  updated_at timestamptz not null default now(),
  unique (presupuesto_id, rubro_id)
);
alter table public.obra_rubro_mediciones enable row level security;
-- Sólo los endpoints autenticados de la app acceden mediante el servidor.
revoke all on public.obra_rubro_mediciones from anon, authenticated;
grant all on public.obra_rubro_mediciones to service_role;
comment on table public.obra_rubro_mediciones is 'Cantidades ejecutadas confirmadas por rubro. Los costos se calculan desde gastos, no se duplican.';
