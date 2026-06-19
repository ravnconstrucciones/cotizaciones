-- Galería de cotizaciones (cara de tarjeta, espejo de /obras).
-- Aditiva: NO toca la tabla cotizaciones existente más que para sumar la
-- portada manual, y agrega la carpeta de propuestas (PDFs A/B) por cotización.
--
--  1) cotizaciones.foto_portada_path — la foto de portada que Eze elige a mano
--     para la tarjeta (mismo criterio que obras.foto_portada_path: elección
--     manual, no la última que entró). Vive en el bucket privado existente
--     `obra-archivos`; lectura server-side por signed URL (admin client).
--  2) cotizacion_archivos — las PROPUESTAS adjuntas a una cotización (la cara
--     "PROPUESTA" de la tarjeta: 1 archivo o varios A/B). Mismo bucket privado.
--
-- RLS: mismo patrón que obra_archivos (20260614150000) — Eze y el bot leen y
-- encarpetan; borrar es SOLO de Eze (not es_bot()).

-- ── 1) Portada manual de la cotización ──────────────────────────────────────
alter table public.cotizaciones
  add column if not exists foto_portada_path text;

comment on column public.cotizaciones.foto_portada_path is
  'Storage path (bucket privado obra-archivos) de la foto de portada elegida a mano para la tarjeta de la cotización. Lectura server-side por signed URL. NULL = sin portada (la card muestra placeholder).';

-- ── 2) Carpeta de propuestas de la cotización ───────────────────────────────
create table if not exists public.cotizacion_archivos (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  tipo text not null default 'propuesta',
  titulo text,
  storage_path text,
  creado_at timestamptz not null default now()
);

create index if not exists cotizacion_archivos_cotizacion_idx
  on public.cotizacion_archivos (cotizacion_id, creado_at desc);

comment on table public.cotizacion_archivos is
  'Propuestas adjuntas a una cotización (cara PROPUESTA de la tarjeta /cotizaciones): 1 archivo o varias opciones A/B. storage_path = bucket privado obra-archivos. on delete cascade: si se borra la cotización se van sus propuestas.';

alter table public.cotizacion_archivos enable row level security;
revoke all on public.cotizacion_archivos from anon;

-- Eze y el bot leen y encarpetan; borrar es SOLO de Eze ("yo puedo ir borrando").
drop policy if exists "cotizacion_archivos_select_auth" on public.cotizacion_archivos;
create policy "cotizacion_archivos_select_auth" on public.cotizacion_archivos
  for select to authenticated using (true);

drop policy if exists "cotizacion_archivos_insert_auth" on public.cotizacion_archivos;
create policy "cotizacion_archivos_insert_auth" on public.cotizacion_archivos
  for insert to authenticated with check (true);

drop policy if exists "cotizacion_archivos_delete_no_bot" on public.cotizacion_archivos;
create policy "cotizacion_archivos_delete_no_bot" on public.cotizacion_archivos
  for delete to authenticated
  using (not public.es_bot());

-- Bucket privado `obra-archivos`: ya existe (20260614150000) y se reutiliza —
-- portadas-cotizacion/ y propuestas/ son prefijos nuevos dentro del mismo
-- bucket. Las policies de storage.objects de obra-archivos ya cubren estos
-- prefijos (select/insert authenticated, delete not es_bot). No se redefinen.

-- ── Realtime: la galería respira (propuesta nueva → aparece sola) ────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cotizacion_archivos'
  ) then
    alter publication supabase_realtime add table public.cotizacion_archivos;
  end if;
end $$;
