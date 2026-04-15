-- Obras 1:1 con presupuestos (cada presupuesto tiene una fila obra para cashflow y extensiones).
create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null unique references public.presupuestos (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists obras_presupuesto_id_idx on public.obras (presupuesto_id);

comment on table public.obras is
  'Obra de ejecución vinculada al presupuesto; usada por cashflow_items.obra_id.';

-- Movimientos de caja proyectados y reales (no se pisan).
create table if not exists public.cashflow_items (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  tipo text not null check (tipo in ('ingreso', 'egreso')),
  categoria text not null check (
    categoria in (
      'anticipo',
      'cuota_avance',
      'material',
      'mano_de_obra',
      'subcontrato',
      'gasto_fijo',
      'otro'
    )
  ),
  descripcion text not null default '',
  monto_proyectado numeric(14, 2) not null check (monto_proyectado >= 0),
  fecha_proyectada date not null,
  monto_real numeric(14, 2) null check (monto_real is null or monto_real >= 0),
  fecha_real date null,
  estado text not null default 'pendiente' check (
    estado in ('pendiente', 'cobrado', 'pagado', 'vencido')
  ),
  notas text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cashflow_items_obra_id_idx on public.cashflow_items (obra_id);
create index if not exists cashflow_items_fecha_proyectada_idx
  on public.cashflow_items (fecha_proyectada);
create index if not exists cashflow_items_fecha_real_idx on public.cashflow_items (fecha_real);

comment on table public.cashflow_items is
  'Ingresos y egresos de caja por obra; montos y fechas proyectadas vs reales.';

-- updated_at en obras y cashflow_items
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists obras_set_updated_at on public.obras;
create trigger obras_set_updated_at
  before update on public.obras
  for each row execute function public.set_updated_at();

drop trigger if exists cashflow_items_set_updated_at on public.cashflow_items;
create trigger cashflow_items_set_updated_at
  before update on public.cashflow_items
  for each row execute function public.set_updated_at();

-- Una obra por cada presupuesto existente y futuros inserts.
insert into public.obras (presupuesto_id)
select p.id from public.presupuestos p
where not exists (
  select 1 from public.obras o where o.presupuesto_id = p.id
);

create or replace function public.presupuestos_after_insert_obra()
returns trigger
language plpgsql
as $$
begin
  insert into public.obras (presupuesto_id) values (new.id)
  on conflict (presupuesto_id) do nothing;
  return new;
end;
$$;

drop trigger if exists presupuestos_after_insert_obra on public.presupuestos;
create trigger presupuestos_after_insert_obra
  after insert on public.presupuestos
  for each row execute function public.presupuestos_after_insert_obra();

-- Datos de prueba (una sola vez por base: notas = 'RAVN_SEED_CASHFLOW').
insert into public.cashflow_items (
  obra_id,
  tipo,
  categoria,
  descripcion,
  monto_proyectado,
  fecha_proyectada,
  monto_real,
  fecha_real,
  estado,
  notas
)
with
obra_a as (
  select o.id as obra_id
  from public.obras o
  join public.presupuestos p on p.id = o.presupuesto_id
  order by p.created_at desc nulls last
  limit 1
),
obra_b as (
  select o.id as obra_id
  from public.obras o
  join public.presupuestos p on p.id = o.presupuesto_id
  order by p.created_at desc nulls last
  offset 1
  limit 1
),
seed_rows (
  obra_idx,
  tipo,
  categoria,
  descripcion,
  monto_proyectado,
  fecha_proyectada,
  monto_real,
  fecha_real,
  estado
) as (
  values
    (1, 'ingreso', 'anticipo', 'Anticipo — demo', 4500000::numeric,
     (current_date - 14), 4500000::numeric, (current_date - 14), 'cobrado'),
    (1, 'egreso', 'material', 'Ladrillos — demo', 1200000::numeric,
     (current_date - 5), 1185000::numeric, (current_date - 5), 'pagado'),
    (1, 'ingreso', 'cuota_avance', 'Cuota avance 1', 2000000::numeric,
     (current_date + 3), null::numeric, null::date, 'pendiente'),
    (1, 'egreso', 'mano_de_obra', 'Jornal semana', 800000::numeric,
     (current_date + 5), null::numeric, null::date, 'pendiente'),
    (2, 'ingreso', 'anticipo', 'Anticipo obra B', 3000000::numeric,
     (current_date - 30), null::numeric, null::date, 'vencido'),
    (2, 'egreso', 'gasto_fijo', 'Seguros / servicios', 350000::numeric,
     (current_date + 2), null::numeric, null::date, 'pendiente')
)
select
  case s.obra_idx when 1 then a.obra_id else b.obra_id end,
  s.tipo,
  s.categoria,
  s.descripcion,
  s.monto_proyectado,
  s.fecha_proyectada,
  s.monto_real,
  s.fecha_real,
  s.estado,
  'RAVN_SEED_CASHFLOW'
from seed_rows s
cross join obra_a a
left join obra_b b on true
where not exists (select 1 from public.cashflow_items where notas = 'RAVN_SEED_CASHFLOW')
  and a.obra_id is not null
  and (s.obra_idx = 1 or b.obra_id is not null);
