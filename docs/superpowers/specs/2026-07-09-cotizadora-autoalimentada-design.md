# Spec — La Cotizadora que se alimenta sola (Master Plan)

**Fecha:** 2026-07-09 · **Estado:** diseño aprobado en charla, pendiente review de Eze + plan de implementación.
**Autor de la charla:** Ezequiel + Claude (sesión brainstorming). Congelado en spec por umbral de contexto.

---

## La música (el goal final, en palabras de Eze)

Que **todo el sistema se retroalimente entre sí y sea una música.** Las piezas ya están casi todas cargadas; falta la conectiva que las hace tocar juntas.

El loop: Eze lanza un laburo a cotizar → el sistema calcula la lista completa de materiales con cantidades y precios vivos → si no sabe cómo se hace, **investiga** (fabricante, videos, Seia, fichas, SISMAT) → arma la receta → la cotiza → **la guarda y con eso queda más grande para la próxima.** Cada obra nueva lo hace más inteligente.

Esto es la columna vertebral de RAVN, no un feature suelto.

## Las dos leyes madre (innegociables — las dictó Eze)

1. **El sistema NUNCA inventa un número.** Falta una cantidad, un precio o un paso → **se planta y lo pide**: "necesito este dato, ¿de dónde lo sacamos?". Un dato faltante es una PREGUNTA, jamás un invento. (Origen: en el baño se pusieron precios baratos deducidos. No repetir.)
2. **Los presupuestos se construyen JUNTOS.** El sistema no adivina a partir de poco detalle: guía a Eze, le pregunta lo que necesita, y se retroalimenta de tres fuentes → **experiencia real de las obras + info que carga Eze + videos/fichas que suma cuando hace falta.**

Corolarios de diseño: "confianza por ítem" y "dato faltante → pregunta" son el CORAZÓN del motor, no un adorno. Todo número lleva traza (de dónde y de cuándo). La corrección de Eze alimenta el cerebro.

---

## Las piezas que YA existen (el 90% que Eze remarca que está)

| Pieza | Dónde vive | Estado |
|---|---|---|
| Motor de precios vivos (retail multi-cadena) | `src/lib/cotizador/retail.ts` | ✅ HECHO hoy (Fase 1). Easy/Prestigio/Blaisten/Colorshop VTEX, ruteo por rubro, `fetchPreciosComparados`, traza fuente+fecha. |
| Motor de cálculo (receta → take-off, la IA no suma) | `src/lib/cotizador/cotizar.ts` + `instanciar.ts` | ✅ existe. Produce `Desglose` con cantidades, precios min/max, divergencias, sanidad, checklist. |
| Recetas paramétricas | tabla `recetas` (Supabase) | ✅ 4 cargadas (todas "investigada"): pintura-interior (simple), colocacion-porcelanato-interior-con-carpeta, reforma-bano-completo, pileta-hormigon-armado. |
| Cerebro Seia (teoría de obra) | vault `Conocimiento/Construccion/Marcelo-Seia/` | ✅ destilado, con índice. |
| Fichas de materiales (rendimiento/manos/dilución) | vault `Conocimiento/Materiales` | ✅ 36 fichas técnicas. |
| SISMAT (tarifario, tiene ítems armados) | vault `Conocimiento/Precios/sismat` + tabla | ✅ 472 MO + 1.384 mat. |
| Búsqueda en internet / fabricante / videos | WebSearch/WebFetch + skills cotizador-maestro/rapido | ✅ las skills ya lo hacen en chat. |
| Mesa de revisión (muestra un desglose ítem a ítem con fuente+fecha) | `src/app/cotizaciones/[id]/revision/revision-screen.tsx` | ✅ existe (flujo formal). |

## La conectiva que FALTA (el 10% — el verdadero laburo)

1. **La cara gráfica exploratoria (Capa 3).** Un panel tipo software: elegís el laburo, movés los parámetros (m², manos…), y ves el take-off vivo completo — cantidad + precio + fuente + fecha por ítem — SIN tener que armar la cotización formal. Denso, todo a la vista, todo corroborable.
2. **La fábrica de recetas (Cerebro → Receta).** Cuando no hay receta para el laburo, el sistema investiga (fabricante + videos + Seia + fichas + SISMAT), **arma una receta candidata mostrando de dónde sacó cada cantidad y con qué confianza**, le pide a Eze lo que le falta, y al aprobarla la guarda en `recetas` + enriquece el cerebro.
3. **Capa fina de precios fechados (para que "al día" sea de verdad).** El daemon (modo frío 08/13/20) escribe los precios retail con timestamp en una tabla/cache, para que el panel muestre "revisado hace 2 h" con sentido y un botón "refrescar ahora". Sin esto, la frescura es de mentira.

