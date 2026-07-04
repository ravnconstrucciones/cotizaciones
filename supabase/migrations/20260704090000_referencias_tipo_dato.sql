-- referencias: nuevo tipo 'dato' — conocimiento de obra reutilizable capturado
-- desde la bandeja de Archivados (ej: "altura container 2,79"). El daemon
-- (job_datos) lo baja al vault Conocimiento/Datos-de-obra.md para el cotizador.

alter table public.referencias
  drop constraint if exists referencias_tipo_check;

alter table public.referencias
  add constraint referencias_tipo_check
  check (tipo in ('filosofia', 'estetica', 'dato'));

comment on table public.referencias is
  'Capturas de ADN vía bot: tipo=filosofia (texto + fuente), tipo=estetica (imagen_path al bucket privado `referencias` + etiquetas de la IA) o tipo=dato (conocimiento de obra reutilizable que el daemon sincroniza al vault). Alimenta el moodboard del tablero y el cerebro del cotizador.';
