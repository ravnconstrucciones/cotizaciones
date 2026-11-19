-- Portal del cliente (15/11/2026): la obra que ve el cliente con link + PIN.
--
-- Cuatro tablas nuevas, todas colgadas de presupuestos (la obra = presupuesto_id):
--   obra_portal            config 1:1 (slug público, PIN hasheado, qué se muestra)
--   obra_portal_rubros     avance por rubro, en el idioma del cliente
--   obra_portal_registros  bitácora que ve el cliente (avance, video, resuelto, material)
--   obra_portal_agenda     qué pasa en la obra y cuándo (gasista, proveedor, visita)
--
-- Separadas de obra_avances a propósito: esa bitácora es INTERNA (la escriben
-- Eze y el bot sin filtro). Acá sólo entra lo que se decidió mostrar.
--
-- Los pagos NO se guardan acá: la barra del portal se deriva del contrato
-- (obras.monto_total_a_cobrar_*) y de los cobros reales (cashflow_items).
--
-- Patrón de acceso: obra_rubro_mediciones (20260909103337) — RLS cerrado para
-- anon y authenticated; sólo el servidor (service role) lee y escribe. El
-- cliente del portal nunca toca Supabase: entra por rutas /o/[slug] que validan
-- su cookie firmada.

create table public.obra_portal (
  presupuesto_id uuid primary key references public.presupuestos(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{4,60}$'),
  pin_hash text,
  activo boolean not null default false,
  titulo text,
  direccion text,
  fecha_inicio date,
  fecha_entrega date,
  mostrar_pagos boolean not null default false,
  intentos_fallidos integer not null default 0,
  bloqueado_hasta timestamptz,
  sesion_version integer not null default 1,
  creado_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.obra_portal is
  'Portal del cliente: config 1:1 por obra. slug = link público /o/<slug>; pin_hash = scrypt del PIN (nunca en claro); sesion_version invalida las cookies al cambiar el PIN; mostrar_pagos decide si el cliente ve contrato/pagado/saldo.';

create table public.obra_portal_rubros (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  nombre text not null,
  avance integer not null default 0 check (avance between 0 and 100),
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','terminado')),
  orden integer not null default 0,
  updated_at timestamptz not null default now()
);
create index obra_portal_rubros_obra_idx on public.obra_portal_rubros (presupuesto_id, orden);

create table public.obra_portal_registros (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  rubro_id uuid references public.obra_portal_rubros(id) on delete set null,
  tipo text not null default 'avance' check (tipo in ('avance','video','resuelto','material')),
  titulo text not null,
  texto text,
  fecha date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  media_path text,
  media_tipo text check (media_tipo in ('imagen','video')),
  link_externo text,
  material jsonb,
  estado text not null default 'publicado' check (estado in ('borrador','publicado')),
  origen text not null default 'app' check (origen in ('app','bot')),
  creado_at timestamptz not null default now()
);
create index obra_portal_registros_obra_idx on public.obra_portal_registros (presupuesto_id, fecha desc, creado_at desc);

comment on column public.obra_portal_registros.estado is
  'borrador = cargado (p. ej. por un bot) y pendiente de aprobación de Eze; el cliente sólo ve publicado.';
comment on column public.obra_portal_registros.material is
  'Sólo tipo material: {producto, marca, color, estado}.';

create table public.obra_portal_agenda (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  fecha date not null,
  hora text check (hora is null or hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  titulo text not null,
  quien text,
  detalle text,
  creado_at timestamptz not null default now()
);
create index obra_portal_agenda_obra_idx on public.obra_portal_agenda (presupuesto_id, fecha);

alter table public.obra_portal enable row level security;
alter table public.obra_portal_rubros enable row level security;
alter table public.obra_portal_registros enable row level security;
alter table public.obra_portal_agenda enable row level security;

revoke all on public.obra_portal from anon, authenticated;
revoke all on public.obra_portal_rubros from anon, authenticated;
revoke all on public.obra_portal_registros from anon, authenticated;
revoke all on public.obra_portal_agenda from anon, authenticated;

grant all on public.obra_portal to service_role;
grant all on public.obra_portal_rubros to service_role;
grant all on public.obra_portal_registros to service_role;
grant all on public.obra_portal_agenda to service_role;
