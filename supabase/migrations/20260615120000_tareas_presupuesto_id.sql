-- tareas.presupuesto_id (Ola B): vínculo opcional tarea → obra.
-- Las tareas vinculadas se listan como "pendientes de la obra" en la card del
-- proyecto (/obras); las no vinculadas siguen exactamente como hoy (módulo
-- Pendientes de la home). RLS de tareas no cambia (CRUD completo authenticated,
-- enmienda 2026-06-11).

alter table public.tareas
  add column if not exists presupuesto_id uuid references public.presupuestos(id);

create index if not exists tareas_presupuesto_idx
  on public.tareas (presupuesto_id)
  where presupuesto_id is not null;

comment on column public.tareas.presupuesto_id is
  'Obra a la que pertenece la tarea (presupuestos.id), opcional. Con valor → aparece como pendiente de la obra en la card del proyecto; null → pendiente general de la home.';
