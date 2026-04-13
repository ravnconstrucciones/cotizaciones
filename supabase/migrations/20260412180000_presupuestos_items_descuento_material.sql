-- Descuento % por línea sobre subtotal de materiales (precio unitario sigue siendo lista).
alter table public.presupuestos_items
  add column if not exists descuento_material_pct double precision not null default 0;

comment on column public.presupuestos_items.descuento_material_pct is
  'Descuento % aplicado al subtotal de materiales de la línea (cantidad × precio material lista).';
