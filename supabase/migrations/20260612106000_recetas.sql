-- recetas: recetario paramétrico del cotizador (contrato Centro de Mando 2026-06-11).
-- OJO: el catálogo viejo que se llamaba `recetas` ahora es `catalogo_recetas`
-- (migración 20260612103000). Esta tabla es NUEVA y de otro dominio.

create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  nombre text not null unique,
  titulo text not null,
  estado text not null default 'investigada' check (estado in ('investigada','confiable')),
  parametros jsonb not null,
  etapas jsonb not null,
  checklist jsonb not null default '[]'::jsonb,
  fuentes jsonb not null default '[]'::jsonb,
  version int not null default 1
);

comment on table public.recetas is
  'Recetas paramétricas del cotizador: etapas + materiales con fórmula por m²/ml/unidad + MO + tiempos. estado=investigada hasta validarse en obra real (pasa a confiable).';

drop trigger if exists recetas_actualizado_at on public.recetas;
create trigger recetas_actualizado_at
  before update on public.recetas
  for each row execute function public.set_actualizado_at();

alter table public.recetas enable row level security;
revoke all on public.recetas from anon;

drop policy if exists "recetas_all_no_bot" on public.recetas;
create policy "recetas_all_no_bot" on public.recetas
  for all to authenticated
  using (not public.es_bot()) with check (not public.es_bot());
