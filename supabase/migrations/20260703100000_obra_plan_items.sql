-- obra_plan_items: plan de compra real de la obra (spec 2026-07-03 plan-compra-cruce).
-- Foto 2 del ciclo cotizado → plan → real. Se siembra desde cotizaciones.desglose
-- al aprobar (loop de oro) y Eze lo edita en /obras/[id]/plan. Los gastos reales
-- se cruzan vía presupuestos_gastos.plan_item_id (opcional, nunca obligatorio).
-- Clave por presupuesto_id: convención del repo (/obras/[id] = presupuestos.id).

create table if not exists public.obra_plan_items (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  cotizacion_id uuid references public.cotizaciones(id),
  origen text not null default 'manual' check (origen in ('cotizacion','manual')),
  tipo text not null check (tipo in ('material','mano_de_obra','extra')),
  nombre text not null,
  etapa text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  incluido boolean not null default true,
  notas text,
  -- Snapshot congelado del ítem cotizado (null en origen 'manual'). La UI jamás
  -- lo edita: es la evidencia de lo que se le cobró al cliente.
  cotizado jsonb
);

create index if not exists obra_plan_items_presupuesto_idx
  on public.obra_plan_items (presupuesto_id, creado_at);

comment on table public.obra_plan_items is
  'Plan de compra real por obra. origen=cotizacion nace del desglose (con snapshot cotizado congelado) y no se borra, solo se excluye; origen=manual es agregado de Eze.';

alter table public.obra_plan_items enable row level security;
revoke all on public.obra_plan_items from anon;

create policy "obra_plan_items_select_auth" on public.obra_plan_items
  for select to authenticated using (true);

create policy "obra_plan_items_insert_no_bot" on public.obra_plan_items
  for insert to authenticated with check (not public.es_bot());

create policy "obra_plan_items_update_no_bot" on public.obra_plan_items
  for update to authenticated
  using (not public.es_bot()) with check (not public.es_bot());

create policy "obra_plan_items_delete_no_bot" on public.obra_plan_items
  for delete to authenticated using (not public.es_bot());

-- Vínculo opcional gasto → ítem del plan. on delete set null: si el ítem
-- desaparece, el gasto vuelve a "sin asignar", nunca se pierde.
alter table public.presupuestos_gastos
  add column if not exists plan_item_id uuid references public.obra_plan_items(id) on delete set null;

create index if not exists presupuestos_gastos_plan_item_idx
  on public.presupuestos_gastos (plan_item_id) where plan_item_id is not null;
