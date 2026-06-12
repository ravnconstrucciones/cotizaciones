-- El nombre `recetas` lo necesita el cotizador del Centro de Mando (contrato de datos).
-- La tabla `recetas` vieja es el catálogo de ítems (rubro_id, nombre_item, unidad,
-- costo_base_material_unitario, costo_base_mo_unitario) → pasa a llamarse catalogo_recetas.
-- Guardas: solo renombra si la vieja existe y el destino está libre (idempotente,
-- y no pisa la `recetas` nueva si esto se re-corre).

do $$
begin
  if exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'recetas'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'recetas'
         and column_name = 'nombre_item'
     )
     and not exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'catalogo_recetas'
     )
  then
    alter table public.recetas rename to catalogo_recetas;
    comment on table public.catalogo_recetas is
      'Catálogo de ítems para presupuestos (ex tabla `recetas`, renombrada 2026-06-12 para liberar el nombre al recetario del cotizador). Las FKs (p. ej. presupuestos_items.receta_id) siguen apuntando acá: el rename no rompe constraints.';
  end if;
end $$;
