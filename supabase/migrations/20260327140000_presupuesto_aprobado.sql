-- Marca manual en historial: solo aprobados entran en Control de gastos y pueden cargar gastos.
alter table public.presupuestos
  add column if not exists presupuesto_aprobado boolean not null default false;

comment on column public.presupuestos.presupuesto_aprobado is
  'Si true, el presupuesto aparece en Control de gastos y se permite registrar gastos de obra.';
