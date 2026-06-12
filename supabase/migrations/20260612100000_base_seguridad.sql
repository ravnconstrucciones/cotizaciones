-- Cimientos Centro de Mando — base de seguridad y helpers compartidos.
-- es_bot(): distingue al usuario auth dedicado del bot (Railway BOT_EMAIL)
--           del usuario real de Eze, ambos rol `authenticated`.
-- set_actualizado_at(): trigger genérico para columnas actualizado_at.

create table if not exists public.seguridad_config (
  id smallint primary key default 1 check (id = 1),
  bot_email text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.seguridad_config (id) values (1) on conflict (id) do nothing;

comment on table public.seguridad_config is
  'Singleton de seguridad: bot_email = email del usuario auth dedicado del bot (var BOT_EMAIL en Railway). Solo lo edita service_role / SQL Editor. Lo lee es_bot().';

alter table public.seguridad_config enable row level security;
-- Sin policies a propósito: ni anon ni authenticated la tocan directo;
-- solo service_role (bypass) y es_bot() (security definer).
revoke all on public.seguridad_config from anon, authenticated;

create or replace function public.es_bot()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = nullif((select bot_email from public.seguridad_config where id = 1), ''),
    false
  );
$$;

comment on function public.es_bot() is
  'true si la sesión actual es el usuario bot (email del JWT vs seguridad_config.bot_email). Con bot_email vacío devuelve false para todos (nadie es bot hasta sembrarlo).';

create or replace function public.set_actualizado_at()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_at = now();
  return new;
end $$;
