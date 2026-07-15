-- Módulo Mano de Obra (spec 2026-07-14): acuerdos por obra. El saldo NUNCA se
-- guarda — se deriva de presupuestos_gastos.mo_acuerdo_id (un pago ES un gasto
-- de obra común, una sola fila de plata). Alta/edición SOLO app: el bot lee
-- acuerdos y vincula pagos, nada más (mismo criterio que financiamientos).
create table public.mo_acuerdos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  persona text,
  trabajo text not null,
  monto_arreglado numeric not null check (monto_arreglado >= 0),
  moneda text not null default 'ARS' check (moneda in ('ARS','USD')),
  estado text not null default 'abierto' check (estado in ('abierto','saldado')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.mo_acuerdos is
  'Acuerdos de mano de obra por obra (persona opcional + trabajo + monto arreglado). Saldo = arreglado − suma de presupuestos_gastos con mo_acuerdo_id. Alta solo app; bot solo lee.';

create index mo_acuerdos_presupuesto_idx on public.mo_acuerdos (presupuesto_id);

alter table public.mo_acuerdos enable row level security;
create policy mo_acuerdos_select_auth on public.mo_acuerdos
  for select to authenticated using (true);
create policy mo_acuerdos_insert_no_bot on public.mo_acuerdos
  for insert to authenticated with check (not es_bot());
create policy mo_acuerdos_update_no_bot on public.mo_acuerdos
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy mo_acuerdos_delete_no_bot on public.mo_acuerdos
  for delete to authenticated using (not es_bot());

-- El pago apunta al acuerdo. FK SIN cascade a propósito: borrar un acuerdo
-- con pagos vinculados debe FALLAR (spec: se salda o se desvincula primero).
alter table public.presupuestos_gastos
  add column mo_acuerdo_id uuid references public.mo_acuerdos(id);
create index presupuestos_gastos_mo_acuerdo_idx
  on public.presupuestos_gastos (mo_acuerdo_id) where mo_acuerdo_id is not null;
