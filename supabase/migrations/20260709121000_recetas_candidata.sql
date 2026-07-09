-- Recetas CANDIDATAS (Capítulo 1, Caso B): una receta que el sistema investigó
-- y armó pero que Eze todavía no aprobó. Nace con preguntas abiertas (ley 2:
-- se construye JUNTOS) y pasa a 'investigada' cuando Eze la revisa/completa.

alter table public.recetas
  drop constraint if exists recetas_estado_check;
alter table public.recetas
  add constraint recetas_estado_check
  check (estado in ('candidata', 'investigada', 'confiable'));

alter table public.recetas
  add column if not exists preguntas_abiertas jsonb not null default '[]'::jsonb;

comment on column public.recetas.preguntas_abiertas is
  'Preguntas abiertas de una receta candidata (datos que el sistema NO pudo determinar y le pide a Eze — ley 1: dato faltante = pregunta, no invento).';
