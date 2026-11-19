-- Portal del cliente (16/11/2026): el avance deja de mostrarse en porcentajes.
-- Por rubro se muestra el estado (pendiente / en curso / terminado) y QUÉ SE HACE:
-- un texto de tareas, una por renglón, en el idioma del cliente.
--
-- La columna avance queda en la tabla sin uso (default 0): no se borra para que
-- el cambio sea reversible y no rompa una versión anterior desplegada.

alter table public.obra_portal_rubros add column if not exists tareas text;

comment on column public.obra_portal_rubros.tareas is
  'Qué se hace en el rubro, una tarea por renglón. Lo ve el cliente en el portal.';
comment on column public.obra_portal_rubros.avance is
  'SIN USO desde 16/11/2026: el portal ya no muestra porcentajes.';
