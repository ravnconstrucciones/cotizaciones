-- Portal del cliente (19/11/2026): tickets de compra de la obra.
--
-- Pedido de Eze: el cliente ve los tickets de lo que se compró para su obra.
-- Los gastos de la app (presupuestos_gastos) no guardan foto del comprobante
-- (0 de 202 al 19/11) y además mezclan mano de obra y costos internos, así que
-- los tickets NO salen de ahí: Eze sube cada ticket al portal, con su importe.
-- Es evidencia para el cliente, no un segundo libro: el gasto se sigue
-- registrando donde siempre.
--
-- Cambio aditivo y reversible: amplía el check de tipo y agrega dos columnas
-- opcionales. Las filas existentes no cambian.

alter table public.obra_portal_registros drop constraint if exists obra_portal_registros_tipo_check;
alter table public.obra_portal_registros
  add constraint obra_portal_registros_tipo_check
  check (tipo in ('avance','video','resuelto','material','ticket'));

alter table public.obra_portal_registros add column if not exists importe numeric(14,2)
  check (importe is null or importe >= 0);
alter table public.obra_portal_registros add column if not exists moneda text not null default 'ARS'
  check (moneda in ('ARS','USD'));

comment on column public.obra_portal_registros.importe is
  'Sólo tipo ticket: importe del comprobante. Informativo para el cliente, no es asiento contable.';
comment on column public.obra_portal_registros.moneda is
  'Moneda del importe del ticket (ARS o USD).';
