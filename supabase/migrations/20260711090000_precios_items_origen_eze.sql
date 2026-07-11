-- Origen 'eze' en precios_items (Tramo B, hoja viva): el precio corregido por
-- Eze en la mesa de revisión se escribe al cache como origen propio, con fecha.
-- Regla de oro: la mesa calibra al cotizador — en la próxima cotización ese
-- precio PISA el rango (instanciar.ts) con su traza visible.
-- Aplicada a prod el 11/07/2026 vía MCP (apply_migration precios_items_origen_eze).
alter table public.precios_items
  drop constraint precios_items_origen_check;
alter table public.precios_items
  add constraint precios_items_origen_check
  check (origen in ('sismat', 'internet', 'retail', 'eze'));
