-- Cotización venta (ARS/US$1) al momento de cargar cada gasto; presupuestos en USD.
alter table public.presupuestos_gastos
  add column if not exists cotizacion_venta_ars_por_usd numeric(14, 4),
  add column if not exists casa_dolar text;

comment on column public.presupuestos_gastos.cotizacion_venta_ars_por_usd is
  'Tipo venta ARS por US$ 1 usado para pasar el importe en pesos a USD (referencia Cronista/API).';

comment on column public.presupuestos_gastos.casa_dolar is
  'Identificador de casa (oficial, blue, …) elegida al cargar el gasto.';
