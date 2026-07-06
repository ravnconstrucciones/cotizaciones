-- Fase 2 módulo Dinero (spec 2026-07-06, plan 2026-07-06-dinero-fase-2.md).
-- El ÚNICO camino del bot a 'asentado' es dinero_asentar_grupo: valida el
-- grupo (moneda = cuenta), lo asienta ATÓMICO, estampa el origen y crea el
-- financiamiento si la operación cruzó dueños — idempotente por
-- origen_grupo_id (confirmar dos veces no duplica nada).

-- 1) Cerrar el agujero del insert (minor de F1): el bot SOLO inserta borrador.
drop policy movimientos_plata_insert_auth on public.movimientos_plata;
create policy movimientos_plata_insert_auth on public.movimientos_plata
  for insert to authenticated
  with check (not es_bot() or estado = 'borrador');

-- 2) Índice para el sync del espejo (lookup "¿qué patas espejan esta fila?").
create index movimientos_plata_origen_idx
  on public.movimientos_plata (origen_tipo, origen_id)
  where origen_id is not null;

-- 3) Asentar un grupo (bot: "confirmo").
create or replace function public.dinero_asentar_grupo(
  p_grupo_id uuid,
  p_origen_id uuid default null,
  p_financiamiento jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filas int;
  v_borrador int;
  v_fin_id uuid;
begin
  -- Decisión de Eze 07/07: nada se asienta sobre bolsillos vacíos.
  if not exists (
    select 1 from movimientos_plata
    where origen_tipo = 'foto_inicial' and estado = 'asentado'
  ) then
    raise exception 'falta la foto inicial: no se asienta nada todavía';
  end if;

  -- Lock del grupo entero (dos confirmaciones simultáneas no se pisan).
  perform 1 from movimientos_plata where grupo_id = p_grupo_id for update;

  select count(*), count(*) filter (where estado = 'borrador')
    into v_filas, v_borrador
  from movimientos_plata where grupo_id = p_grupo_id;

  if v_filas = 0 then
    raise exception 'grupo % inexistente', p_grupo_id;
  end if;

  -- Idempotencia: ya estaba asentado → devolver lo que hay, sin duplicar.
  if v_borrador = 0 then
    select id into v_fin_id from financiamientos
      where origen_grupo_id = p_grupo_id limit 1;
    return jsonb_build_object(
      'ya_estaba', true, 'asentadas', 0, 'financiamiento_id', v_fin_id);
  end if;

  if v_borrador <> v_filas then
    raise exception 'grupo % con estados mixtos: no se asienta', p_grupo_id;
  end if;

  -- Cada pata en la moneda de SU cuenta (validación pedida en el handoff).
  if exists (
    select 1 from movimientos_plata m
    join cuentas c on c.id = m.cuenta_id
    where m.grupo_id = p_grupo_id and m.moneda <> c.moneda
  ) then
    raise exception 'una pata del grupo % no está en la moneda de su cuenta', p_grupo_id;
  end if;

  update movimientos_plata
    set estado = 'asentado',
        origen_id = coalesce(p_origen_id, origen_id)
    where grupo_id = p_grupo_id;

  -- Financiamiento del cruce de dueños, en la MISMA confirmación (spec).
  if p_financiamiento is not null then
    select id into v_fin_id from financiamientos
      where origen_grupo_id = p_grupo_id limit 1;
    if v_fin_id is null then
      if p_financiamiento->>'deudor_tipo' = p_financiamiento->>'acreedor_tipo'
         and coalesce(p_financiamiento->>'deudor_obra_id', '')
             = coalesce(p_financiamiento->>'acreedor_obra_id', '') then
        raise exception 'financiamiento inválido: deudor y acreedor son el mismo dueño';
      end if;
      insert into financiamientos
        (deudor_tipo, deudor_obra_id, acreedor_tipo, acreedor_obra_id,
         monto_original, saldo_pendiente, moneda, origen_grupo_id, notas, updated_at)
      values
        (p_financiamiento->>'deudor_tipo',
         nullif(p_financiamiento->>'deudor_obra_id', '')::uuid,
         p_financiamiento->>'acreedor_tipo',
         nullif(p_financiamiento->>'acreedor_obra_id', '')::uuid,
         (p_financiamiento->>'monto')::numeric,
         (p_financiamiento->>'monto')::numeric,
         p_financiamiento->>'moneda',
         p_grupo_id,
         coalesce(p_financiamiento->>'notas', ''),
         now())
      returning id into v_fin_id;
    end if;
  end if;

  return jsonb_build_object(
    'ya_estaba', false, 'asentadas', v_filas, 'financiamiento_id', v_fin_id);
end;
$$;

comment on function public.dinero_asentar_grupo(uuid, uuid, jsonb) is
  'Asienta un grupo borrador ATÓMICO (bot: "confirmo"). Valida moneda=cuenta, estampa origen_id y crea el financiamiento del cruce si viene (idempotente por origen_grupo_id). Exige foto inicial previa.';

-- 4) Descartar un grupo borrador (bot: "cancelar" — RLS le bloquea DELETE).
create or replace function public.dinero_descartar_grupo(p_grupo_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas int;
begin
  delete from movimientos_plata
    where grupo_id = p_grupo_id and estado = 'borrador';
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

comment on function public.dinero_descartar_grupo(uuid) is
  'Borra SOLO las patas borrador de un grupo (cancelación del bot). Lo asentado no se toca jamás.';

revoke all on function public.dinero_asentar_grupo(uuid, uuid, jsonb) from public, anon;
revoke all on function public.dinero_descartar_grupo(uuid) from public, anon;
grant execute on function public.dinero_asentar_grupo(uuid, uuid, jsonb) to authenticated;
grant execute on function public.dinero_descartar_grupo(uuid) to authenticated;
