-- Descuento % por pago en efectivo (referencia comercial; no modifica precios unitarios congelados).
alter table public.presupuestos
  add column if not exists descuento_pago_efectivo_material_pct double precision not null default 0,
  add column if not exists descuento_pago_efectivo_mo_pct double precision not null default 0;

comment on column public.presupuestos.descuento_pago_efectivo_material_pct is
  'Descuento % si el cliente paga en efectivo, aplicado al subtotal de materiales (vista totales).';
comment on column public.presupuestos.descuento_pago_efectivo_mo_pct is
  'Descuento % si el cliente paga en efectivo, aplicado al subtotal de mano de obra (vista totales).';
