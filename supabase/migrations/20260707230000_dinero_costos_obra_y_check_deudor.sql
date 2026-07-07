-- Fase 3 módulo Dinero — review wave 2 (verificador adversarial 07/07):
--
-- 1) Vista agregada de costo por obra. /api/dinero traía presupuestos_gastos
--    entera para sumar en JS: PostgREST capea en 1000 filas por default, así
--    que al crecer la tabla el costo se subcontaba EN SILENCIO (y encima se
--    transfería toda la tabla en cada carga de la home). El group by va en
--    la base, donde corresponde.
create view public.dinero_costos_obra
  with (security_invoker = true) as
select
  presupuesto_id,
  sum(importe) as costo
from public.presupuestos_gastos
where presupuesto_id is not null
group by presupuesto_id;

comment on view public.dinero_costos_obra is
  'Costo total por obra (Σ presupuestos_gastos.importe, ARS por convención). La consume /api/dinero para la composición del financiamiento.';

-- 2) Un dueño no puede deberse a sí mismo. Sin este check, un parseo malo
--    del bot podía crear "RAVN debe a RAVN" y la composición contaría a la
--    obra financiándose sola. Verificado 07/07: cero filas violando.
alter table public.financiamientos
  add constraint financiamientos_deudor_distinto_acreedor
  check ((deudor_tipo, deudor_obra_id) is distinct from (acreedor_tipo, acreedor_obra_id));
