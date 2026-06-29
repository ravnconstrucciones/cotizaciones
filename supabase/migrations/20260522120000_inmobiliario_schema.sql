-- Módulo inmobiliario: zonas, snapshots crudos, agregados por período, noticias. Idempotente.

create table if not exists public.inmobiliario_zonas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null default 'barrio_caba',
  region text not null default 'CABA',
  ml_match text[] not null default '{}',
  lat numeric(9,6),
  lng numeric(9,6),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nombre, region)
);

create table if not exists public.inmobiliario_avisos_snapshot (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid references public.inmobiliario_zonas(id) on delete set null,
  fuente text not null,
  tipo_dato text not null,
  fuente_id text not null,
  operacion text not null default 'venta',
  tipo_prop text not null default 'departamento',
  precio_usd numeric(14,2),
  m2 numeric(10,2),
  usd_por_m2 numeric(12,2),
  ambientes int,
  antiguedad int,
  capturado_en timestamptz not null default now(),
  unique (fuente, fuente_id, capturado_en)
);
create index if not exists inmobiliario_avisos_zona_idx
  on public.inmobiliario_avisos_snapshot (zona_id, tipo_dato, capturado_en);

create table if not exists public.inmobiliario_precios_zona_periodo (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references public.inmobiliario_zonas(id) on delete cascade,
  periodo date not null,
  tipo_prop text not null default 'departamento',
  mediana_publicacion_usd_m2 numeric(12,2),
  mediana_cierre_usd_m2 numeric(12,2),
  factor_ajuste numeric(5,3),
  ref_reporte_usd_m2 numeric(12,2),
  p25_usd_m2 numeric(12,2),
  p75_usd_m2 numeric(12,2),
  n_avisos int not null default 0,
  n_escrituras int not null default 0,
  var_mensual numeric(7,2),
  costo_constr_usd_m2 numeric(12,2),
  veredicto text,
  confianza text not null default 'estimada',
  calculado_en timestamptz not null default now(),
  unique (zona_id, periodo, tipo_prop)
);

create table if not exists public.inmobiliario_noticias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  url text not null,
  fuente text not null,
  publicado_en timestamptz,
  zona_relevante text,
  score numeric(6,2) not null default 0,
  capturado_en timestamptz not null default now(),
  unique (url)
);
create index if not exists inmobiliario_noticias_score_idx
  on public.inmobiliario_noticias (score desc, publicado_en desc);

alter table public.inmobiliario_zonas enable row level security;
alter table public.inmobiliario_avisos_snapshot enable row level security;
alter table public.inmobiliario_precios_zona_periodo enable row level security;
alter table public.inmobiliario_noticias enable row level security;

drop policy if exists "inmobiliario_zonas_all" on public.inmobiliario_zonas;
create policy "inmobiliario_zonas_all" on public.inmobiliario_zonas for all using (true) with check (true);
drop policy if exists "inmobiliario_avisos_all" on public.inmobiliario_avisos_snapshot;
create policy "inmobiliario_avisos_all" on public.inmobiliario_avisos_snapshot for all using (true) with check (true);
drop policy if exists "inmobiliario_precios_all" on public.inmobiliario_precios_zona_periodo;
create policy "inmobiliario_precios_all" on public.inmobiliario_precios_zona_periodo for all using (true) with check (true);
drop policy if exists "inmobiliario_noticias_all" on public.inmobiliario_noticias;
create policy "inmobiliario_noticias_all" on public.inmobiliario_noticias for all using (true) with check (true);

grant select, insert, update, delete on public.inmobiliario_zonas to anon, authenticated, service_role;
grant select, insert, update, delete on public.inmobiliario_avisos_snapshot to anon, authenticated, service_role;
grant select, insert, update, delete on public.inmobiliario_precios_zona_periodo to anon, authenticated, service_role;
grant select, insert, update, delete on public.inmobiliario_noticias to anon, authenticated, service_role;
