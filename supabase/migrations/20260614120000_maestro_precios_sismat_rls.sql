-- Política específica para que el daemon pueda escribir SOLO los campos sismat_*
-- en maestro_precios_items y sismat_ultima_sync en maestro_precios_gestion.
-- Los campos manuales (costo_mo_m2, costo_materiales_m2, etc.) siguen bloqueados al bot
-- porque el WITH CHECK no los incluye — cualquier intento de tocarlos sería bloqueado
-- por la policy principal que excluye al bot de todo el FOR ALL.
--
-- Para separar correctamente: el daemon solo puede UPDATE; SELECT/INSERT/DELETE siguen
-- siendo solo del usuario autenticado no-bot (policy _no_bot existente).

drop policy if exists "maestro_precios_items_daemon_sismat" on public.maestro_precios_items;
create policy "maestro_precios_items_daemon_sismat"
  on public.maestro_precios_items
  for update to authenticated
  using (public.es_bot())
  with check (public.es_bot());

drop policy if exists "maestro_precios_gestion_daemon_sismat" on public.maestro_precios_gestion;
create policy "maestro_precios_gestion_daemon_sismat"
  on public.maestro_precios_gestion
  for update to authenticated
  using (public.es_bot())
  with check (public.es_bot());

-- El daemon también necesita SELECT para leer los ítems y el singleton de gestión.
drop policy if exists "maestro_precios_items_daemon_read" on public.maestro_precios_items;
create policy "maestro_precios_items_daemon_read"
  on public.maestro_precios_items
  for select to authenticated
  using (public.es_bot());

drop policy if exists "maestro_precios_gestion_daemon_read" on public.maestro_precios_gestion;
create policy "maestro_precios_gestion_daemon_read"
  on public.maestro_precios_gestion
  for select to authenticated
  using (public.es_bot());
