-- Security Advisor: function_search_path_mutable
-- Fija search_path en triggers PL/pgSQL (evita hijacking vía search_path).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create or replace function public.presupuestos_after_insert_obra()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  insert into public.obras (presupuesto_id) values (new.id)
  on conflict (presupuesto_id) do nothing;
  return new;
end;
$$;