---

## El loop, paso a paso

```
Eze: "cotizá siding de fibrocemento, 40 m²"
      │
      ▼
¿Hay receta para "siding fibrocemento"?
      ├── SÍ (ej. pintura) ──▶ instanciar(receta, params) ──▶ precios vivos ──▶ take-off gráfico
      │
      └── NO ──▶ INVESTIGAR:
                  · página fabricante (Eternit/Superboard…)
                  · videos de instalación
                  · Seia (método/criterio)
                  · fichas de materiales (rendimiento/manos)
                  · SISMAT (ítems y MO de referencia)
                 ──▶ armar RECETA CANDIDATA
                      · cada cantidad con: fórmula + fuente + confianza
                      · lo que NO se pudo determinar ──▶ PREGUNTA a Eze
                                                          ("¿cuántos tornillos por placa? ¿de dónde lo saco?")
                 ──▶ Eze corrige/completa (co-construcción)
                 ──▶ cotizar en vivo
                 ──▶ GUARDAR receta en `recetas` + enriquecer cerebro
                 ──▶ la próxima vez ya está (retroalimentación)
```

## Trazabilidad y confianza (requisito de las dos leyes)

Por cada ítem del take-off, el panel muestra:
- **Cantidad** → fórmula + de qué fuente salió (Seia / ficha X / fabricante / SISMAT) + **confianza** (verificado / estimado).
- **Precio** → cadena (Easy/Prestigio/…) + fecha de revisión + detalle para corroborar (mediana, rango, nº de resultados).
- **Dato faltante** → marcado en rojo como PREGUNTA abierta, nunca rellenado con un invento.

---

## Primer build (la música en un escenario chico)

NO es "el panel con pintura y listo". Es **el loop entero tocando en dos casos**, para ver el Master Plan de punta a punta:

- **Caso A — laburo CON receta (pintura-interior):** elegís, ponés 80 m², sale el take-off instantáneo con precios vivos. Prueba el camino rápido.
- **Caso B — laburo SIN receta (siding de fibrocemento):** el sistema investiga, arma la candidata mostrando fuentes+confianza, te pregunta lo que le falta, la construís con él, la cotiza y la guarda. Prueba el camino que se alimenta solo.

Si Eze ve esos dos casos andando, vio el sistema completo.

## Decisiones abiertas (para la próxima sesión, resolver con Eze)

1. **¿Dónde vive el panel?** Ruta nueva `/cotizar` (exploratorio) vs extender la mesa de revisión. Prob. ruta nueva liviana, sin estado formal `cotizaciones`.
2. **Forma de la receta candidata auto-generada:** ¿la arma un agente/skill (cotizador-maestro adaptado para ESCRIBIR una receta en la tabla) o un pipeline de código con pasos fijos? Riesgo: que invente cantidades → mitigado por confianza + preguntas.
3. **Tabla/cache de precios fechados:** esquema + qué materiales testigo cachea el daemon.
4. **Cómo se "enriquece el cerebro" concretamente:** ¿la receta nueva basta, o también escribe un destilado en el vault?
5. **Stack visual:** cockpit actual (liquid-glass, cdm-*, Framer Motion). Aplicar skill `ui-ux-pro-max` en la pasada de diseño.

## Estado del código a hoy (base sobre la que se construye)

- Rama `home-cards`. Commits de hoy: `380e4b8` (retail capa 1), `f86bcaf` (home sin Dinero/ADN), `57ddbe9` (volar ML + rename mercadolibre→retail + Colorshop viva + `fetchPreciosComparados`).
- 88/88 tests verdes, `tsc` limpio.
- Módulo Dinero/ADN salieron de la home (viven en /dinero y /adn).

## Próximo paso

1. Eze revisa este spec.
2. Sesión nueva (post /clear): invocar `writing-plans` para el plan de implementación del **Capítulo 1** (panel + tajada de precios fechados + el camino de receta candidata para el Caso B).
3. El Capítulo 2 (industrializar la fábrica de recetas receta por receta) es su propio spec después.
