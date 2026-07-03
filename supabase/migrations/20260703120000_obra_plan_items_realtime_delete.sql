-- Hallazgos del code-review 2026-07-03 (feature plan de compra):
-- 1) obra_plan_items no estaba en la publicación realtime → useRealtimeTable
--    en /obras/[id]/plan no recibía ningún evento (falla silenciosa).
-- 2) La policy de DELETE solo pedía not es_bot(): el invariante "los ítems
--    origen=cotizacion no se borran, solo se excluyen" vivía únicamente en la
--    UI. Se baja a la DB; el cascade por presupuesto no pasa por RLS, así que
--    borrar una obra entera sigue limpiando su plan.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'obra_plan_items'
  ) then
    alter publication supabase_realtime add table public.obra_plan_items;
  end if;
end $$;

drop policy if exists "obra_plan_items_delete_no_bot" on public.obra_plan_items;
create policy "obra_plan_items_delete_no_bot" on public.obra_plan_items
  for delete to authenticated
  using (not public.es_bot() and origen = 'manual');
