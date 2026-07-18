-- Papelera universal (pedido Eze 18/07: "poder revertir para no perder todo").
-- Antes de un delete DURO de una fila de plata, la app archiva acá la fila
-- completa en JSON. Restaurar = reinsertar la fila + re-sincronizar el espejo
-- del ledger. Hoy la usa presupuestos_gastos (gastos de obra); el diseño es
-- genérico para sumar otras tablas sin migrar de nuevo.
create table public.papelera_registros (
  id uuid primary key default gen_random_uuid(),
  tabla text not null,
  registro_id uuid not null,
  registro jsonb not null,
  contexto text,
  borrado_at timestamptz not null default now(),
  restaurado_at timestamptz
);
comment on table public.papelera_registros is
  'Papelera universal: fila completa (jsonb) archivada ANTES de un delete duro (hoy: presupuestos_gastos). Restaurar reinserta y re-espeja el ledger; restaurado_at marca que volvió.';

create index papelera_registros_tabla_idx
  on public.papelera_registros (tabla, borrado_at desc);
create index papelera_registros_registro_idx
  on public.papelera_registros (registro_id);

alter table public.papelera_registros enable row level security;
create policy papelera_select_auth on public.papelera_registros
  for select to authenticated using (true);
create policy papelera_insert_auth on public.papelera_registros
  for insert to authenticated with check (true);
create policy papelera_update_no_bot on public.papelera_registros
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy papelera_delete_no_bot on public.papelera_registros
  for delete to authenticated using (not es_bot());
