-- /gasto: marcador explícito + undo/restore atómicos con Caja, ledger y Papelera.

alter table public.presupuestos_gastos
  add column if not exists origen_carga text null;
alter table public.gastos_empresa
  add column if not exists origen_carga text null;
alter table public.gastos_personales
  add column if not exists origen_carga text null;
alter table public.papelera_registros
  add column if not exists vinculos jsonb not null default '{}'::jsonb;

alter table public.presupuestos_gastos
  drop constraint if exists presupuestos_gastos_origen_carga_check;
alter table public.presupuestos_gastos
  add constraint presupuestos_gastos_origen_carga_check
  check (origen_carga is null or origen_carga = 'gasto_rapido_v2');

alter table public.gastos_empresa
  drop constraint if exists gastos_empresa_origen_carga_check;
alter table public.gastos_empresa
  add constraint gastos_empresa_origen_carga_check
  check (origen_carga is null or origen_carga = 'gasto_rapido_v2');

alter table public.gastos_personales
  drop constraint if exists gastos_personales_origen_carga_check;
alter table public.gastos_personales
  add constraint gastos_personales_origen_carga_check
  check (origen_carga is null or origen_carga = 'gasto_rapido_v2');

create index if not exists presupuestos_gastos_rapidos_recientes_idx
  on public.presupuestos_gastos (created_at desc, id desc)
  where origen_carga = 'gasto_rapido_v2';
create index if not exists gastos_empresa_rapidos_recientes_idx
  on public.gastos_empresa (created_at desc, id desc)
  where origen_carga = 'gasto_rapido_v2';
create index if not exists gastos_personales_rapidos_recientes_idx
  on public.gastos_personales (created_at desc, id desc)
  where origen_carga = 'gasto_rapido_v2';

create unique index if not exists papelera_registros_un_activo_idx
  on public.papelera_registros (tabla, registro_id)
  where restaurado_at is null;

create or replace function public.gasto_rapido_deshacer(
  p_tipo text,
  p_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tabla text;
  v_origen_tipo text;
  v_registro jsonb;
  v_cashflow jsonb;
  v_cashflow_id uuid;
  v_ledger jsonb := '[]'::jsonb;
  v_papelera_id uuid;
  v_filas integer;
begin
  case p_tipo
    when 'obra' then
      v_tabla := 'presupuestos_gastos';
      v_origen_tipo := 'gasto_obra';
      select pg_catalog.to_jsonb(g) into v_registro
      from public.presupuestos_gastos g
      where g.id = p_id
      for update;
    when 'empresa' then
      v_tabla := 'gastos_empresa';
      v_origen_tipo := 'gasto_empresa';
      select pg_catalog.to_jsonb(g) into v_registro
      from public.gastos_empresa g
      where g.id = p_id
      for update;
    when 'personal' then
      v_tabla := 'gastos_personales';
      v_origen_tipo := 'gasto_personal';
      select pg_catalog.to_jsonb(g) into v_registro
      from public.gastos_personales g
      where g.id = p_id
      for update;
    else
      return pg_catalog.jsonb_build_object('estado', 'no_habilitado');
  end case;

  if v_registro is null then
    select p.id into v_papelera_id
    from public.papelera_registros p
    where p.tabla = v_tabla
      and p.registro_id = p_id
      and p.restaurado_at is null
      and p.registro->>'origen_carga' = 'gasto_rapido_v2'
    limit 1;
    if v_papelera_id is not null then
      return pg_catalog.jsonb_build_object(
        'estado', 'ya_deshacido', 'papelera_id', v_papelera_id
      );
    end if;
    return pg_catalog.jsonb_build_object('estado', 'no_encontrado');
  end if;

  if v_registro->>'origen_carga' is distinct from 'gasto_rapido_v2' then
    return pg_catalog.jsonb_build_object('estado', 'no_habilitado');
  end if;

  if p_tipo = 'obra' then
    v_cashflow_id := nullif(v_registro->>'cashflow_item_id', '')::uuid;
    if v_cashflow_id is not null then
      select pg_catalog.to_jsonb(c) into v_cashflow
      from public.cashflow_items c
      where c.id = v_cashflow_id
      for update;
      if v_cashflow is null then
        raise exception 'cashflow vinculado inexistente para gasto %', p_id;
      end if;
      if v_cashflow->>'tipo' is distinct from 'egreso'
         or v_cashflow->>'notas' is distinct from 'RAVN_GASTO_OBRA' then
        raise exception 'cashflow % no es espejo RAVN_GASTO_OBRA', v_cashflow_id;
      end if;
    end if;
  end if;

  perform 1
  from public.movimientos_plata m
  where (m.origen_id = p_id and m.origen_tipo = v_origen_tipo)
     or (v_cashflow_id is not null
         and m.origen_id = v_cashflow_id
         and m.origen_tipo = 'gasto_obra')
  for update;

  if exists (
    select 1
    from public.movimientos_plata m
    join public.financiamientos f on f.origen_grupo_id = m.grupo_id
    where (m.origen_id = p_id and m.origen_tipo = v_origen_tipo)
       or (v_cashflow_id is not null
           and m.origen_id = v_cashflow_id
           and m.origen_tipo = 'gasto_obra')
  ) then
    raise exception 'el gasto % tiene un grupo con financiamiento', p_id;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at, m.id),
    '[]'::jsonb
  ) into v_ledger
  from public.movimientos_plata m
  where (m.origen_id = p_id and m.origen_tipo = v_origen_tipo)
     or (v_cashflow_id is not null
         and m.origen_id = v_cashflow_id
         and m.origen_tipo = 'gasto_obra');

  insert into public.papelera_registros
    (tabla, registro_id, registro, contexto, vinculos)
  values
    (
      v_tabla,
      p_id,
      v_registro,
      concat_ws(
        ' · ',
        nullif(pg_catalog.btrim(coalesce(v_registro->>'descripcion', v_registro->>'concepto', '')), ''),
        coalesce(v_registro->>'importe', v_registro->>'monto')
      ),
      pg_catalog.jsonb_build_object(
        'origen_carga', 'gasto_rapido_v2',
        'cashflow_item', v_cashflow,
        'movimientos_plata', v_ledger
      )
    )
  returning id into v_papelera_id;

  delete from public.movimientos_plata m
  where (m.origen_id = p_id and m.origen_tipo = v_origen_tipo)
     or (v_cashflow_id is not null
         and m.origen_id = v_cashflow_id
         and m.origen_tipo = 'gasto_obra');

  if v_cashflow_id is not null then
    update public.cashflow_items
    set deleted_at = pg_catalog.now()
    where id = v_cashflow_id;
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then
      raise exception 'no se pudo anular cashflow %', v_cashflow_id;
    end if;
  end if;

  case p_tipo
    when 'obra' then delete from public.presupuestos_gastos where id = p_id;
    when 'empresa' then delete from public.gastos_empresa where id = p_id;
    when 'personal' then delete from public.gastos_personales where id = p_id;
  end case;
  get diagnostics v_filas = row_count;
  if v_filas <> 1 then
    raise exception 'no se pudo eliminar gasto %', p_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'estado', 'deshecho', 'papelera_id', v_papelera_id
  );
