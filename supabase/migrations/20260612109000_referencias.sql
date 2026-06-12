-- referencias: ADN de Ravn — filosofía (frases/reflexiones) y estética (fotos
-- etiquetadas en el bucket `referencias`). Contrato Centro de Mando 2026-06-11.

create table if not exists public.referencias (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('filosofia','estetica')),
  texto text,
  etiquetas text[] not null default '{}',
  fuente text,
  imagen_path text,
  evento_id uuid references public.eventos(id)
);

create index if not exists referencias_tipo_idx
  on public.referencias (tipo, creado_at desc);

create index if not exists referencias_etiquetas_idx
  on public.referencias using gin (etiquetas);

comment on table public.referencias is
  'Capturas de ADN vía bot: tipo=filosofia (texto + fuente) o tipo=estetica (imagen_path al bucket privado `referencias` + etiquetas de la IA). Alimenta el moodboard del tablero.';

alter table public.referencias enable row level security;
revoke all on public.referencias from anon;

drop policy if exists "referencias_select_auth" on public.referencias;
create policy "referencias_select_auth" on public.referencias
  for select to authenticated using (true);

drop policy if exists "referencias_insert_auth" on public.referencias;
create policy "referencias_insert_auth" on public.referencias
  for insert to authenticated with check (true);

drop policy if exists "referencias_update_no_bot" on public.referencias;
create policy "referencias_update_no_bot" on public.referencias
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "referencias_delete_no_bot" on public.referencias;
create policy "referencias_delete_no_bot" on public.referencias
  for delete to authenticated
  using (not public.es_bot());
