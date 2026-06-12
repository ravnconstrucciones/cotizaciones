-- obra_avances: la BITÁCORA de la obra (Ola B del cockpit).
-- Cada fila es un avance de seguimiento ("colocamos el porcelanato") con la
-- instancia/etapa opcional ("demolición", "colocación"...). Lo escriben Eze
-- desde la card del proyecto (/obras) y el bot por WhatsApp (destino
-- avance_obra). El último avance se muestra EN VERDE en la card; el historial
-- completo vive en el nodo Bitácora del orbital.
-- Patrón RLS: obra_archivos (20260614150000) — el bot escribe, solo Eze borra.

create table if not exists public.obra_avances (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id),
  texto text not null,
  instancia text,
  creado_at timestamptz not null default now()
);

create index if not exists obra_avances_presupuesto_idx
  on public.obra_avances (presupuesto_id, creado_at desc);

comment on table public.obra_avances is
  'Bitácora de la obra: avances de seguimiento (texto + instancia/etapa libre opcional). Fuentes: card del proyecto en /obras (+ avance) y bot de WhatsApp (destino avance_obra). El último avance pinta EN VERDE la card; el historial completo es el nodo Bitácora del orbital.';
comment on column public.obra_avances.instancia is
  'Etapa libre de la obra al momento del avance ("demolición", "colocación", "pintura"...). Opcional — sin catálogo cerrado.';

alter table public.obra_avances enable row level security;
revoke all on public.obra_avances from anon;

-- Eze y el bot leen y registran avances; borrar es SOLO de Eze.
drop policy if exists "obra_avances_select_auth" on public.obra_avances;
create policy "obra_avances_select_auth" on public.obra_avances
  for select to authenticated using (true);

drop policy if exists "obra_avances_insert_auth" on public.obra_avances;
create policy "obra_avances_insert_auth" on public.obra_avances
  for insert to authenticated with check (true);

drop policy if exists "obra_avances_delete_no_bot" on public.obra_avances;
create policy "obra_avances_delete_no_bot" on public.obra_avances
  for delete to authenticated
  using (not public.es_bot());

-- ── Realtime: el avance que entra por WhatsApp aparece solo en la card ──────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'obra_avances'
  ) then
    alter publication supabase_realtime add table public.obra_avances;
  end if;
end $$;
