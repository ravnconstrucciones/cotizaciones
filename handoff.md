# Handoff — 10/07/2026 (noche) · Primera cotización FOTO→CANDIDATA sembrada (test del ojo)

## Misión de esta sesión: Tramo A del capítulo "el ojo" — HECHA

Eze mandó un render de baño (rosa/verde, kit-kat) y se corrió el circuito cotizador-maestro completo a mano:

- **Cotización EN LA MESA:** `01cf33ce-f7dd-486d-ab8a-c825561cace7`, estado `en_revision`, título "Baño render rosa/verde — reforma integral (test del ojo)". URL: `ravn-app-one-five.vercel.app/cotizaciones/01cf33ce-f7dd-486d-ab8a-c825561cace7/revision` (abierta en su browser al cierre de sesión — esperando su feedback).
- **Total costo $9.017.521–$9.346.299** + mampara SIN PRECIO (a medida vidriería). Contrastes: Pueyrredón aprobada 22/06 $8,1–8,4M (alcance casi idéntico) · La Nación 06/07/26 baño 3,75m² $8,8M · Los Andes 05/26 $9,5–14,5M.
- **Receta `reforma-bano-completo` refinada v1→v2** (id `c7386866-c17c-4095-96db-9b05fe14739a`): parámetros generalizados (superficie/rosa/verde/pintura/cielorraso/mampara_frente_ml), pintura por fórmula (fichas Alba), checklist ampliado. Espejo vault: `Conocimiento/Recetas/reforma-bano-completo.md`. Espejo cotización: `Cotizaciones/formales/2026-07-10-bano-render-rosa-verde-test-ojo.md`.
- **2 lecciones registradas** (tabla + `Conocimiento/Precios/lecciones-cotizador.md`): (1) pastina en listón 7,7×30,5 probablemente 0,7-0,8 kg/m², no 0,5; (2) TRAMPA RLS: recetas/cotizador_lecciones con credenciales bot devuelven VACÍO en silencio → leer SIEMPRE con service key (`.env.local` de la app, header `apikey`). Casi se duplica la receta por esto.
- Precios: SISMAT (`buscar.py`, ojo en zsh no usar variable con comando+path) + 3 agentes de internet (Cañuelas Acuarela Iceland rosa $111.085 Supermat / verde $87.709 Pignataro; Peirano Fabric $362.800 Easy; FV Epuyén pared $332.498; kit Bari Easy $423.470) + retail Blaisten vía motor.

## Contexto de la charla (importante para continuar)

1. Eze evaluó el spec de ChatGPT ("RAVN AI"): se descartó casi todo (3 precios automáticos, Excel/Word, FastAPI/Qdrant, SaaS para terceros). Se toma: capítulo FOTOS (Tramo A hecho ✔, B = hoja editable en /cotizar con toggle sí/no + edición inline de precio que escriba a precios_items como "corregido por Eze", C = entrada por bot en la nube) + categoría equipamiento en recetas + variantes de ALCANCE (no precio) como idea futura.
2. **Feedback duro guardado en memoria** (`feedback-vara-herramienta-real`): caso baño anterior FLOJO en precios; regla = NUNCA precios de cabeza ni en chat, todo por motor/fuente o hueco "SIN PRECIO"; vara = bot y cajas.
3. **Regla nueva: BUSCAR ANTES DE PREGUNTAR** — antes de abrir una duda, recorrer gastos_reales/precios_items/lecciones/grafo (se aplicó: volquete/flete no están en gastos_reales, quedaron con fuente Pueyrredón).
4. La detección foto = completitud es lo innegociable; precio genérico corregible en la mesa. La foto JAMÁS mide: m² siempre de Eze.

## SPEC TRAMO B — "La hoja viva" (definido por Eze 10/07 noche, ES LO PRÓXIMO A CONSTRUIR)

Rediseño de la mesa `/cotizaciones/[id]/revision` como "hojas de Excel sin ser Excel":

1. **Botonera de rubros arriba** (tabs) + color de acento por rubro (fino: chip/borde/número — NO romper estética acero B&N) + **total por rubro**.
2. Rubros propuestos (PENDIENTE respuesta de Eze): Obra · Humedad · Revestimientos · Plomería · Electricidad e iluminación (¿juntos o separados?) · Sanitarios · Griferías · Mobiliario y accesorios · Extras. Los ítems del desglose se mapean a rubro (agregar campo `rubro` al ItemDesglose o mapa aparte).
3. **Edición inline**: precio, cantidad, toggle sí/no por ítem, agregar/eliminar ítems. Cada edición re-corre el motor SERVER-SIDE (cotizar.ts ya vive en `src/lib/cotizador/`) → totales frescos. NO editar fórmulas/desperdicios en v1 (decisión: solo cuando duela).
4. **Regla de oro**: precio corregido por Eze → se escribe a `precios_items` como origen "eze"/corregido con fecha (la mesa calibra al cotizador).
5. **Recortes del render por ítem**: crop de la foto (mampara, vanitory, inodoro…) como thumbnail de tamaño FIJO (nada se corre de margen), al bucket (cotizacion_archivos o campo foto en ítem).
6. **"Cotización cerrada" → proyecto**: conectar al caño EXISTENTE (aprobar → plan de compra en /obras/[id]/plan → gastos reales → cruce y lección al cierre; memoria ravn-plan-compra-cruce). NO construir "proyecto" nuevo.

**4 preguntas a Eze antes de codear** (se las hice, quedó en contestarlas):
(a) lista canónica de rubros (¿revestimientos propio? ¿iluminación con electricidad?) · (b) MO cerrada: ¿pestaña propia? (recomendado) · (c) precio editado ¿pisa el rango como valor único "Eze" con fuentes visibles abajo? (recomendado) · (d) "Cerrada" ¿= estado `aprobada` existente o estado intermedio para captación sin obra?

## Pendiente inmediato

- **Feedback de Eze sobre la mesa** (la está viendo): medidas reales, estado de partida, piso ducha (nivel vs plato), gama mesada ($320k Silestone vs $750k-1M macizo), veredicto del test vs su vara.
- Si contesta medidas → actualizar `parametros`, re-correr motor (`npx tsx scripts/cotizador/instanciar.ts < entrada.json`, entrada en scratchpad de esta sesión se pierde: reconstruir desde el desglose de la cotización) y PATCH cotización.
- Spec del capítulo "el ojo" (Tramos B y C) — escribirlo con lo aprendido en este test.
- Siguen vivos: 6 preguntas siding · CYPE vs receta real (quedó pregunta abierta en receta v3) · Chandías · fuentes MO (UOCRA/CAC).

## Gotchas técnicos de hoy

- Credenciales: `~/.ravn-cotizador/.env` NO existe; el bot usa `~/.ravn-jobs/.env` (BOT_EMAIL/BOT_PASSWORD) pero RLS le bloquea recetas/cotizaciones/lecciones → usar service key de `/Users/ezeotero/Documents/ravn/.env.local` (SUPABASE_SERVICE_ROLE_KEY, header `apikey`).
- `buscar.py` SISMAT: sin flag `--solo` (rompe silencioso); llamar `python3 buscar.py "término"` desde el dir sismat.
- Insert bulk PostgREST: todas las filas con las MISMAS claves (agregar `"ajuste": null`).
