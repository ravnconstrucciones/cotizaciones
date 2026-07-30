-- Card "IA de RAVN" (pedido 29/07): las suscripciones de IA se cobran en USD y
-- la card las pide en USD. finanzas_fijos solo tenia monto_ars.
--
-- Aditiva y reversible: las filas existentes quedan moneda='ARS' con su
-- monto_ars intacto, asi que nada de lo que ya lee esta tabla cambia.
--
-- Regla feedback-dos-cajas-pesos-dolares: lo que se paga en USD se guarda en
-- USD y flota al blue venta al leerse. monto_ars en filas USD es solo un
-- snapshot informativo, NO la fuente de verdad.
--
-- YA APLICADA en el proyecto real (lryelzsstyghylphvgju) el 29/07/2026.

alter table public.finanzas_fijos
  add column if not exists moneda    text not null default 'ARS',
  add column if not exists monto_usd numeric,
  add column if not exists categoria text;

alter table public.finanzas_fijos
  drop constraint if exists finanzas_fijos_moneda_chk;
alter table public.finanzas_fijos
  add constraint finanzas_fijos_moneda_chk check (moneda in ('ARS', 'USD'));

-- Coherencia: una fila en USD sin monto_usd no se puede convertir a pesos.
alter table public.finanzas_fijos
  drop constraint if exists finanzas_fijos_monto_usd_chk;
alter table public.finanzas_fijos
  add constraint finanzas_fijos_monto_usd_chk
  check (moneda <> 'USD' or (monto_usd is not null and monto_usd >= 0));

comment on column public.finanzas_fijos.moneda is
  'ARS | USD. En USD manda monto_usd; monto_ars queda como snapshot informativo.';
comment on column public.finanzas_fijos.monto_usd is
  'Importe mensual en dolares. Obligatorio cuando moneda = USD.';
comment on column public.finanzas_fijos.categoria is
  'Etiqueta libre para agrupar en las cards. Hoy se usa ''ia''.';
