-- Anulación lógica de movimientos de caja (restaurables)
alter table public.cashflow_items
  add column if not exists deleted_at timestamptz null;

comment on column public.cashflow_items.deleted_at is
  'Si no null, el movimiento no entra en saldos; se puede restaurar poniendo null.';

create index if not exists cashflow_items_deleted_at_idx
  on public.cashflow_items (deleted_at)
  where deleted_at is not null;
