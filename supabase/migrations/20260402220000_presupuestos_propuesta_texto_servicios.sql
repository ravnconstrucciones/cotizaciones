-- Texto comercial del constructor de propuesta (no regenerar al recargar).
alter table public.presupuestos
  add column if not exists propuesta_texto_servicios text null;

comment on column public.presupuestos.propuesta_texto_servicios is
  'Texto "Servicios a realizar" persistido en el constructor de propuesta comercial.';
