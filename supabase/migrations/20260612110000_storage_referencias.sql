-- Bucket privado `referencias` para imágenes del ADN (moodboard).
-- Acceso de lectura SIEMPRE vía signed URLs generadas server-side.
-- Patrón del repo: 20260415210000_gastos_obra_adjuntos_storage.sql (pero PRIVADO).
-- Enmienda RLS 2026-06-11: el INSERT en storage.objects de este bucket incluye al
-- BOT a propósito (la policy de insert es para todo `authenticated`, sin not es_bot():
-- el bot sube las fotos de referencias que llegan por WhatsApp). Pisar (update) y
-- borrar siguen siendo solo de Eze.

insert into storage.buckets (id, name, public, file_size_limit)
values ('referencias', 'referencias', false, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "referencias_storage_select_auth" on storage.objects;
create policy "referencias_storage_select_auth"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'referencias');

drop policy if exists "referencias_storage_insert_auth" on storage.objects;
create policy "referencias_storage_insert_auth"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'referencias');

drop policy if exists "referencias_storage_update_no_bot" on storage.objects;
create policy "referencias_storage_update_no_bot"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'referencias' and not public.es_bot())
  with check (bucket_id = 'referencias' and not public.es_bot());

drop policy if exists "referencias_storage_delete_no_bot" on storage.objects;
create policy "referencias_storage_delete_no_bot"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'referencias' and not public.es_bot());
