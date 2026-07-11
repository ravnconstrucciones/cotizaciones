# Handoff — 11/07/2026 · Tramo B "hoja viva" CONSTRUIDO y verificado

## Hecho en esta sesión (commits en home-cards)

**Tramo B completo** (spec del 10/07 + las 4 respuestas de Eze del 11/07):

- **Decisiones de Eze (11/07):** 9 rubros canónicos (Obra · Humedad · Revestimientos · Plomería · Electricidad e iluminación · Sanitarios · Griferías · Mobiliario y accesorios · Extras) · MO en pestaña propia · precio editado PISA el rango con sello "Eze" y fuentes visibles abajo · "cerrada" = estado `aprobada` existente (caño aprobar→plan de compra, sin estados nuevos).
- **Motor:** `ajustes.ts` + `rubros.ts` nuevos; `cotizar()` acepta `ajustes` (AjustesMesa) que se persisten en `desglose.ajustes` y sobreviven re-corridas; ítems `activo:false` visibles pero fuera de totales/checklist/sanidad; `instanciar.ts` honra `precios.eze` del cache (futuras cotizaciones nacen calibradas). 13 tests nuevos (151 total pasan).
- **Endpoint:** `PATCH /api/cotizaciones/[id]/desglose` — una operación por request (ajuste / manual / quitar_manual), re-corre el motor server-side, guard de carrera `en_revision`, y regla de oro: precio corregido → upsert a `precios_items` origen `eze` (limpiar corrección borra la fila).
- **Migración:** `20260711090000_precios_items_origen_eze.sql` — APLICADA A PROD 11/07 vía MCP.
- **UI:** `hoja-viva.tsx` reemplaza la tabla estática en la mesa — botonera de rubros con acento fino + total por rubro, edición inline (cantidad con ↺ a fórmula, precio con sello EZE y ↺, toggle sí/no, alta/baja de ítems manuales), pestañas MO y Extras. Refresh silencioso (no pierde la pestaña activa).
- **Verificado de punta a punta:** round-trip determinístico contra la cotización real 01cf33ce (totales al peso exacto), mapeo de los 23 ítems reales correcto, y prueba viva por UI (login bot en localhost): editar precio porcelanato → fila eze en base + totales frescos → revert → punto cero exacto.

## Pendiente inmediato

- **Push/deploy de home-cards**: commits locales SIN pushear (esperando visto de Eze). Incluye también Frentes A y C + retail del 10/07 que ya estaban commiteados.
- **Feedback de Eze sobre la mesa/test del ojo** (sigue abierto del 10/07): medidas reales del baño render, estado de partida, piso ducha (nivel vs plato), gama mesada, veredicto vs su vara.
- **Tramo B item 5 — recortes del render por ítem** (crop mampara/vanitory/inodoro como thumbnail fijo al bucket): NO construido todavía, es lo próximo del capítulo.
- **Tramo C**: entrada por bot en la nube (foto → candidata sin la Mac).
- Siguen vivos: 6 preguntas siding · CYPE vs receta real (pregunta abierta en receta v3) · Chandías · fuentes MO (UOCRA/CAC).

## Gotchas de esta sesión

- Verificación UI local: login con credenciales del bot (`~/.ravn-jobs/.env`) FUNCIONA para la mesa porque los /api usan admin client (RLS no aplica); solo el selector de presupuestos (query browser directa) queda vacío para el bot.
- Scripts sueltos tsx: correr DESDE el repo (scratchpad no resuelve node_modules) y extensión `.mts` para top-level await.
- En el repo siguen los dos archivos ajenos a esta sesión: `goal.md` y `scripts/__shot-cotizar.tmp.mjs` (no los toqué).
