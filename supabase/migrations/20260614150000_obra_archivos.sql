-- obra_archivos: la CARPETA de la obra — el orbital de /obras/[id] reconvertido.
-- Cada fila es un artefacto: foto de avance (WhatsApp → bot), diagnóstico,
-- presupuesto o documento suelto. storage_path apunta al bucket privado
-- `obra-archivos`; url_externa cubre documentos que viven afuera (p.ej. /docs).
-- Patrón RLS: referencias (20260612109000) — el bot encarpeta, solo Eze borra.

create table if not exists public.obra_archivos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id),
  tipo text not null check (tipo in ('foto','diagnostico','presupuesto','documento')),
  titulo text,
  storage_path text,
  url_externa text,
  evento_id uuid references public.eventos(id),
  creado_at timestamptz not null default now()
);

create index if not exists obra_archivos_presupuesto_idx
  on public.obra_archivos (presupuesto_id, creado_at desc);

comment on table public.obra_archivos is
  'Carpeta de la obra (orbital /obras/[id]): fotos que llegan por WhatsApp (bot, tipo=foto), diagnósticos, presupuestos y documentos. storage_path = bucket privado obra-archivos; url_externa = documentos servidos por la app (/docs/...).';

alter table public.obra_archivos enable row level security;
revoke all on public.obra_archivos from anon;

-- Eze y el bot leen y encarpetan; borrar es SOLO de Eze ("yo puedo ir borrando").
drop policy if exists "obra_archivos_select_auth" on public.obra_archivos;
create policy "obra_archivos_select_auth" on public.obra_archivos
  for select to authenticated using (true);

drop policy if exists "obra_archivos_insert_auth" on public.obra_archivos;
create policy "obra_archivos_insert_auth" on public.obra_archivos
  for insert to authenticated with check (true);

drop policy if exists "obra_archivos_delete_no_bot" on public.obra_archivos;
create policy "obra_archivos_delete_no_bot" on public.obra_archivos
  for delete to authenticated
  using (not public.es_bot());

-- ── Bucket privado `obra-archivos` (50 MB) ──────────────────────────────────
-- Lectura SIEMPRE vía signed URLs server-side. El INSERT incluye al bot a
-- propósito (sube las fotos de obra que llegan por WhatsApp); borrar archivos
-- es solo de Eze. Sin policy de update: los archivos no se pisan.

insert into storage.buckets (id, name, public, file_size_limit)
values ('obra-archivos', 'obra-archivos', false, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "obra_archivos_storage_select_auth" on storage.objects;
create policy "obra_archivos_storage_select_auth"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'obra-archivos');

drop policy if exists "obra_archivos_storage_insert_auth" on storage.objects;
create policy "obra_archivos_storage_insert_auth"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'obra-archivos');

drop policy if exists "obra_archivos_storage_delete_no_bot" on storage.objects;
create policy "obra_archivos_storage_delete_no_bot"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'obra-archivos' and not public.es_bot());

-- ── Realtime: el orbital respira en vivo (foto nueva → aparece sola) ────────
-- Idempotente, mismo patrón que 20260613100000_realtime_centro_mando.sql.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'obra_archivos'
  ) then
    alter publication supabase_realtime add table public.obra_archivos;
  end if;
end $$;
