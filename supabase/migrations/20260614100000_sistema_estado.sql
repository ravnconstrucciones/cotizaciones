-- sistema_estado: latido del daemon de la Mac (Frente E, Centro de Mando).
-- Reemplaza la fila estado='latido' de cotizaciones_cola (que se dropea en
-- 20260614110000 una vez migrados daemon y bot). Singleton id=1.
-- El daemon (usuario bot) upsertea cada ~45s; el bot lee ultimo_latido para
-- saber si la Mac está prendida (macViva).

create table if not exists public.sistema_estado (
  id int primary key default 1 check (id = 1),
  ultimo_latido timestamptz,
  daemon_version text,
  actualizado_at timestamptz not null default now()
);

insert into public.sistema_estado (id) values (1) on conflict (id) do nothing;

comment on table public.sistema_estado is
  'Singleton (id=1) con el latido del daemon Mac. ultimo_latido fresco (<3 min) = Mac viva. daemon_version para diagnosticar qué versión late.';

drop trigger if exists sistema_estado_actualizado_at on public.sistema_estado;
create trigger sistema_estado_actualizado_at
  before update on public.sistema_estado
  for each row execute function public.set_actualizado_at();

alter table public.sistema_estado enable row level security;
revoke all on public.sistema_estado from anon;

drop policy if exists "sistema_estado_select_auth" on public.sistema_estado;
create policy "sistema_estado_select_auth" on public.sistema_estado
  for select to authenticated using (true);

drop policy if exists "sistema_estado_insert_auth" on public.sistema_estado;
create policy "sistema_estado_insert_auth" on public.sistema_estado
  for insert to authenticated with check (true);

drop policy if exists "sistema_estado_update_auth" on public.sistema_estado;
create policy "sistema_estado_update_auth" on public.sistema_estado
  for update to authenticated using (true) with check (true);
