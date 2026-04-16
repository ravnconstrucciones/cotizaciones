-- Comprobante opcional (foto/audio) en movimientos de libreta (cashflow_items).

alter table public.cashflow_items
  add column if not exists adjunto_path text null;

alter table public.cashflow_items
  add column if not exists adjunto_kind text null;

alter table public.cashflow_items
  drop constraint if exists cashflow_items_adjunto_kind_chk;

alter table public.cashflow_items
  add constraint cashflow_items_adjunto_kind_chk
  check (adjunto_kind is null or adjunto_kind in ('foto', 'audio'));

comment on column public.cashflow_items.adjunto_path is
  'Ruta en bucket storage (p.ej. gastos-obra/cashflow/...).';

comment on column public.cashflow_items.adjunto_kind is
  'foto o audio, si hay comprobante adjunto.';
