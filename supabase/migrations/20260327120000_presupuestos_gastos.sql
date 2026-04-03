-- Registro de gastos reales de obra por presupuesto (panel de ejecución).
create table if not exists public.presupuestos_gastos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos (id) on delete cascade,
  fecha date not null default (current_date),
  rubro_id text null,
  descripcion text not null default '',
  importe numeric(14, 2) not null default 0 check (importe >= 0),
  created_at timestamptz not null default now()
);

create index if not exists presupuestos_gastos_presupuesto_id_idx
  on public.presupuestos_gastos (presupuesto_id);

create index if not exists presupuestos_gastos_fecha_idx
  on public.presupuestos_gastos (fecha desc);

comment on table public.presupuestos_gastos is
  'Gastos cargados en obra; rubro_id referencia rubros.id como texto (misma convención que la app).';
