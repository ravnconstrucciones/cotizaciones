-- presupuestos_gastos: habilitar RLS (contrato Centro de Mando: Eze total, bot insert/select).
-- La app la usa con el browser logueado (gastos-screen, control-gastos-screen → authenticated)
-- y con service_role en API routes (bypass) → esto no rompe nada de la app.

alter table public.presupuestos_gastos enable row level security;
revoke all on public.presupuestos_gastos from anon;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'presupuestos_gastos'
  loop
    execute format('drop policy if exists %I on public.presupuestos_gastos', p.policyname);
  end loop;
end $$;

create policy "presupuestos_gastos_select_auth" on public.presupuestos_gastos
  for select to authenticated using (true);

create policy "presupuestos_gastos_insert_auth" on public.presupuestos_gastos
  for insert to authenticated with check (true);

create policy "presupuestos_gastos_update_no_bot" on public.presupuestos_gastos
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

create policy "presupuestos_gastos_delete_no_bot" on public.presupuestos_gastos
  for delete to authenticated
  using (not public.es_bot());
