-- Maestro de precios: columnas SISMAT para comparación con tarifario externo.
-- Los campos manuales (costo_mo_m2, costo_materiales_m2) NUNCA se tocan desde acá.

alter table public.maestro_precios_items
  add column if not exists sismat_costo_mo   numeric(14, 2),
  add column if not exists sismat_match      text,
  add column if not exists sismat_actualizado date;

alter table public.maestro_precios_gestion
  add column if not exists sismat_ultima_sync date;
