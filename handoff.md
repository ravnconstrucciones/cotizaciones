# Handoff — 12/07/2026 · Tramo B COMPLETO (ítem 5 recortes) + gotcha deploy resuelto

## Hecho en esta sesión (commits en home-cards)

- **GOTCHA DEPLOY (importante):** el push a `home-cards` genera SOLO Preview — la production branch de Vercel es `main` (abandonada, 116+ commits atrás). Prod estaba sirviendo el commit del 10/07 y Eze no veía la botonera. Resuelto: `vercel promote <url-preview>` tras cada push + verificar que el alias `ravn-app-one-five.vercel.app` apunte al commit (API `/v6/deployments?target=production`). Registrado en memoria `ravn-app-vercel-deploy-target`.
- **UX por pedido de Eze (528b63d):** la Conversación dejó de ser columna derecha (recortaba la hoja) → al fondo a ancho completo. Verificado local y EN PROD.
- **Tramo B ítem 5 — recortes del render por ítem (ad80e58):** decisión de Eze 12/07 = "manual primero" (IA para Tramo C).
  - Render base = **portada de la cotización** (se puede subir desde el mismo modal si falta).
  - Modal de recorte: arrastrás el recuadro sobre el render, se corta en el browser (canvas, sin deps nuevas), exporta máx 512px.
  - Thumbnail FIJO 36×36 por fila (recorte o ✂ punteado) — nada se corre de margen.
  - Persistencia: `cotizacion_archivos` tipo `crop_item` + `item_nombre` (único por ítem; **migración `20260712130000` APLICADA A PROD** vía MCP) + bucket `obra-archivos` prefijo `crops-item/{cotizacion_id}/`.
  - Endpoint `GET/POST/DELETE /api/cotizaciones/[id]/crops` (patrón de /portada). Lógica pura en `src/lib/cotizador/crops.ts` con 9 tests (471 total pasan).
  - **Verificado e2e en localhost** (login bot): subir render → recortar → thumbnail → rehacer → quitar → revertido a punto cero exacto (portada null, bucket limpio, 0 filas).

## Pendiente inmediato

- **El RENDER REAL del baño rosa/verde**: no existe en la app, la Mac ni el bucket — quedó solo en el WhatsApp de Eze (10/07). Eze quedó en pasarlo (lo pega en el chat o lo sube él con el botón del modal). Con eso: recortar mampara/vanitory/inodoro en la cotización 01cf33ce.
- **Feedback de Eze sobre la mesa/test del ojo** (sigue abierto del 10/07): medidas reales, estado de partida, piso ducha (nivel vs plato), gama mesada, veredicto vs su vara.
- **Tramo C**: entrada por bot en la nube (foto → candidata sin la Mac). Ojo: el bot HOY no guarda imágenes en referencias (imagen_path existe pero no se usa para esto).
- Code review 11/07: obs 3 y 4 ARREGLADAS 12/07 (parseLiteral decimales inequívocos + divergencia_pct sobre menor fuente, commit 6616aea, en prod). Quedan 2 a decisión de Eze: (1) ¿el precio 'eze' vence a los 30d o es definitivo? (2) lock optimista entre PATCH concurrentes (mono-usuario, riesgo bajo).
- Galería /cotizaciones arranca en "En revisión" (pedido de Eze 12/07, commit dcf5c64, en prod).
- Siguen vivos: 6 preguntas siding · CYPE vs receta real · Chandías · fuentes MO (UOCRA/CAC).
- **Regla de Eze (12/07): NADA corriendo constante en la Mac** — todo por evento/calendario. Hoy cumple: com.ravn.jobs (3 disparos/día) y com.ravn.homereno-goteo (cada 3 h, tanda corta y sale; va 270/403). **Cuando el goteo llegue a 403/403 (aparece `_COMPLETO.flag`): `launchctl bootout gui/$(id -u)/com.ravn.homereno-goteo` + borrar el plist.**

## Gotchas de esta sesión

- Deploy: ver arriba — SIEMPRE promote después del push, el push solo NO actualiza prod.
- `npm run lint` está roto (migración ESLint pendiente, prompt interactivo). Verificar con `npx tsc --noEmit` + `npx vitest run`.
- El error de consola `manifest.webmanifest` en dev es preexistente, no es de la mesa.
- En el repo siguen los dos archivos ajenos: `goal.md` y `scripts/__shot-cotizar.tmp.mjs` (no los toqué).
