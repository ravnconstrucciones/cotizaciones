-- Endurecer RLS de maestro_precios_items y maestro_precios_gestion.
-- Antes (migración 20260419140000, líneas 48-57): policy "for all using(true) with check(true)"
-- + grants a anon, authenticated, service_role — tablas abiertas al público con la anon key.
-- Ahora: solo authenticated no-bot; anon afuera.
-- El bot ni las lee ni las escribe (son parámetros de precios de Eze).
-- La app los lee/escribe desde el browser logueado como Eze → no se rompe nada.

drop policy if exists "maestro_precios_items_all" on public.maestro_precios_items;
drop policy if exists "maestro_precios_gestion_all" on public.maestro_precios_gestion;

drop policy if exists "maestro_precios_items_all_no_bot" on public.maestro_precios_items;
create policy "maestro_precios_items_all_no_bot" on public.maestro_precios_items
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "maestro_precios_gestion_all_no_bot" on public.maestro_precios_gestion;
create policy "maestro_precios_gestion_all_no_bot" on public.maestro_precios_gestion
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

revoke all on public.maestro_precios_items from anon;
revoke all on public.maestro_precios_gestion from anon;
