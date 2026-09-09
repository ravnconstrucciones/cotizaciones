-- La identidad del destinatario no exige inventar un acuerdo de trabajo.
create table public.mo_operarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(btrim(nombre)) > 0),
  aliases text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.mo_operarios enable row level security;
revoke all on public.mo_operarios from anon, authenticated;
grant all on public.mo_operarios to service_role;
alter table public.presupuestos_gastos
  add column operario_id uuid references public.mo_operarios(id);
create index presupuestos_gastos_operario_id_idx
  on public.presupuestos_gastos(operario_id) where operario_id is not null;
comment on column public.presupuestos_gastos.operario_id is
  'Destinatario confirmado del pago; no altera importe, cuenta, acuerdo ni clasifica por sí solo el concepto como mano de obra.';
