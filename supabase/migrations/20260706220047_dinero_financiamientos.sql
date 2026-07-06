-- financiamientos: LIBRO DE DEUDAS entre dueños (spec 2026-07-06). Se crea en
-- la MISMA confirmación que el gasto cruzado ("gasto de Glorietas pagado con
-- bolsillo Pueyrredón → financiamiento Glorietas←Pueyrredón $450k"). La
-- devolución es manual (operación financiamiento_devolucion en el ledger que
-- baja saldo_pendiente); al cierre de la obra lo abierto se netea → absorbido
-- (queda asentado, no desaparece). El tablero muestra la deuda SIEMPRE.

create table public.financiamientos (
  id uuid primary key default gen_random_uuid(),
  deudor_tipo text not null check (deudor_tipo in ('obra', 'empresa', 'personal')),
  deudor_obra_id uuid references public.presupuestos (id),
  acreedor_tipo text not null check (acreedor_tipo in ('obra', 'empresa', 'personal')),
  acreedor_obra_id uuid references public.presupuestos (id),
  monto_original numeric not null check (monto_original > 0),
  saldo_pendiente numeric not null check (saldo_pendiente >= 0),
  moneda text not null check (moneda in ('ARS', 'USD')),
  estado text not null default 'abierto' check (estado in ('abierto', 'devuelto', 'absorbido')),
  -- La operación del ledger que lo creó (grupo entero, no una pata).
  origen_grupo_id uuid not null,
  notas text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financiamientos_deudor_obra_coherente
    check ((deudor_tipo = 'obra') = (deudor_obra_id is not null)),
  constraint financiamientos_acreedor_obra_coherente
    check ((acreedor_tipo = 'obra') = (acreedor_obra_id is not null)),
  constraint financiamientos_pendiente_max
    check (saldo_pendiente <= monto_original)
);

comment on table public.financiamientos is
  'Libro de deudas entre dueños (obra/RAVN/Eze). Nace con el gasto cruzado; devolución manual vía ledger; al cierre de obra lo abierto pasa a absorbido.';

create index financiamientos_deudor_idx
  on public.financiamientos (deudor_tipo, deudor_obra_id) where estado = 'abierto';
create index financiamientos_acreedor_idx
  on public.financiamientos (acreedor_tipo, acreedor_obra_id) where estado = 'abierto';

alter table public.financiamientos enable row level security;

create policy financiamientos_select_auth on public.financiamientos
  for select to authenticated using (true);
create policy financiamientos_insert_auth on public.financiamientos
  for insert to authenticated with check (true);
create policy financiamientos_update_no_bot on public.financiamientos
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy financiamientos_delete_no_bot on public.financiamientos
  for delete to authenticated using (not es_bot());
