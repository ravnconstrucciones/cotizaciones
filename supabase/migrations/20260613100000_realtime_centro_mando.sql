-- Centro de Mando (Frente B) — Realtime para el módulo Cotizaciones.
-- eventos y trabajos_cola ya los publica el Frente A al crearlos: NO se tocan acá.
-- Idempotente: solo agrega si la tabla existe y no está ya en la publicación.
do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'cotizaciones'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cotizaciones'
  ) then
    alter publication supabase_realtime add table public.cotizaciones;
  end if;
end $$;
