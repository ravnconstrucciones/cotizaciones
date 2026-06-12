-- Endurecer RLS de inmobiliario_* (estándar de seguridad Ravn).
-- Antes: policies using(true) para TODOS + grants a anon (tabla abierta al público
-- con la anon key). Ahora: solo usuario autenticado real (no bot); anon afuera.
-- Los jobs de scraping/agregación usan service_role server-side (bypass) → no se rompen.
-- NOTA: las 4 tablas inmobiliario_* no existen en prod al momento de esta migración
-- (20260522120000 nunca fue aplicada). Guards condicionales garantizan idempotencia.
-- Si la migración de schema se aplica después, el RLS llega por una pasada futura o
-- por re-aplicar esta migración.

do $$ begin
  if to_regclass('public.inmobiliario_zonas') is not null then
    drop policy if exists "inmobiliario_zonas_all" on public.inmobiliario_zonas;
    drop policy if exists "inmobiliario_zonas_all_no_bot" on public.inmobiliario_zonas;
    create policy "inmobiliario_zonas_all_no_bot" on public.inmobiliario_zonas
      for all to authenticated
      using (not public.es_bot()) with check (not public.es_bot());
    revoke all on public.inmobiliario_zonas from anon;
  end if;
end $$;

do $$ begin
  if to_regclass('public.inmobiliario_avisos_snapshot') is not null then
    drop policy if exists "inmobiliario_avisos_all" on public.inmobiliario_avisos_snapshot;
    drop policy if exists "inmobiliario_avisos_all_no_bot" on public.inmobiliario_avisos_snapshot;
    create policy "inmobiliario_avisos_all_no_bot" on public.inmobiliario_avisos_snapshot
      for all to authenticated
      using (not public.es_bot()) with check (not public.es_bot());
    revoke all on public.inmobiliario_avisos_snapshot from anon;
  end if;
end $$;

do $$ begin
  if to_regclass('public.inmobiliario_precios_zona_periodo') is not null then
    drop policy if exists "inmobiliario_precios_all" on public.inmobiliario_precios_zona_periodo;
    drop policy if exists "inmobiliario_precios_all_no_bot" on public.inmobiliario_precios_zona_periodo;
    create policy "inmobiliario_precios_all_no_bot" on public.inmobiliario_precios_zona_periodo
      for all to authenticated
      using (not public.es_bot()) with check (not public.es_bot());
    revoke all on public.inmobiliario_precios_zona_periodo from anon;
  end if;
end $$;

do $$ begin
  if to_regclass('public.inmobiliario_noticias') is not null then
    drop policy if exists "inmobiliario_noticias_all" on public.inmobiliario_noticias;
    drop policy if exists "inmobiliario_noticias_all_no_bot" on public.inmobiliario_noticias;
    create policy "inmobiliario_noticias_all_no_bot" on public.inmobiliario_noticias
      for all to authenticated
      using (not public.es_bot()) with check (not public.es_bot());
    revoke all on public.inmobiliario_noticias from anon;
  end if;
end $$;
