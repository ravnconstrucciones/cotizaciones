-- calendario_eventos: la agenda de la semana en el cockpit (Ola B).
-- Fuente 'mac' = espejo del Calendar de macOS que siembra el daemon
-- (job_calendario, diario ~7h) deduplicando por uid_externo (uid del evento
-- de Calendar). Fuente 'manual' = eventos cargados a mano desde la app.
-- El módulo SEMANA de la home los pinta junto a las tareas con fecha.

create table if not exists public.calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  fecha date not null,
  hora text,
  fuente text not null default 'manual' check (fuente in ('mac','manual')),
  uid_externo text unique,
  creado_at timestamptz not null default now()
);

create index if not exists calendario_eventos_fecha_idx
  on public.calendario_eventos (fecha);

comment on table public.calendario_eventos is
  'Agenda del cockpit (módulo SEMANA de la home). fuente=mac: espejo del Calendar de macOS vía daemon (job_calendario, upsert por uid_externo + borrado de los que salen de la ventana de 7 días). fuente=manual: cargados desde la app.';
comment on column public.calendario_eventos.uid_externo is
  'uid del evento en Calendar.app — clave de dedup del job diario. Null para eventos manuales.';

alter table public.calendario_eventos enable row level security;
revoke all on public.calendario_eventos from anon;

-- Eze: CRUD completo. Daemon/bot (usuario auth del bot): select/insert/update
-- y delete SOLO de los 'mac' (limpia los que ya no existen en la ventana).
drop policy if exists "calendario_select_auth" on public.calendario_eventos;
create policy "calendario_select_auth" on public.calendario_eventos
  for select to authenticated using (true);

drop policy if exists "calendario_insert_auth" on public.calendario_eventos;
create policy "calendario_insert_auth" on public.calendario_eventos
  for insert to authenticated with check (true);

drop policy if exists "calendario_update_auth" on public.calendario_eventos;
create policy "calendario_update_auth" on public.calendario_eventos
  for update to authenticated
  using (true) with check (true);

drop policy if exists "calendario_delete_eze_o_mac" on public.calendario_eventos;
create policy "calendario_delete_eze_o_mac" on public.calendario_eventos
  for delete to authenticated
  using (not public.es_bot() or fuente = 'mac');

-- ── Realtime: la semana respira (evento nuevo del job → aparece solo) ───────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendario_eventos'
  ) then
    alter publication supabase_realtime add table public.calendario_eventos;
  end if;
end $$;
