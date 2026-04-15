-- Cierre de obra y resumen persistido
alter table public.obras
  add column if not exists finalizada_at timestamptz null;

comment on column public.obras.finalizada_at is
  'Si no null, la obra está finalizada; se muestra resumen de cierre cashflow.';

create table if not exists public.cashflow_cierres_obra (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  presupuesto_id uuid not null references public.presupuestos (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cashflow_cierres_obra_obra_id_idx
  on public.cashflow_cierres_obra (obra_id);

comment on table public.cashflow_cierres_obra is
  'Snapshot del resumen al finalizar obra (presupuestado vs real, margen).';

-- Categoría cuota final (ingreso)
alter table public.cashflow_items drop constraint if exists cashflow_items_categoria_check;

alter table public.cashflow_items
  add constraint cashflow_items_categoria_check check (
    categoria in (
      'anticipo',
      'cuota_avance',
      'cuota_final',
      'material',
      'mano_de_obra',
      'subcontrato',
      'gasto_fijo',
      'otro'
    )
  );
