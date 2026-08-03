-- Depósito / Inventario operativo.
-- Ubicaciones extensibles; las obras activas se sincronizan desde `obras`.

create table if not exists public.inventario_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('deposito', 'casa', 'obra', 'otro')),
  obra_id uuid references public.obras(id) on delete cascade,
  activa boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  unique (obra_id)
);

create table if not exists public.inventario_items (
  id uuid primary key default gen_random_uuid(),
  clave_seed text unique,
  nombre text not null,
  tipo text not null check (tipo in ('herramienta', 'material')),
  rubro text not null,
  cantidad numeric(12,3),
  unidad text,
  cantidad_texto text,
  ubicacion_id uuid not null references public.inventario_ubicaciones(id),
  estado_revision text not null default 'confirmado'
    check (estado_revision in ('confirmado', 'revisar_nombre', 'revisar_cantidad', 'revisar_duplicado', 'revisar_interpretacion')),
  nota_revision text,
  activo boolean not null default true,
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

create table if not exists public.inventario_movimientos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventario_items(id),
  origen_id uuid not null references public.inventario_ubicaciones(id),
  destino_id uuid not null references public.inventario_ubicaciones(id),
  cantidad numeric(12,3),
  unidad text,
  texto_original text,
  nota text,
  creado_por uuid default auth.uid(),
  creado_at timestamptz not null default now(),
  check (origen_id <> destino_id)
);

create index if not exists inventario_items_ubicacion_idx on public.inventario_items(ubicacion_id) where activo;
create index if not exists inventario_items_rubro_idx on public.inventario_items(rubro) where activo;
create index if not exists inventario_movimientos_fecha_idx on public.inventario_movimientos(creado_at desc);

drop trigger if exists inventario_ubicaciones_actualizado on public.inventario_ubicaciones;
create trigger inventario_ubicaciones_actualizado before update on public.inventario_ubicaciones
for each row execute function public.set_actualizado_at();
drop trigger if exists inventario_items_actualizado on public.inventario_items;
create trigger inventario_items_actualizado before update on public.inventario_items
for each row execute function public.set_actualizado_at();

alter table public.inventario_ubicaciones enable row level security;
alter table public.inventario_items enable row level security;
alter table public.inventario_movimientos enable row level security;
create policy "inventario ubicaciones usuario" on public.inventario_ubicaciones for all to authenticated using (not public.es_bot()) with check (not public.es_bot());
create policy "inventario items usuario" on public.inventario_items for all to authenticated using (not public.es_bot()) with check (not public.es_bot());
create policy "inventario movimientos usuario" on public.inventario_movimientos for all to authenticated using (not public.es_bot()) with check (not public.es_bot());

insert into public.inventario_ubicaciones (clave, nombre, tipo)
values ('deposito', 'Depósito', 'deposito'), ('casa-ezequiel', 'Casa de Ezequiel', 'casa')
on conflict (clave) do update set nombre = excluded.nombre, activa = true;

