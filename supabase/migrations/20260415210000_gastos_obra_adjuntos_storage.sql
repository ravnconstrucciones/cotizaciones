-- Adjuntos de gastos (foto / audio) en Storage + columnas en presupuestos_gastos.

alter table public.presupuestos_gastos
  add column if not exists adjunto_path text null;

alter table public.presupuestos_gastos
  add column if not exists adjunto_kind text null;

alter table public.presupuestos_gastos
  drop constraint if exists presupuestos_gastos_adjunto_kind_chk;

alter table public.presupuestos_gastos
  add constraint presupuestos_gastos_adjunto_kind_chk
  check (adjunto_kind is null or adjunto_kind in ('foto', 'audio'));

comment on column public.presupuestos_gastos.adjunto_path is
  'Ruta del objeto en el bucket storage `gastos-obra` (presupuesto_id/gasto_id/archivo).';

comment on column public.presupuestos_gastos.adjunto_kind is
  'Tipo de adjunto: foto o audio.';

insert into storage.buckets (id, name, public, file_size_limit)
values ('gastos-obra', 'gastos-obra', true, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- Políticas: app sin login (anon); bucket dedicado solo a gastos-obra.
drop policy if exists "gastos_obra_select" on storage.objects;
drop policy if exists "gastos_obra_insert" on storage.objects;
drop policy if exists "gastos_obra_delete" on storage.objects;

create policy "gastos_obra_select"
  on storage.objects for select
  to public
  using (bucket_id = 'gastos-obra');

create policy "gastos_obra_insert"
  on storage.objects for insert
  to public
  with check (bucket_id = 'gastos-obra');

create policy "gastos_obra_delete"
  on storage.objects for delete
  to public
  using (bucket_id = 'gastos-obra');
