-- Vincula cada fila de gasto de obra con el egreso equivalente en Caja (un solo movimiento real).
alter table public.presupuestos_gastos
  add column if not exists cashflow_item_id uuid null references public.cashflow_items (id) on delete set null;

create unique index if not exists presupuestos_gastos_cashflow_item_id_key
  on public.presupuestos_gastos (cashflow_item_id)
  where cashflow_item_id is not null;

comment on column public.presupuestos_gastos.cashflow_item_id is
  'Egreso en cashflow_items generado al guardar este gasto (misma obra; evita duplicar en totales).';
