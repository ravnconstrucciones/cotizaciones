begin;

do $$
declare
  v_cuenta uuid;
  v_presupuesto uuid;
  v_obra uuid;
  v_id uuid;
  v_cf_id uuid;
  v_papelera uuid;
  v_grupo uuid;
  v_result jsonb;
  v_count integer;
begin
  select id into v_cuenta
  from public.cuentas
  where activa and moneda = 'ARS'
  order by created_at
  limit 1;

  select p.id, o.id into v_presupuesto, v_obra
  from public.presupuestos p
  join public.obras o on o.presupuesto_id = p.id
  where p.presupuesto_aprobado
  order by p.created_at
  limit 1;

  if v_cuenta is null or v_presupuesto is null or v_obra is null then
    raise exception 'fixtures base inexistentes';
  end if;

  -- Empresa con cuenta + pata: snapshot, doble undo y restore exacto.
  insert into public.gastos_empresa
    (concepto, monto, moneda, fecha, origen, cuenta_id, origen_carga)
  values
    ('TEST undo empresa', 123.45, 'ARS', current_date, 'app', v_cuenta, 'gasto_rapido_v2')
  returning id into v_id;
  v_grupo := gen_random_uuid();
  insert into public.movimientos_plata
    (fecha, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, grupo_id,
     origen_tipo, origen_id, estado, descripcion)
  values
    (current_date, v_cuenta, 'empresa', null, -123.45, 'ARS', v_grupo,
     'gasto_empresa', v_id, 'asentado', 'TEST undo empresa');

  v_result := public.gasto_rapido_deshacer('empresa', v_id);
  if v_result->>'estado' <> 'deshecho' then
    raise exception 'empresa no se deshizo: %', v_result;
  end if;
  v_papelera := (v_result->>'papelera_id')::uuid;
  select count(*) into v_count from public.gastos_empresa where id = v_id;
  if v_count <> 0 then raise exception 'detalle empresa sobrevivió'; end if;
  select count(*) into v_count from public.movimientos_plata where origen_id = v_id;
  if v_count <> 0 then raise exception 'pata empresa sobrevivió'; end if;
  select jsonb_array_length(vinculos->'movimientos_plata') into v_count
  from public.papelera_registros where id = v_papelera;
  if v_count <> 1 then raise exception 'snapshot ledger empresa incompleto'; end if;

  v_result := public.gasto_rapido_deshacer('empresa', v_id);
  if v_result->>'estado' <> 'ya_deshacido' then
    raise exception 'doble undo no fue idempotente: %', v_result;
  end if;
  v_result := public.gasto_rapido_restaurar(v_papelera);
  if v_result->>'estado' <> 'restaurado' then
    raise exception 'empresa no restauró: %', v_result;
  end if;
  select count(*) into v_count from public.movimientos_plata where origen_id = v_id;
  if v_count <> 1 then raise exception 'pata empresa no restauró'; end if;

  -- Personal con cuenta.
  insert into public.gastos_personales
    (concepto, monto, categoria, fecha, origen, cuenta_id, origen_carga)
  values
    ('TEST undo personal', 234.56, 'Varios', current_date, 'app', v_cuenta, 'gasto_rapido_v2')
  returning id into v_id;
  insert into public.movimientos_plata
    (fecha, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, grupo_id,
     origen_tipo, origen_id, estado, descripcion)
  values
    (current_date, v_cuenta, 'empresa', null, -234.56, 'ARS', gen_random_uuid(),
     'gasto_personal', v_id, 'asentado', 'TEST undo personal');
  v_result := public.gasto_rapido_deshacer('personal', v_id);
  v_papelera := (v_result->>'papelera_id')::uuid;
  if v_result->>'estado' <> 'deshecho' then raise exception 'personal no deshizo'; end if;
  v_result := public.gasto_rapido_restaurar(v_papelera);
  if v_result->>'estado' <> 'restaurado' then raise exception 'personal no restauró'; end if;

  -- Obra con cashflow y cuenta: cashflow se anula y vuelve, ledger se repone.
  insert into public.cashflow_items
    (obra_id, tipo, categoria, descripcion, monto_proyectado, fecha_proyectada,
     monto_real, fecha_real, estado, notas)
  values
    (v_obra, 'egreso', 'otro', 'TEST undo obra', 345.67, current_date,
     345.67, current_date, 'pagado', 'RAVN_GASTO_OBRA')
  returning id into v_cf_id;
  insert into public.presupuestos_gastos
    (presupuesto_id, fecha, descripcion, importe, cashflow_item_id, cuenta_id, origen_carga)
  values
    (v_presupuesto, current_date, 'TEST undo obra', 345.67, v_cf_id, v_cuenta,
     'gasto_rapido_v2')
  returning id into v_id;
  insert into public.movimientos_plata
    (fecha, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, grupo_id,
     origen_tipo, origen_id, estado, descripcion)
  values
    (current_date, v_cuenta, 'obra', v_presupuesto, -345.67, 'ARS', gen_random_uuid(),
     'gasto_obra', v_id, 'asentado', 'TEST undo obra');
  v_result := public.gasto_rapido_deshacer('obra', v_id);
  v_papelera := (v_result->>'papelera_id')::uuid;
  select count(*) into v_count from public.cashflow_items
  where id = v_cf_id and deleted_at is not null;
  if v_count <> 1 then raise exception 'cashflow obra no se anuló'; end if;
  v_result := public.gasto_rapido_restaurar(v_papelera);
  select count(*) into v_count from public.cashflow_items
  where id = v_cf_id and deleted_at is null;
  if v_count <> 1 then raise exception 'cashflow obra no se restauró'; end if;

  -- Obra sin cashflow y sin cuenta también es válida y no inventa patas.
  insert into public.presupuestos_gastos
    (presupuesto_id, fecha, descripcion, importe, cashflow_item_id, cuenta_id, origen_carga)
  values
    (v_presupuesto, current_date, 'TEST undo obra sin caja', 456.78, null, null,
     'gasto_rapido_v2')
  returning id into v_id;
  v_result := public.gasto_rapido_deshacer('obra', v_id);
  v_papelera := (v_result->>'papelera_id')::uuid;
  if v_result->>'estado' <> 'deshecho' then raise exception 'obra sin caja no deshizo'; end if;
  v_result := public.gasto_rapido_restaurar(v_papelera);
  if v_result->>'estado' <> 'restaurado' then raise exception 'obra sin caja no restauró'; end if;

  -- Histórico ambiguo: nunca queda habilitado.
  insert into public.gastos_empresa
    (concepto, monto, moneda, fecha, origen, cuenta_id, origen_carga)
  values
    ('TEST histórico', 10, 'ARS', current_date, 'app', null, null)
  returning id into v_id;
  v_result := public.gasto_rapido_deshacer('empresa', v_id);
  if v_result->>'estado' <> 'no_habilitado' then
    raise exception 'fila histórica habilitada por error: %', v_result;
  end if;

  select count(*) into v_count from public.dinero_huerfanos;
  if v_count <> 0 then raise exception 'dinero_huerfanos dejó de estar vacío: %', v_count; end if;
end
$$;

rollback;
