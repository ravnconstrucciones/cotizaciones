-- Postulantes de mano de obra — pedido 3 de Eze (16/08/2026).
--
-- Textual: "yo puedo poner mano de obra 1, mano de obra 2, mano de obra 3,
-- porque yo puedo hacer una investigación entre 3 proveedores y ver cuál es el
-- que me cobra más o menos… la que vale es la que yo voy a poner como la que me
-- cobran a mí".
--
-- La MO deja de ser un ítem más del rubro y pasa a ser un RUBRO PROPIO con una
-- lista ABIERTA de contendientes: presupuestos reales de proveedores CON NOMBRE
-- contra dos investigaciones (SISMAT e internet). Las investigaciones ya viven
-- en `desglose.items[].precios` y NO se duplican acá: esta tabla guarda sólo lo
-- que hoy no existe en ningún lado, que son los presupuestos que Eze consigue.
--
-- Dato del TALLER, no de la oficina: va al esquema propio del cotizador, al lado
-- de `cotizador_taller_items`. Al pasar el expediente a App RAVN viaja el
-- elegido (como precio cerrado del ítem de MO), nunca los descartados.
--
-- NO toca plata ni estado: no hay pata en `movimientos_plata` que asentar.

create table if not exists public.cotizador_taller_postulantes_mo (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones (id) on delete cascade,
  -- Rubro del visor (`QuoteBatch.id`), mismo criterio que cotizador_taller_items.
  rubro_id text not null,
  -- Ítem de mano de obra del rubro contra el que compite. Es el que el pase
  -- cierra si este postulante gana, por eso se guarda el nombre exacto.
  item_nombre text not null,
  proveedor text not null,
  -- Precio POR UNIDAD del ítem ($/m2, $/ml, $/global): la misma vara que
  -- `precios.sismat` y `precios.internet`, así el desvío se compara sin traducir.
  -- El total lo hace la multiplicación por la cantidad, no se guarda.
  precio_unit numeric not null check (precio_unit > 0),
  -- Cuándo consiguió el presupuesto: la antigüedad de la MO se mide igual que
  -- cualquier otro precio (VENCIMIENTO_DIAS.mano_de_obra = 30 días).
  fecha date not null,
  -- De dónde salió: "presupuesto por WhatsApp", "lo dijo en obra", etc.
  procedencia text,
  -- El que Eze marca como "el que me cobran a mí". Pisa el costo del ítem.
  elegido boolean not null default false,
  creado_at timestamptz not null default now()
);

comment on table public.cotizador_taller_postulantes_mo is
  'Presupuestos de mano de obra de proveedores con nombre, por rubro de una cotización. SISMAT e internet NO viven acá: son investigación y salen de desglose.items[].precios.';

create index if not exists cotizador_taller_postulantes_mo_cotizacion_idx
  on public.cotizador_taller_postulantes_mo (cotizacion_id, rubro_id, creado_at);

-- Un solo elegido por rubro: la base lo hace cumplir, no la UI. Si dos filas
-- quedaran marcadas, el costo del rubro sería ambiguo y el pase elegiría al azar.
create unique index if not exists cotizador_taller_postulantes_mo_elegido_unico
  on public.cotizador_taller_postulantes_mo (cotizacion_id, rubro_id)
  where elegido;

alter table public.cotizador_taller_postulantes_mo enable row level security;

-- Mismo criterio que las otras dos tablas del taller: autenticado sí, bot no.
create policy "taller_postulantes_select_no_bot" on public.cotizador_taller_postulantes_mo
  for select to authenticated using (not es_bot());
create policy "taller_postulantes_insert_auth" on public.cotizador_taller_postulantes_mo
  for insert to authenticated with check (true);
create policy "taller_postulantes_update_no_bot" on public.cotizador_taller_postulantes_mo
  for update to authenticated using (not es_bot()) with check (not es_bot());
create policy "taller_postulantes_delete_no_bot" on public.cotizador_taller_postulantes_mo
  for delete to authenticated using (not es_bot());
