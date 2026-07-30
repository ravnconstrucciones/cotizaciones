# 0006 — Módulo Diagnósticos: el documento lo renderiza la app, no el modelo

**Fecha:** 2026-07-28
**Estado:** vigente

## ¿Por qué hicimos esto?

El diagnóstico era el eslabón suelto del circuito. Existía como entregable
(`~/Documents/ravn/diagnosticos/`: Perazzo, Lagomarsino, Preiss, Correa) pero no
como entidad de la app: no se podía listar, ni versionar, ni empujar a
cotización. El handoff del 28/07 (`handoff_diagnosticador_voz.md`) pedía un
vínculo "Enviar a cotizar" en el menú de Diagnósticos — y al verificar, el menú
no existía: había que construir el módulo entero, no enlazarlo.

Queda armado así:

```
checklist de visita (cel) → "Copiar todo" → barra de comando
  → trabajos_cola → la Mac (vault + SISMAT + Seia)
  → DIAGNÓSTICO (/diagnosticos) → "Enviar a cotizar" → mesa de cotización
```

## ¿Qué alternativas había?

Sobre **quién genera el PDF del diagnóstico**, que era la decisión abierta:

1. **ChatGPT Work genera el PDF** replicando el formato Perazzo (lo que Eze
   propuso: pasarle el HTML y que lo rellene).
2. **La app renderiza con plantilla propia** y el modelo aporta sólo el
   contenido (lo implementado).

## ¿Por qué las descartamos?

La 1 sirve para un borrador en el auto, pero ese documento sale de la empresa
con la marca puesta. Si el modelo re-dibuja el HTML en cada diagnóstico,
driftea: un margen, un gris, un título corrido. Y es exactamente la regla que ya
rige el cotizador — **el código suma, no la IA** — aplicada al documento: la
plantilla dibuja, el modelo escribe. Sumado a que Eze pidió sistemas y no
soluciones de una vez, re-generar el HTML cada vez *es* una solución de una vez,
repetida.

⚠️ **Esta decisión la tomó el agente sobre la mesa que dejó abierta el handoff;
Eze puede revertirla.** Si la revierte, el cambio es acotado: la página
`/diagnosticos/[id]/documento` pasa a mostrar HTML guardado en vez de
renderizarlo.

## ⚠️ Solapamiento con el flujo viejo (sin resolver)

Ya existía un camino de diagnóstico: el botón 🩺 del orbital
(`POST /api/obras/[id]/diagnostico` → `obra-orbital-screen.tsx`) encola una
orden y **la Mac escribe el HTML** y lo adjunta como fila de `obra_archivos`
(`tipo=diagnostico`). Sigue vivo y no se tocó.

Diferencias reales:

| | Flujo viejo (orbital) | Módulo nuevo (/diagnosticos) |
|---|---|---|
| Punto de partida | Obra que **ya existe** (presupuesto) | Laburo que todavía **no es obra** |
| Quién dibuja el documento | El modelo re-genera el HTML | La plantilla de la app |
| Salida | Archivo adjunto a la obra | Entidad editable + "Enviar a cotizar" |

Son complementarios (el diagnóstico de relevamiento pasa ANTES de que haya
obra), pero conviven dos formas de producir el mismo documento y eso a la larga
diverge. **Convergencia propuesta, a decidir por Eze:** que el prompt del flujo
viejo deje de pedir HTML y escriba una fila en `diagnosticos`, y que el orbital
linkee a `/diagnosticos/[id]/documento`. No se hizo en esta sesión: cambia
comportamiento en producción de algo que hoy funciona.

## ¿Qué implicancias tiene?

- Tabla `diagnosticos` (migración `20260728120000_diagnosticos.sql`). RLS con
  SELECT para `authenticated`; toda escritura por API route con service role
  (mismo patrón que la mesa conversacional, 0005).
- El CSS del formato oficial A4 salió de `/cotizaciones/[id]/documento` a
  `src/lib/doc-a4-css.ts`: **un molde para todos los entregables**. Tocar ese
  archivo cambia presupuesto y diagnóstico a la vez — es a propósito.
- "Enviar a cotizar" crea la cotización en `borrador` y siembra el relevamiento
  como primer mensaje de la mesa (`cotizacion_mensajes`, autor `sistema`). No
  calcula ni un peso: los precios son de la mesa.
- Es idempotente: si el diagnóstico ya tiene cotización, el botón lleva a esa.