-- Primera carga: se conserva cada dictado dudoso y se marca explícitamente.
with d as (select id from public.inventario_ubicaciones where clave = 'deposito'), seed(clave,nombre,tipo,rubro,cantidad,unidad,cantidad_texto,estado,nota) as (values
('lampara-negra','Lámpara negra','material','iluminacion',1,'unidad',null,'confirmado',null),
('despertador-led','Despertador de color LED','material','iluminacion',1,'unidad',null,'revisar_interpretacion','Confirmar si es un artefacto de iluminación o un despertador.'),
('cargador-luminico','Cargador lumínico','material','iluminacion',1,'unidad',null,'revisar_nombre','Nombre dictado a confirmar.'),
('tira-led','Tira LED','material','iluminacion',3,'m',null,'confirmado',null),
('rodillo','Rodillo','herramienta','pintura',1,'unidad',null,'confirmado',null),
('pincel','Pincel','herramienta','pintura',1,'unidad',null,'confirmado',null),
('batea','Batea','herramienta','pintura',1,'unidad',null,'confirmado',null),
('rodillos-pelo-largo','Rodillo de pelo largo','herramienta','pintura',2,'unidad',null,'confirmado',null),
('z10','Z10','material','pintura',4,'L',null,'confirmado',null),
('fijador','Fijador','material','pintura',1,'L',null,'confirmado',null),
('satinado-agua','Satinado al agua','material','pintura',1,'L',null,'confirmado',null),
('cintas-pintor','Cinta de pintor','material','pintura',3,'unidad',null,'confirmado',null),
('enduido','Enduido','material','pintura',30,'kg',null,'revisar_cantidad','Total inferido de tres registros de 10 kg; confirmar.'),
('aguarras-empezado','Aguarrás — bidón empezado','material','pintura',1,'bidón',null,'revisar_cantidad','Bidón empezado; falta cantidad remanente.'),
('aguarras-adicional','Aguarrás adicional','material','pintura',null,null,'cantidad sin definir','revisar_cantidad','Cantidad adicional dictada sin definir.'),
('thinner','Thinner','material','pintura',1,'bidón',null,'confirmado',null),
('balde-vacio','Balde vacío','herramienta','pintura',1,'unidad',null,'revisar_interpretacion','Interpretación probable del dictado “vale vacío”.'),
('latex-imprimador-sw','Látex imprimador Sherwin-Williams','material','pintura',15,'L','aprox. 15 L','revisar_cantidad','Cantidad aproximada.'),
('liston-celeste','Listón celeste','material','revestimientos',1,'m²',null,'confirmado',null),
('liston-rosa','Listón rosa','material','revestimientos',1,'m²',null,'confirmado',null),
('guardacanto','Guardacanto','material','revestimientos',2,'m',null,'confirmado',null),
('pastina-sin-cantidad','Pastina','material','revestimientos',null,null,'cantidad sin definir','revisar_cantidad','Tipo y cantidad sin definir.'),
('pastina-weber','Pastina Weber gris perla','material','revestimientos',5,'kg',null,'confirmado',null),
('base-cobalt','Base Cobalt','material','revestimientos',25,'kg',null,'revisar_duplicado','Posible duplicado de “una bolsa”; confirmar.'),
('silicona-medusar','Silicona — uso por confirmar','material','revestimientos',1,'unidad',null,'revisar_nombre','Dictado original: “silicona para medusar”.'),
('caja-hexagonal','Caja hexagonal','material','electricidad',2,'unidad',null,'confirmado',null),
('caja-rectangular','Caja rectangular','material','electricidad',2,'unidad',null,'confirmado',null),
('cable-rojo','Cable rojo','material','electricidad',2,'m',null,'confirmado',null),
('cable-azul','Cable azul','material','electricidad',1,'m',null,'confirmado',null),
('cable-yute','Cable tipo yute','material','electricidad',0.5,'m',null,'confirmado',null),
('corrugado','Caño corrugado','material','electricidad',3,'m',null,'confirmado',null),
('sellarroscas','Sellarroscas','material','plomeria-sanitaria',2,'unidad',null,'confirmado',null),
('rejilla-11','Rejilla 11 × 11 cm','material','plomeria-sanitaria',1,'unidad',null,'confirmado',null),
('codos-ecuador','Codos — tipo por confirmar','material','plomeria-sanitaria',null,null,'cantidad sin definir','revisar_nombre','Dictado dudoso: “codos Ecuador”; confirmar tipo y cantidad.'),
('yeso','Yeso','material','albanileria-construccion-seco',20,'kg',null,'confirmado',null),
('arena','Arena','material','albanileria-construccion-seco',2,'bolsa',null,'confirmado',null),
('cemento','Cemento','material','albanileria-construccion-seco',1,'bolsa',null,'confirmado',null),
('pala-punta','Pala de punta','herramienta','albanileria-construccion-seco',1,'unidad',null,'confirmado',null),
('estructura-cielorraso','Estructura para cielorraso','material','albanileria-construccion-seco',null,null,'cantidad sin definir','revisar_cantidad','Cantidad por confirmar.'),
('bomba-vacio','Bomba de vacío','herramienta','herramientas-mantenimiento',1,'unidad',null,'confirmado',null),
('wd40','WD-40','material','herramientas-mantenimiento',1,'unidad',null,'confirmado',null),
('nivel','Nivel','herramienta','herramientas-mantenimiento',1,'unidad',null,'confirmado',null),
('pistola-silicona','Pistola de silicona','herramienta','herramientas-mantenimiento',1,'unidad',null,'confirmado',null),
('llana','Llana','herramienta','herramientas-mantenimiento',1,'unidad',null,'confirmado',null),
('cascos','Casco','herramienta','seguridad',2,'unidad',null,'confirmado',null),
('pintura-silagras-quantum','Pintura “para silagras o Quantum”','material','pendiente-revision',4,'L',null,'revisar_nombre','Conservar dictado y confirmar producto/uso.'),
('cervecita','“Cervecita”','material','pendiente-revision',4,'L',null,'revisar_nombre','Término dictado pendiente de interpretar.'),
('borrugada','“Borrugada”','material','pendiente-revision',null,null,'un poquito','revisar_nombre','Término y cantidad dictados pendientes de interpretar.')
)
insert into public.inventario_items (clave_seed,nombre,tipo,rubro,cantidad,unidad,cantidad_texto,estado_revision,nota_revision,ubicacion_id)
select clave,nombre,tipo,rubro,cantidad,unidad,cantidad_texto,estado,nota,d.id from seed cross join d
on conflict (clave_seed) do nothing;

comment on table public.inventario_movimientos is 'Historial inmutable de traslados confirmados entre ubicaciones.';

-- Movimiento atómico: bloquea el ítem, valida origen y escribe historial + stock.
create or replace function public.mover_inventario_item(
  p_item_id uuid, p_origen_id uuid, p_destino_id uuid,
  p_texto_original text default null, p_nota text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_item public.inventario_items%rowtype; v_movimiento uuid;
begin
  if p_origen_id = p_destino_id then raise exception 'Origen y destino deben ser distintos'; end if;
  select * into v_item from public.inventario_items where id = p_item_id and activo for update;
  if not found then raise exception 'El ítem no existe'; end if;
  if v_item.ubicacion_id <> p_origen_id then raise exception 'La ubicación del ítem cambió'; end if;
  insert into public.inventario_movimientos (item_id,origen_id,destino_id,cantidad,unidad,texto_original,nota)
  values (v_item.id,p_origen_id,p_destino_id,v_item.cantidad,v_item.unidad,left(p_texto_original,500),left(p_nota,500)) returning id into v_movimiento;
  update public.inventario_items set ubicacion_id = p_destino_id where id = v_item.id;
  return v_movimiento;
end $$;
revoke all on function public.mover_inventario_item(uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.mover_inventario_item(uuid,uuid,uuid,text,text) to authenticated;
