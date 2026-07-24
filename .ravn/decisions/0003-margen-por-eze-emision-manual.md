# 0003 — Margen y emisión de presupuestos los decide Eze, nunca el sistema

**Fecha:** 2026-07-23 (decisión operativa desde jul-2026, documentada hoy)
**Estado:** vigente

## ¿Por qué hicimos esto?

El sistema calcula el COSTO con fuente y confianza. El PRECIO final (margen) es
una decisión comercial de Eze: depende del cliente, del propósito del trabajo
(entrar a un barrio, construir cartera) y del contexto. La emisión pasa por la
mesa de revisión (`/cotizar` → aprobación → emisión por consola).

## ¿Qué alternativas había?

1. Margen fijo automático (ej. +35% siempre) y emisión con un clic.
2. Sugerencia de margen por IA según tipo de trabajo.

## ¿Por qué las descartamos?

El margen automático rompe la lógica comercial real: a veces conviene margen
corto para entrar a un cliente estratégico, a veces el laburo penal se cobra
caro sin explicar. Ninguna regla fija captura eso, y un presupuesto emitido de
más no se puede desemitir frente al cliente.

## ¿Qué implicancias tiene?

- Los flujos viejos de emisión automática se purgaron de la app.
- Toda cotización queda `en_revision` hasta que Eze la aprueba.
- Regla de margen mínimo de referencia: ~30% para responsabilidad integral;
  si el cliente no llega, se achica alcance — nunca se come el margen.
- Cualquier feature nueva de cotización debe terminar en la mesa de revisión,
  no en un "enviar" directo.
