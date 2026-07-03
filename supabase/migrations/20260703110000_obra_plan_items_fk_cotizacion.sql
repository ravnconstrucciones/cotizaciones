-- Fix detectado en E2E 2026-07-03: la FK obra_plan_items.cotizacion_id (restrict
-- por defecto) bloqueaba borrar una cotización que ya sembró plan. El plan de la
-- obra debe sobrevivir a la cotización: on delete set null (el snapshot cotizado
-- ya vive congelado en la columna jsonb `cotizado`, no depende de la FK).

alter table public.obra_plan_items
  drop constraint if exists obra_plan_items_cotizacion_id_fkey;

alter table public.obra_plan_items
  add constraint obra_plan_items_cotizacion_id_fkey
  foreign key (cotizacion_id) references public.cotizaciones(id) on delete set null;
