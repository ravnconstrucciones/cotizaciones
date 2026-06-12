-- gastos_personales: existía en producción sin migración versionada.
-- Esquema según uso real: src/app/api/finanzas/route.ts (GET/POST/DELETE) y
-- ravn-bots/src/supabaseService.js insertGastoPersonal.
-- AJUSTE 2026-06-12 (Tarea 1 verificación prod): monto NOT NULL, fecha NOT NULL
-- default current_date, origen nullable default 'whatsapp', created_at nullable.
-- RLS enmienda 2026-06-11: Eze (authenticated no-bot) total;
-- bot insert/select/delete ("borrá el último gasto" por WhatsApp), SIN update.

create table if not exists public.gastos_personales (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,   -- NOT NULL en prod (ajuste Tarea 1: 2026-06-12)
  concepto text not null,
  monto numeric(12, 2) not null,               -- NOT NULL y numeric(12,2) en prod (verificado contra information_schema 2026-06-12)
  categoria text not null default 'Varios',
  origen text default 'whatsapp',              -- nullable en prod, default 'whatsapp' (ajuste Tarea 1)
  created_at timestamptz default now()         -- nullable en prod (ajuste Tarea 1: 2026-06-12)
);

create index if not exists gastos_personales_fecha_idx
  on public.gastos_personales (fecha desc);

create index if not exists gastos_personales_created_idx
  on public.gastos_personales (created_at desc);

comment on table public.gastos_personales is
  'Gastos personales de Eze (módulo Finanzas + bot WhatsApp). Versionada 2026-06-12 desde el esquema real de producción.';

alter table public.gastos_personales enable row level security;
revoke all on public.gastos_personales from anon;

-- Barre cualquier policy previa (nombres desconocidos en prod) y deja las del contrato.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'gastos_personales'
  loop
    execute format('drop policy if exists %I on public.gastos_personales', p.policyname);
  end loop;
end $$;

create policy "gastos_personales_select_auth" on public.gastos_personales
  for select to authenticated using (true);

create policy "gastos_personales_insert_auth" on public.gastos_personales
  for insert to authenticated with check (true);

create policy "gastos_personales_update_no_bot" on public.gastos_personales
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

-- delete abierto a authenticated: el bot borra ("borrá el último gasto") — enmienda 2026-06-11.
create policy "gastos_personales_delete_auth" on public.gastos_personales
  for delete to authenticated
  using (true);
