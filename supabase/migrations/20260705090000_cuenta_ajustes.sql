-- cuenta_ajustes: ARQUEOS de cuenta (05/07). Eze le dice al bot cuánto hay DE
-- VERDAD en una cuenta ("en MP hay $67.725"); el delta contra el saldo
-- derivado queda acá como movimiento de ajuste y los dos motores de saldos
-- (app src/lib/cuentas.ts y bot src/saldos.js) lo suman. Queda historial:
-- cuándo y cuánto se desvió cada cuenta. El código suma; la IA no.

create table public.cuenta_ajustes (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id),
  fecha date not null default current_date,
  -- Lo que Eze declaró que había (en la MONEDA de la cuenta) y el delta que
  -- hubo que sumar para llegar ahí (declarado - derivado al momento del
  -- arqueo). Se guardan los dos: el delta es lo que suma el motor, el
  -- declarado es la foto auditable del arqueo.
  saldo_declarado numeric not null,
  delta numeric not null,
  nota text not null default '',
  created_at timestamptz not null default now()
);

comment on table public.cuenta_ajustes is
  'Arqueos de cuenta: saldo declarado por Eze vs derivado; el delta entra al motor de saldos como un movimiento más. Insertan el bot y la app; editar/borrar solo la app.';

alter table public.cuenta_ajustes enable row level security;

-- Espejo de transferencias: leer e insertar cualquiera autenticado (el bot
-- registra arqueos); editar/borrar solo desde la app (no el bot).
create policy cuenta_ajustes_select_auth on public.cuenta_ajustes
  for select to authenticated using (true);
create policy cuenta_ajustes_insert_auth on public.cuenta_ajustes
  for insert to authenticated with check (true);
create policy cuenta_ajustes_update_no_bot on public.cuenta_ajustes
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy cuenta_ajustes_delete_no_bot on public.cuenta_ajustes
  for delete to authenticated using (not es_bot());
