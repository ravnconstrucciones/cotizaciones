-- movimientos_plata: LEDGER del módulo Dinero (spec 2026-07-06). Fuente de
-- verdad futura de saldos: cada operación = 1..n filas con el mismo grupo_id
-- (volquete: -90k bolsillo obra Palermo en MP y -60k bolsillo personal en MP).
-- Solo estado='asentado' suma; el bot escribe 'borrador' y el "confirmo" de
-- Eze asienta el grupo entero (RPC en Fase 2). El código suma; la IA no.

create table public.movimientos_plata (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  cuenta_id uuid not null references public.cuentas (id),
  -- Dueño del bolsillo: de quién es esta plata DENTRO de la cuenta.
  dueno_tipo text not null check (dueno_tipo in ('obra', 'empresa', 'personal')),
  dueno_obra_id uuid references public.presupuestos (id),
  -- Con signo, SIEMPRE en la moneda de la cuenta. moneda es redundante a
  -- propósito: valida consistencia (Task 4 y un check acá abajo vía trigger NO
  -- — se valida en app/RPC; el check duro de BD es dueño-coherencia).
  monto numeric not null check (monto <> 0),
  moneda text not null check (moneda in ('ARS', 'USD')),
  -- Solo si la operación cruzó moneda (la declara Eze, nunca se inventa).
  cotizacion_ars_por_usd numeric check (cotizacion_ars_por_usd > 0),
  -- Agrupa las patas de una misma operación; se asienta ATÓMICO por grupo.
  grupo_id uuid not null,
  origen_tipo text not null check (origen_tipo in (
    'gasto_obra', 'gasto_empresa', 'gasto_personal', 'cobro', 'transferencia',
    'financiamiento_devolucion', 'retiro', 'ajuste', 'foto_inicial', 'cierre_obra'
  )),
  -- Fila de la tabla de detalle que espeja (presupuestos_gastos, gastos_empresa,
  -- gastos_personales, cashflow_items, transferencias, retiros_socio,
  -- cuenta_ajustes). Sin FK: apunta a tablas distintas según origen_tipo.
  origen_id uuid,
  estado text not null default 'borrador' check (estado in ('borrador', 'asentado')),
  descripcion text not null default '',
  -- Trazabilidad WhatsApp (mensaje que originó la operación).
  evento_id uuid references public.eventos (id),
  created_at timestamptz not null default now(),
  constraint movimientos_plata_dueno_obra_coherente
    check ((dueno_tipo = 'obra') = (dueno_obra_id is not null))
);

comment on table public.movimientos_plata is
  'Ledger del módulo Dinero: bolsillos por dueño (obra/empresa/personal) dentro de cada cuenta. Solo asentado suma a saldos; grupo_id agrupa las patas de una operación y se asienta atómico.';

create index movimientos_plata_cuenta_estado_idx
  on public.movimientos_plata (cuenta_id, estado);
create index movimientos_plata_grupo_idx
  on public.movimientos_plata (grupo_id);
create index movimientos_plata_dueno_idx
  on public.movimientos_plata (dueno_tipo, dueno_obra_id);

alter table public.movimientos_plata enable row level security;

-- Estilo de la casa (cuenta_ajustes): leer/insertar cualquiera autenticado;
-- editar/borrar solo la app. El bot ASIENTA por RPC security definer (Fase 2),
-- nunca por UPDATE directo.
create policy movimientos_plata_select_auth on public.movimientos_plata
  for select to authenticated using (true);
create policy movimientos_plata_insert_auth on public.movimientos_plata
  for insert to authenticated with check (true);
create policy movimientos_plata_update_no_bot on public.movimientos_plata
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy movimientos_plata_delete_no_bot on public.movimientos_plata
  for delete to authenticated using (not es_bot());

-- Vista de bolsillos: saldo vivo por (cuenta, dueño). Solo asentados.
create view public.dinero_saldos_bolsillos
  with (security_invoker = true) as
select
  cuenta_id,
  dueno_tipo,
  dueno_obra_id,
  moneda,
  sum(monto) as saldo,
  count(*) as movimientos
from public.movimientos_plata
where estado = 'asentado'
group by cuenta_id, dueno_tipo, dueno_obra_id, moneda;

comment on view public.dinero_saldos_bolsillos is
  'Saldo por bolsillo (cuenta × dueño), solo movimientos asentados. El saldo de una cuenta es la suma de sus bolsillos.';
