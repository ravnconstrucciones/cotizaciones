-- Puerta de entrada del cotizador (spec 2026-08-17): la propuesta de
-- reconocimiento es dato del TALLER (antes del número). Una fila por
-- cotización; el bridge local escribe la propuesta por PostgREST (service
-- role), el visor la lee por su /api/intake. Nada acá toca plata ni estado
-- de cotizaciones: eso entra por endpoints de App RAVN.
create table if not exists public.cotizador_intake (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  estado text not null default 'esperando_ola'
    check (estado in ('esperando_ola', 'propuesta_lista', 'confirmada', 'error')),
  -- Lo que tipeó/dictó Eze al entrar (además de los archivos adjuntos).
  texto text,
  -- PropuestaReconocimiento (contrato en apps/cotizador-ravn/src/bridge/intake-contract.ts).
  propuesta jsonb,
  -- Motivo cuando estado = 'error' (archivo ilegible, JSON inválido de la ola…).
  error text,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create unique index if not exists cotizador_intake_cotizacion_uidx
  on public.cotizador_intake (cotizacion_id);

comment on table public.cotizador_intake is
  'Puerta de entrada del Cotizador RAVN: propuesta de reconocimiento de la ola de intake, pendiente de confirmación de Eze. on delete cascade: si se borra la cotización se va su intake.';

alter table public.cotizador_intake enable row level security;
revoke all on public.cotizador_intake from anon;

-- Mismo criterio que cotizador_taller_items: autenticado sí, bot no. El
-- Cotizador standalone y el bridge escriben con service role.
create policy "cotizador_intake_select_no_bot" on public.cotizador_intake
  for select to authenticated using (not es_bot());
create policy "cotizador_intake_insert_auth" on public.cotizador_intake
  for insert to authenticated with check (true);
create policy "cotizador_intake_update_no_bot" on public.cotizador_intake
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy "cotizador_intake_delete_no_bot" on public.cotizador_intake
  for delete to authenticated using (not es_bot());

-- La maquinaria es tipo nuevo del motor (alquiler entra al plan de compra con
-- precio; propia se lista para logística sin precio). El check del plan la
-- tiene que dejar pasar cuando importarPlanDesdeCotizacion siembra la obra.
alter table public.obra_plan_items
  drop constraint if exists obra_plan_items_tipo_check;
alter table public.obra_plan_items
  add constraint obra_plan_items_tipo_check
  check (tipo in ('material', 'mano_de_obra', 'maquinaria', 'extra'));
