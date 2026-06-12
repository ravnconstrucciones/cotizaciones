-- cotizador_lecciones: memoria de los loops de mejora del cotizador
-- (contrato Centro de Mando 2026-06-11).
-- contraste_obra = cotizado vs gastado real al cerrar obra; auto_critica = revisor
-- post-cotización; rechazo = motivo cuando Eze rechaza en la mesa.

create table if not exists public.cotizador_lecciones (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  tipo text not null check (tipo in ('contraste_obra','auto_critica','rechazo')),
  receta_nombre text,
  cotizacion_id uuid references public.cotizaciones(id),
  obra_presupuesto_id uuid references public.presupuestos(id),
  leccion text not null,
  ajuste jsonb
);

create index if not exists cotizador_lecciones_receta_idx
  on public.cotizador_lecciones (receta_nombre, creado_at desc);

create index if not exists cotizador_lecciones_tipo_idx
  on public.cotizador_lecciones (tipo);

comment on table public.cotizador_lecciones is
  'Lecciones que se inyectan en la próxima cotización. ajuste = JSON con coeficientes corregidos (desperdicio, rendimiento, tiempos).';

alter table public.cotizador_lecciones enable row level security;
revoke all on public.cotizador_lecciones from anon;

-- RLS enmienda 2026-06-11: el bot solo INSERTA (el rechazo por WhatsApp deja una
-- lección tipo 'rechazo'). Leer, editar y borrar: solo Eze/daemon.
drop policy if exists "cotizador_lecciones_select_no_bot" on public.cotizador_lecciones;
create policy "cotizador_lecciones_select_no_bot" on public.cotizador_lecciones
  for select to authenticated
  using (not public.es_bot());

drop policy if exists "cotizador_lecciones_insert_auth" on public.cotizador_lecciones;
create policy "cotizador_lecciones_insert_auth" on public.cotizador_lecciones
  for insert to authenticated
  with check (true);

drop policy if exists "cotizador_lecciones_update_no_bot" on public.cotizador_lecciones;
create policy "cotizador_lecciones_update_no_bot" on public.cotizador_lecciones
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

drop policy if exists "cotizador_lecciones_delete_no_bot" on public.cotizador_lecciones;
create policy "cotizador_lecciones_delete_no_bot" on public.cotizador_lecciones
  for delete to authenticated
  using (not public.es_bot());
