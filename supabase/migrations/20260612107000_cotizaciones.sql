-- cotizaciones: mesa de revisión del cotizador (contrato Centro de Mando 2026-06-11).
-- Flujo de estados: borrador → en_revision → aprobada → documento_emitido
-- (o rechazada con motivo, que alimenta cotizador_lecciones).
-- FK a public.presupuestos: tabla pre-existente en prod (sin migración versionada).

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  trabajo_id uuid references public.trabajos_cola(id),
  titulo text not null,
  zona text,
  estado text not null default 'borrador' check (estado in ('borrador','en_revision','aprobada','rechazada','documento_emitido')),
  receta_id uuid references public.recetas(id),
  ficha jsonb not null default '{}'::jsonb,
  desglose jsonb not null default '{}'::jsonb,
  total_min numeric,
  total_max numeric,
  revision jsonb,
  motivo_rechazo text,
  presupuesto_id uuid references public.presupuestos(id)
);

create index if not exists cotizaciones_estado_idx
  on public.cotizaciones (estado, creado_at desc);

create index if not exists cotizaciones_trabajo_idx
  on public.cotizaciones (trabajo_id);

create index if not exists cotizaciones_receta_idx
  on public.cotizaciones (receta_id);

comment on table public.cotizaciones is
  'Cotizaciones del Cotizador 2.0. El documento final NUNCA se emite sin OK explícito de Eze (estado aprobada). revision guarda el paquete de la mesa: fuentes fechadas, checklist, sanidad física, divergencias de precio.';

alter table public.cotizaciones enable row level security;
revoke all on public.cotizaciones from anon;

-- RLS enmienda 2026-06-11: el bot LEE y ACTUALIZA cotizaciones (la aprobación de la
-- mesa de revisión por WhatsApp: "OK" → estado aprobada, "corregir X" → rechazada).
-- Crear y borrar: solo Eze (el alta la hace el daemon vía su propio acceso).
drop policy if exists "cotizaciones_select_auth" on public.cotizaciones;
create policy "cotizaciones_select_auth" on public.cotizaciones
  for select to authenticated using (true);

drop policy if exists "cotizaciones_insert_no_bot" on public.cotizaciones;
create policy "cotizaciones_insert_no_bot" on public.cotizaciones
  for insert to authenticated
  with check (not public.es_bot());

drop policy if exists "cotizaciones_update_auth" on public.cotizaciones;
create policy "cotizaciones_update_auth" on public.cotizaciones
  for update to authenticated
  using (true) with check (true);

drop policy if exists "cotizaciones_delete_no_bot" on public.cotizaciones;
create policy "cotizaciones_delete_no_bot" on public.cotizaciones
  for delete to authenticated
  using (not public.es_bot());