end;
$$;

create or replace function public.gasto_rapido_restaurar(
  p_papelera_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papelera public.papelera_registros%rowtype;
  v_cashflow jsonb;
  v_movimiento jsonb;
  v_filas integer;
begin
  select p.* into v_papelera
  from public.papelera_registros p
  where p.id = p_papelera_id
    and p.restaurado_at is null
  for update;

  if not found then
    if exists (
      select 1 from public.papelera_registros p
      where p.id = p_papelera_id and p.restaurado_at is not null
    ) then
      return pg_catalog.jsonb_build_object('estado', 'ya_restaurado');
    end if;
    return pg_catalog.jsonb_build_object('estado', 'no_encontrado');
  end if;

  if v_papelera.tabla not in (
    'presupuestos_gastos', 'gastos_empresa', 'gastos_personales'
  ) or v_papelera.registro->>'origen_carga' is distinct from 'gasto_rapido_v2' then
    return pg_catalog.jsonb_build_object('estado', 'no_habilitado');
  end if;

  case v_papelera.tabla
    when 'presupuestos_gastos' then
      insert into public.presupuestos_gastos
      select (pg_catalog.jsonb_populate_record(
        null::public.presupuestos_gastos, v_papelera.registro
      )).*;
    when 'gastos_empresa' then
      insert into public.gastos_empresa
      select (pg_catalog.jsonb_populate_record(
        null::public.gastos_empresa, v_papelera.registro
      )).*;
    when 'gastos_personales' then
      insert into public.gastos_personales
      select (pg_catalog.jsonb_populate_record(
        null::public.gastos_personales, v_papelera.registro
      )).*;
  end case;

  v_cashflow := v_papelera.vinculos->'cashflow_item';
  if v_cashflow is not null and pg_catalog.jsonb_typeof(v_cashflow) = 'object' then
    update public.cashflow_items
    set deleted_at = nullif(v_cashflow->>'deleted_at', '')::timestamptz
    where id = (v_cashflow->>'id')::uuid;
    get diagnostics v_filas = row_count;
    if v_filas <> 1 then
      raise exception 'cashflow % no se pudo restaurar', v_cashflow->>'id';
    end if;
  end if;

  for v_movimiento in
    select value
    from pg_catalog.jsonb_array_elements(
      coalesce(v_papelera.vinculos->'movimientos_plata', '[]'::jsonb)
    )
  loop
    insert into public.movimientos_plata
    select (pg_catalog.jsonb_populate_record(
      null::public.movimientos_plata, v_movimiento
    )).*;
  end loop;

  update public.papelera_registros
  set restaurado_at = pg_catalog.now()
  where id = p_papelera_id;

  return pg_catalog.jsonb_build_object(
    'estado', 'restaurado',
    'tabla', v_papelera.tabla,
    'id', v_papelera.registro_id
  );
end;
$$;

revoke execute on function public.gasto_rapido_deshacer(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.gasto_rapido_restaurar(uuid)
  from public, anon, authenticated;
grant execute on function public.gasto_rapido_deshacer(text, uuid)
  to service_role;
grant execute on function public.gasto_rapido_restaurar(uuid)
  to service_role;

comment on function public.gasto_rapido_deshacer(text, uuid) is
  'Deshace sólo gastos marcados gasto_rapido_v2; archiva detalle/vínculos y revierte cashflow+ledger en una transacción.';
comment on function public.gasto_rapido_restaurar(uuid) is
  'Restaura atómicamente un gasto rápido desde Papelera junto con cashflow y patas del ledger.';
