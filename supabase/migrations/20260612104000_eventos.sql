-- eventos: registro permanente de todo lo que entra/pasa por el sistema
-- (contrato de datos Centro de Mando 2026-06-11 — nombres y estados NO se cambian).

create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  origen text not null check (origen in ('whatsapp','tablero','daemon','bot','sistema')),
  tipo text not null,
  estado text not null default 'procesado' check (estado in ('procesado','pendiente_pregunta','archivado','resuelto')),
  titulo text not null,
  contenido jsonb not null default '{}'::jsonb,
  destino_tabla text,
  destino_id uuid,
  wa_message_id text unique
);

create index if not exists eventos_creado_idx
  on public.eventos (creado_at desc);

create index if not exists eventos_estado_idx
  on public.eventos (estado, creado_at desc);

comment on table public.eventos is
  'Registro permanente: todo mensaje del bot, acción del daemon y orden del tablero deja fila acá. estado=archivado alimenta la vista Archivados; wa_message_id deduplica webhooks de WhatsApp.';

alter table public.eventos enable row level security;
revoke all on public.eventos from anon;

drop policy if exists "eventos_select_auth" on public.eventos;
create policy "eventos_select_auth" on public.eventos
  for select to authenticated using (true);

drop policy if exists "eventos_insert_auth" on public.eventos;
create policy "eventos_insert_auth" on public.eventos
  for insert to authenticated with check (true);

-- update abierto a authenticated: el bot marca estados (pendiente_pregunta →
-- procesado / archivado / resuelto) — enmienda 2026-06-11. delete solo Eze.
drop policy if exists "eventos_update_auth" on public.eventos;
create policy "eventos_update_auth" on public.eventos
  for update to authenticated
  using (true) with check (true);

drop policy if exists "eventos_delete_no_bot" on public.eventos;
create policy "eventos_delete_no_bot" on public.eventos
  for delete to authenticated
  using (not public.es_bot());

-- Realtime: el feed Actividad del tablero (Frente B) escucha cambios de esta tabla.
do $$
begin
  alter publication supabase_realtime add table public.eventos;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime no existe: habilitala desde Dashboard → Database → Replication';
end $$;
