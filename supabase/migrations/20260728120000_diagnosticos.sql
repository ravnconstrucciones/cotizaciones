-- Módulo Diagnósticos (spec 2026-07-28, handoff_diagnosticador_voz.md).
--
-- Hasta hoy el diagnóstico era un HTML suelto en ~/Documents/ravn/diagnosticos/
-- (Perazzo, Lagomarsino, Preiss, Correa): no existía como entidad en la app, así
-- que no había forma de listarlo, versionarlo ni empujarlo a cotización.
--
-- Esta tabla lo convierte en un paso del circuito:
--   checklist de visita (cel) → barra de comando → trabajos_cola → la Mac
--   → DIAGNÓSTICO (acá) → "Enviar a cotizar" → cotizaciones (en_revision)
--
-- El documento de cara al cliente lo renderiza la app con plantilla propia
-- (dark premium, base Diagnostico_Perazzo.html). El modelo aporta CONTENIDO,
-- nunca vuelve a dibujar el HTML: mismo principio que el cotizador
-- ("el código suma, no la IA").

create table public.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),

  titulo text not null,
  direccion text,
  cliente text,

  -- borrador: se está armando · listo: revisado por Eze · enviado: se le mandó
  -- al cliente · cotizado: ya nació la cotización desde acá.
  estado text not null default 'borrador'
    check (estado in ('borrador', 'listo', 'enviado', 'cotizado')),

  -- Obra a la que pertenece (obras/documentos cuelgan del presupuesto, misma
  -- convención que obra_archivos.presupuesto_id).
  presupuesto_id uuid references public.presupuestos(id) on delete set null,
  -- Trabajo de la cola que lo generó (la Mac) — trazabilidad del circuito.
  trabajo_id uuid references public.trabajos_cola(id) on delete set null,
  -- Cotización que nació de este diagnóstico ("Enviar a cotizar").
  cotizacion_id uuid references public.cotizaciones(id) on delete set null,

  -- Relevamiento crudo tal como bajó del campo (salida "Copiar todo" del
  -- checklist de visita o dictado). Sin tope de largo: es la materia prima.
  relevamiento text not null default '',

  -- Cuerpo del documento, estructurado para que la plantilla lo renderice:
  -- { resumen: text,
  --   secciones: [{ titulo, cuerpo, fotos: [storage_path] }],
  --   alcance: [text], recomendaciones: [text], faltantes: [text] }
  contenido jsonb not null default '{}'::jsonb,

  -- Portada del documento (bucket privado obra-archivos, se firma al leer).
  foto_portada_path text
);

create index diagnosticos_creado_idx on public.diagnosticos (creado_at desc);
create index diagnosticos_estado_idx on public.diagnosticos (estado);
create index diagnosticos_presupuesto_idx on public.diagnosticos (presupuesto_id);

comment on table public.diagnosticos is
  'Diagnósticos técnicos de obra (módulo /diagnosticos, 2026-07-28). Nacen del relevamiento de campo y se convierten en cotización con "Enviar a cotizar". El PDF de cara al cliente lo renderiza la app con plantilla propia, no el modelo.';

alter table public.diagnosticos enable row level security;

-- Mismo patrón que la mesa conversacional (2026-07-25): el browser LEE con el
-- usuario autenticado; toda escritura pasa por las API routes con service role.
create policy "diagnosticos select autenticado"
  on public.diagnosticos for select to authenticated using (true);
