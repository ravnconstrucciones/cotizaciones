-- Parche único: pegar y ejecutar en Supabase → SQL → New query (todo el archivo).
-- Requiere tablas public.obras y public.cashflow_items (migración cashflow_obras ya aplicada).

-- ── Cierre de obra + categorías cashflow ───────────────────────────────────
alter table public.obras
  add column if not exists finalizada_at timestamptz null;

comment on column public.obras.finalizada_at is
  'Si no null, la obra está finalizada; se muestra resumen de cierre cashflow.';

create table if not exists public.cashflow_cierres_obra (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  presupuesto_id uuid not null references public.presupuestos (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cashflow_cierres_obra_obra_id_idx
  on public.cashflow_cierres_obra (obra_id);

comment on table public.cashflow_cierres_obra is
  'Snapshot del resumen al finalizar obra (presupuestado vs real, margen).';

alter table public.cashflow_items drop constraint if exists cashflow_items_categoria_check;

alter table public.cashflow_items
  add constraint cashflow_items_categoria_check check (
    categoria in (
      'anticipo',
      'cuota_avance',
      'cuota_final',
      'material',
      'mano_de_obra',
      'subcontrato',
      'gasto_fijo',
      'otro'
    )
  );

-- ── Anular movimientos (deleted_at) ────────────────────────────────────────
alter table public.cashflow_items
  add column if not exists deleted_at timestamptz null;

comment on column public.cashflow_items.deleted_at is
  'Si no null, el movimiento no entra en saldos; se puede restaurar poniendo null.';

create index if not exists cashflow_items_deleted_at_idx
  on public.cashflow_items (deleted_at)
  where deleted_at is not null;

-- ── Security Advisor: search_path en triggers ──────────────────────────────
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

-- ── Libreta empresa ─────────────────────────────────────────────────────────
alter table public.presupuestos
  add column if not exists libreta_caja_empresa boolean not null default false;

comment on column public.presupuestos.libreta_caja_empresa is
  'Si true: fila reservada para libreta de caja general (gastos/ingresos no imputados a una obra).';

insert into public.presupuestos (
  nombre_obra,
  nombre_cliente,
  domicilio,
  fecha,
  ajuste_total_obra_pct,
  estado,
  presupuesto_aprobado,
  pdf_generado,
  libreta_caja_empresa
)
select
  'Empresa (gastos generales)',
  'Caja empresa',
  '—',
  (timezone('America/Argentina/Buenos_Aires', now()))::date,
  0,
  'borrador',
  true,
  false,
  true
where not exists (
  select 1 from public.presupuestos p where p.libreta_caja_empresa = true
);

-- ── Cobranza cerrada (botón obra finalizada en Caja) ───────────────────────
alter table public.obras
  add column if not exists cobranza_cerrada_at timestamptz null,
  add column if not exists monto_total_a_cobrar_ars numeric(14, 2) null
    check (monto_total_a_cobrar_ars is null or monto_total_a_cobrar_ars >= 0);

comment on column public.obras.cobranza_cerrada_at is
  'Si no null: se fijó el total a cobrar (obra lista para cobranza). Saldo por cobrar = monto_total_a_cobrar_ars − ingresos caja.';

comment on column public.obras.monto_total_a_cobrar_ars is
  'Snapshot del total a cobrar (sin IVA según propuesta) al cerrar cobranza.';

-- ── Gastos de obra: adjuntos foto/audio (Storage) ──────────────────────────
-- Ver migración 20260415210000_gastos_obra_adjuntos_storage.sql

alter table public.presupuestos_gastos
  add column if not exists adjunto_path text null;

alter table public.presupuestos_gastos
  add column if not exists adjunto_kind text null;

alter table public.presupuestos_gastos
  drop constraint if exists presupuestos_gastos_adjunto_kind_chk;

alter table public.presupuestos_gastos
  add constraint presupuestos_gastos_adjunto_kind_chk
  check (adjunto_kind is null or adjunto_kind in ('foto', 'audio'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('gastos-obra', 'gastos-obra', true, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "gastos_obra_select" on storage.objects;
drop policy if exists "gastos_obra_insert" on storage.objects;
drop policy if exists "gastos_obra_delete" on storage.objects;

create policy "gastos_obra_select"
  on storage.objects for select
  to public
  using (bucket_id = 'gastos-obra');

create policy "gastos_obra_insert"
  on storage.objects for insert
  to public
  with check (bucket_id = 'gastos-obra');

create policy "gastos_obra_delete"
  on storage.objects for delete
  to public
  using (bucket_id = 'gastos-obra');

-- ── Comprobantes en libreta (cashflow_items) ───────────────────────────────
-- Migración 20260415220000_cashflow_items_adjunto.sql

alter table public.cashflow_items
  add column if not exists adjunto_path text null;

alter table public.cashflow_items
  add column if not exists adjunto_kind text null;

alter table public.cashflow_items
  drop constraint if exists cashflow_items_adjunto_kind_chk;

alter table public.cashflow_items
  add constraint cashflow_items_adjunto_kind_chk
  check (adjunto_kind is null or adjunto_kind in ('foto', 'audio'));
