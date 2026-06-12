-- RLS en tablas de negocio pre-existentes (sin migración versionada y sin RLS):
-- obras, cashflow_items, cashflow_cierres_obra, presupuestos_items, rubros y
-- catalogo_recetas (ex recetas — ya renombrada por 20260612103000).
-- Patrón: select para todo authenticated; insert/update/delete solo no-bot.
-- La app opera como Eze (usuario autenticado no-bot) → no se rompe nada.
-- Las API routes usan service_role (bypass) → tampoco se rompen.
-- El bot queda read-only en todos los datos de negocio.

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'obras','cashflow_items','cashflow_cierres_obra',
    'presupuestos_items','rubros','catalogo_recetas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (not public.es_bot())',
      t || '_insert_no_bot', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (not public.es_bot()) with check (not public.es_bot())',
      t || '_update_no_bot', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (not public.es_bot())',
      t || '_delete_no_bot', t
    );
  end loop;
end $$;

-- legacy sin uso en app/bot — se cierran a anon por higiene.
-- Guard to_regclass: pueden no existir en entornos limpios (base nueva).
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['detalles_presupuesto','gastos_reales'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon', t);
      for p in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', p.policyname, t);
      end loop;
      execute format(
        'create policy %I on public.%I for select to authenticated using (true)',
        t || '_select_auth', t
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (not public.es_bot())',
        t || '_insert_no_bot', t
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (not public.es_bot()) with check (not public.es_bot())',
        t || '_update_no_bot', t
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (not public.es_bot())',
        t || '_delete_no_bot', t
      );
    end if;
  end loop;
end $$;
