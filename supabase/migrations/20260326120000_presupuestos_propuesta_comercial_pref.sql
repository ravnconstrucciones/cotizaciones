-- Preferencias de rentabilidad / propuesta comercial (sincronizadas en cualquier dispositivo).
alter table public.presupuestos
  add column if not exists propuesta_comercial_pref jsonb null;

comment on column public.presupuestos.propuesta_comercial_pref is
  'JSON v1: moneda ARS|USD, cotización venta, precio sin IVA redondeado, IVA exacto, etc.';
