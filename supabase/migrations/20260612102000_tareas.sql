-- tareas: creada originalmente por ravn-tu-dia/supabase/migrations/001_tareas.sql
-- (aplicada a mano en prod). Acá queda versionada en el repo del Centro de Mando.
-- RLS enmienda 2026-06-11: el bot tiene CRUD COMPLETO en tareas (select/insert/
-- update/delete) — hoy ya hace update (avisado) y delete ("borrá lo último") por
-- WhatsApp y ese comportamiento se conserva. Decisión acordada con Eze.

create table if not exists public.tareas (
  id            uuid primary key default gen_random_uuid(),
  texto         text not null,
  categoria     text not null default 'Personal'
                check (categoria in ('Salud','Finanzas','Obra','Compras','Gestiones','Personal')),
  fecha         date,
  hora          time,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente','hecha')),
  origen        text not null default 'whatsapp'
                check (origen in ('whatsapp','web','manual')),
  nota          text,
  avisado       boolean not null default false,
  creado_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completado_at timestamptz
);

create index if not exists tareas_estado_idx on public.tareas (estado);
create index if not exists tareas_fecha_idx  on public.tareas (fecha);

create or replace function public.tareas_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if new.estado = 'hecha' and old.estado <> 'hecha' then
    new.completado_at = now();
  end if;
  return new;
end $$;

drop trigger if exists tareas_set_updated_at on public.tareas;
create trigger tareas_set_updated_at
  before update on public.tareas
  for each row execute function public.tareas_set_updated_at();

alter table public.tareas enable row level security;
revoke all on public.tareas from anon;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tareas'
  loop
    execute format('drop policy if exists %I on public.tareas', p.policyname);
  end loop;
end $$;

create policy "tareas_select_auth" on public.tareas
  for select to authenticated using (true);

create policy "tareas_insert_auth" on public.tareas
  for insert to authenticated with check (true);

-- update y delete abiertos a authenticated: el bot también (enmienda 2026-06-11).
create policy "tareas_update_auth" on public.tareas
  for update to authenticated
  using (true) with check (true);

create policy "tareas_delete_auth" on public.tareas
  for delete to authenticated
  using (true);
