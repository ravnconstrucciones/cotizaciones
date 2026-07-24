# 0001 — El ledger de dinero como única fuente de verdad

**Fecha:** 2026-07-23 (decisión tomada ~2026-07, documentada hoy)
**Estado:** vigente

## ¿Por qué hicimos esto?

Toda la plata del negocio (y la personal, como retiros de socio) se registra en
un ledger único en Supabase. Los saldos por cuenta/bolsillo se **derivan** de
las filas del ledger, nunca se guardan como número suelto editable. "El LEDGER
es LA POSTA en toda la app."

## ¿Qué alternativas había?

1. Saldos como campos editables por cuenta, actualizados a mano.
2. Motores paralelos (un registro para gastos, otro para saldos del bot).

## ¿Por qué las descartamos?

Los saldos editables divergen de la realidad en cuanto alguien se olvida un
movimiento — y no hay forma de auditar de dónde salió el número. Los motores
paralelos ya causaron un bug real (caso "efectivo −$116k" falso por un motor
viejo del bot): dos verdades = ninguna verdad.

## ¿Qué implicancias tiene?

- Todo ingreso/gasto/retiro/transferencia es una fila del ledger (o un grupo
  con `grupo_id` cuando una operación tiene varias patas).
- Corregir un saldo = registrar el movimiento que falta, nunca editar el saldo.
- El bot escribe AL ledger, no a tablas propias.
- Los arqueos comparan realidad física contra el ledger, y la diferencia se
  registra como movimiento.
