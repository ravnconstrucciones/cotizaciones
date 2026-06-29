-- Finanzas Personales (Fase 1): el motor del presupuesto personal de Eze.
--
-- finanzas_personal_config: singleton (id=1) con el tope mensual y el día de
--   cierre de la tarjeta (define el ciclo del acumulado, del 26 al 25).
-- finanzas_fijos: lista de costos fijos. dueno='personal' resta del discrecional;
--   dueno='empresa' (software/IA) es informativo etiquetado, fuera de todo cálculo.
--
-- RLS = mismo contrato que gastos_personales / negocio_config: authenticated
-- total; el bot SOLO lee (presupuesto del día); config y fijos los edita SOLO
-- Eze → not public.es_bot() en insert/update/delete. La app usa service_role
-- (bypass), así que no se rompe. El seed va aparte (no en la migración).

create table if not exists public.finanzas_personal_config (
  id int primary key default 1,
  tope_personal_mensual_ars numeric(12, 2) not null default 2800000,
  dia_cierre int not null default 25,
  notas text,
  updated_at timestamptz default now(),
  constraint finanzas_personal_config_singleton check (id = 1),
  constraint finanzas_personal_config_dia_cierre_rango check (dia_cierre between 1 and 28)
);

comment on table public.finanzas_personal_config is
  'Singleton (id=1): tope personal mensual + día de cierre de la tarjeta (ciclo del presupuesto). Finanzas Personales Fase 1 (2026-06-29).';

create table if not exists public.finanzas_fijos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto_ars numeric(12, 2) not null default 0,
  dueno text not null default 'personal',
  activo boolean not null default true,
  orden int not null default 0,
  created_at timestamptz default now(),
  constraint finanzas_fijos_dueno check (dueno in ('personal', 'empresa'))
);

comment on table public.finanzas_fijos is
  'Costos fijos mensuales. dueno=personal resta del discrecional; dueno=empresa (software/IA) es informativo etiquetado, no entra a ningún cálculo personal. Finanzas Personales Fase 1.';

create index if not exists finanzas_fijos_dueno_orden_idx
  on public.finanzas_fijos (dueno, orden);

-- RLS ----------------------------------------------------------------------
alter table public.finanzas_personal_config enable row level security;
alter table public.finanzas_fijos enable row level security;
revoke all on public.finanzas_personal_config from anon;
revoke all on public.finanzas_fijos from anon;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['finanzas_personal_config', 'finanzas_fijos'] loop
    -- Barre cualquier policy previa y deja las del contrato.
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    -- select: todo authenticated (incluye el bot, que lee el presupuesto del día).
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t
    );
    -- insert/update/delete: solo Eze (no el bot).
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (not public.es_bot())',
      t || '_insert_no_bot', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (not public.es_bot()) with check (not public.es_bot())',
      t || '_update_no_bot', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (not public.es_bot())',
      t || '_delete_no_bot', t
    );
  end loop;
end $$;
