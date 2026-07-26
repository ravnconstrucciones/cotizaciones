-- Mesa de cotización conversacional (spec 2026-07-25).
-- Hilo nuevo a tres voces + latido del puente local + foto marcada para la propuesta.

create table public.cotizacion_mensajes (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  autor text not null check (autor in ('eze', 'fable', 'codex', 'sistema')),
  texto text not null default '',
  -- adjuntos: [{ archivo_id, storage_path, titulo }] — fotos soltadas en la mesa.
  adjuntos jsonb not null default '[]'::jsonb,
  -- meta: { tipo: 'charla'|'busqueda'|'aviso'|'adjuntos', respuesta_a: uuid, fuentes: [...] }
  meta jsonb not null default '{}'::jsonb,
  creado_at timestamptz not null default now()
);

create index cotizacion_mensajes_cot_idx
  on public.cotizacion_mensajes (cotizacion_id, creado_at);
-- El puente chequea "¿ya respondí este mensaje?" por meta->>'respuesta_a'.
create index cotizacion_mensajes_respuesta_idx
  on public.cotizacion_mensajes ((meta ->> 'respuesta_a'));

alter table public.cotizacion_mensajes enable row level security;

-- La app lee con el usuario autenticado (Realtime + selects del browser);
-- escribe siempre vía API routes con service role (mismo patrón del módulo).
create policy "mensajes select autenticado"
  on public.cotizacion_mensajes for select to authenticated using (true);

alter publication supabase_realtime add table public.cotizacion_mensajes;

-- Latido del puente-cotizador: una fila por proceso, upsert cada 30 s.
create table public.puente_latidos (
  id text primary key,
  visto_at timestamptz not null default now()
);

alter table public.puente_latidos enable row level security;
create policy "latidos select autenticado"
  on public.puente_latidos for select to authenticated using (true);

-- Foto marcada para salir en la propuesta (pestaña Fotos de la mesa).
alter table public.cotizacion_archivos
  add column en_propuesta boolean not null default false;
