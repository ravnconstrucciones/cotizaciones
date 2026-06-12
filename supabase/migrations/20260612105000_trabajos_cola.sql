-- trabajos_cola: cola general de trabajo pesado (cotizar/redactar/consulta/orden).
-- Generaliza cotizaciones_cola (que sigue existiendo hasta que bot y daemon migren).
-- Contrato de datos Centro de Mando 2026-06-11 — nombres y estados NO se cambian.

create table if not exists public.trabajos_cola (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('cotizar','redactar','consulta','orden')),
  origen text not null check (origen in ('whatsapp','tablero')),
  estado text not null default 'pendiente' check (estado in ('pendiente','esperando_datos','procesando','en_revision','completado','error','cancelado')),
  prompt text not null,
  contexto jsonb not null default '{}'::jsonb,
  resultado jsonb,
  error text
);

create index if not exists trabajos_cola_estado_idx
  on public.trabajos_cola (estado, creado_at);

comment on table public.trabajos_cola is
  'Cola que procesa el daemon de la Mac (Claude Code headless). El bot y la barra de comando insertan; el daemon levanta `pendiente` y actualiza estado/resultado.';

drop trigger if exists trabajos_cola_actualizado_at on public.trabajos_cola;
create trigger trabajos_cola_actualizado_at
  before update on public.trabajos_cola
  for each row execute function public.set_actualizado_at();

alter table public.trabajos_cola enable row level security;
revoke all on public.trabajos_cola from anon;

drop policy if exists "trabajos_cola_select_auth" on public.trabajos_cola;
create policy "trabajos_cola_select_auth" on public.trabajos_cola
  for select to authenticated using (true);

drop policy if exists "trabajos_cola_insert_auth" on public.trabajos_cola;
create policy "trabajos_cola_insert_auth" on public.trabajos_cola
  for insert to authenticated with check (true);

-- update abierto a authenticated: el bot cancela trabajos ("cancelar") y completa
-- fichas (estado esperando_datos → pendiente con contexto.respuestas) — enmienda
-- 2026-06-11. delete solo Eze.
drop policy if exists "trabajos_cola_update_auth" on public.trabajos_cola;
create policy "trabajos_cola_update_auth" on public.trabajos_cola
  for update to authenticated
  using (true) with check (true);

drop policy if exists "trabajos_cola_delete_no_bot" on public.trabajos_cola;
create policy "trabajos_cola_delete_no_bot" on public.trabajos_cola
  for delete to authenticated
  using (not public.es_bot());

-- Realtime: el tablero muestra el progreso de la cola en vivo (Frente B).
do $$
begin
  alter publication supabase_realtime add table public.trabajos_cola;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'publication supabase_realtime no existe: habilitala desde Dashboard → Database → Replication';
end $$;
