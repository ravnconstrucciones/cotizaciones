# 0002 — La cotizadora nunca inventa y se construye con Eze

**Fecha:** 2026-07-23 (leyes dictadas por Eze 2026-07-09, documentadas hoy)
**Estado:** vigente

## ¿Por qué hicimos esto?

Las dos leyes madre de la cotizadora autoalimentada:
1. **Nunca inventar un número**: dato faltante = pregunta a Eze, jamás relleno.
2. **Los presupuestos se construyen juntos**: el sistema guía y pregunta.

Un presupuesto con un número inventado destruye la confianza del cliente y el
margen del negocio de un saque. La asertividad es el producto.

## ¿Qué alternativas había?

1. Auto-completar con estimaciones de IA cuando falta un dato ("mejor esfuerzo").
2. Precios de una base precargada estática sin verificar frescura.

## ¿Por qué las descartamos?

La IA estima con seguridad falsa: un 20% de error en una cantidad de material
se traduce en margen comido o precio no competitivo, y no hay forma de saber
cuál de los números del presupuesto era el inventado. Una base estática se
desactualiza en semanas con la inflación argentina.

## ¿Qué implicancias tiene?

- Todo número lleva traza: fuente + fecha + confianza (verificado/estimado).
- El flujo FRENA cuando falta un dato y le pregunta a Eze — eso es diseño, no bug
  (ej.: las 6 preguntas del siding frenando el Tramo C).
- Precios siempre de fuentes vivas (scrap/internet/SISMAT), nunca de memoria
  del modelo.
- CYPE u otras bases de terceros: cantidades sí, precios jamás.
