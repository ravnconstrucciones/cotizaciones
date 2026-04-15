-- Caja: presupuesto + obra ficticios solo para movimientos de empresa (no obra de cliente).
-- No entra en historial (pdf_generado false) ni en control de gastos (mismo filtro).

alter table public.presupuestos
  add column if not exists libreta_caja_empresa boolean not null default false;

comment on column public.presupuestos.libreta_caja_empresa is
  'Si true: fila reservada para libreta de caja general (gastos/ingresos no imputados a una obra).';

insert into public.presupuestos (
  nombre_obra,
  nombre_cliente,
  domicilio,
  fecha,
  ajuste_total_obra_pct,
  estado,
  presupuesto_aprobado,
  pdf_generado,
  libreta_caja_empresa
)
select
  'Empresa (gastos generales)',
  'Caja empresa',
  '—',
  (timezone('America/Argentina/Buenos_Aires', now()))::date,
  0,
  'borrador',
  true,
  false,
  true
where not exists (
  select 1 from public.presupuestos p where p.libreta_caja_empresa = true
);
