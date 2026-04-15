-- Modo cobranza: total pactado a cobrar al cliente vs ingresos en caja (pagos parciales).
alter table public.obras
  add column if not exists cobranza_cerrada_at timestamptz null,
  add column if not exists monto_total_a_cobrar_ars numeric(14, 2) null
    check (monto_total_a_cobrar_ars is null or monto_total_a_cobrar_ars >= 0);

comment on column public.obras.cobranza_cerrada_at is
  'Si no null: se fijó el total a cobrar (obra lista para cobranza). Saldo por cobrar = monto_total_a_cobrar_ars − ingresos caja.';

comment on column public.obras.monto_total_a_cobrar_ars is
  'Snapshot del total a cobrar (sin IVA según propuesta) al cerrar cobranza.';
