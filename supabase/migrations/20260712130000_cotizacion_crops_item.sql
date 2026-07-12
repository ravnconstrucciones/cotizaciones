-- Recortes del render por ítem (Tramo B ítem 5): cada fila tipo 'crop_item'
-- en cotizacion_archivos referencia el ítem del desglose por su nombre
-- (los ítems no tienen id; el nombre es la clave que ya usa toda la mesa).
alter table public.cotizacion_archivos add column if not exists item_nombre text;

-- Un solo recorte vigente por ítem de cada cotización.
create unique index if not exists cotizacion_archivos_crop_unico
  on public.cotizacion_archivos (cotizacion_id, item_nombre)
  where tipo = 'crop_item';
