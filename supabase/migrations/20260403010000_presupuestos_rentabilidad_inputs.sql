-- Entradas del formulario Rentabilidad (remarques, bonificación, IVA, etc.) para no perderlas al navegar.
alter table public.presupuestos
  add column if not exists rentabilidad_inputs jsonb null;

comment on column public.presupuestos.rentabilidad_inputs is
  'Snapshot del formulario Rentabilidad y costos (remarques %, cargos, moneda, cierre manual de precio).';
