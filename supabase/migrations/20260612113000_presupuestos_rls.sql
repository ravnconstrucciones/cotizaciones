-- presupuestos: habilitar RLS (enmienda 2026-06-11 — el bot SOLO LEE: necesita
-- resolver "gasto de la obra X" buscando la obra por nombre; nunca escribe acá).
-- La app la opera desde el browser logueado como Eze (select/insert/update/delete
-- directos en historial-screen, nuevo-presupuesto, marcar-pdf-generado, etc.) →
-- las policies no-bot mantienen TODO eso intacto (Eze no es bot).
-- Las API routes usan service_role (bypass) → tampoco se rompen.
-- No hay rutas públicas: src/middleware.ts redirige todo a /login sin sesión,
-- así que revocar anon no afecta a nadie.

alter table public.presupuestos enable row level security;
revoke all on public.presupuestos from anon;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'presupuestos'
  loop
    execute format('drop policy if exists %I on public.presupuestos', p.policyname);
  end loop;
end $$;

create policy "presupuestos_select_auth" on public.presupuestos
  for select to authenticated using (true);

create policy "presupuestos_insert_no_bot" on public.presupuestos
  for insert to authenticated
  with check (not public.es_bot());

create policy "presupuestos_update_no_bot" on public.presupuestos
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

create policy "presupuestos_delete_no_bot" on public.presupuestos
  for delete to authenticated
  using (not public.es_bot());
