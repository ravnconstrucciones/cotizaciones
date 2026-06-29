# Handoff — Bot estado de obra + limpieza base + Correa (2026-06-17)

> Hay otro `handoff.md` (rediseño "home-cards", WIP) — NO tocarlo. Este es de otra línea.

## Qué se hizo en esta sesión ✅

1. **Feature "estado de obra" por WhatsApp — DEPLOYADO a Railway** (commit `858166d` en `ravn-bots`, push a `main` dispara deploy).
   - Las preguntas de plata de una obra ("cuánto gasté en X", "saldo de X", "cómo voy en X") ahora se responden DIRECTO de Supabase, **sin la Mac** (antes se encolaban a la Mac → "💤 la compu está apagada").
   - Tabla cortita: **materiales vs MO** (cotizado vs gastado vs resto) + margen. Split de gastos material/MO por descripción (`esGastoMo`), porque los rubros de la base son capítulos de obra, no etiquetan MO.
   - Archivos: `src/supabaseService.js` (`estadoObra`, `ventaArsDesdePref`, `esGastoMo`), `src/advisorService.js` (tipo `estado_obra`, `formatEstadoObra`, guard de consulta-de-plata redirigido), `src/portero.js` (acción `estado_obra`). Tests: 105/105 verde.
   - **Pendiente de verificar EN VIVO:** que el usuario del bot (auth dedicado, NO service_role) pueda leer `presupuestos_items` por RLS. Se confirma con el primer "cómo voy en Correa" real de Eze por WhatsApp. Si dice "no pude leer los números" → es RLS, ajustar grant/policy.

2. **Correa — 2 gastos perdidos recuperados.** Se habían cargado como "Saavedra" (alias que rebotaba) y nunca entraron. Insertados a mano en `presupuestos_gastos` (pres `762f49eb-a364-4bed-a9c7-3f31062a5f64`):
   - $111.551 (fecha 2026-06-15) → "Cerámicas y pegamento"
   - $45.000 (fecha 2026-06-17) → "Guardacantos (bordacantos)"
   - **Correa ahora: 13 gastos = $773.054.** Materiales **$473.054 vs $340.402 cotizado → PASADO $133k (139%)**. MO $300.000 pagado, saldo $800.000. Falta comprar: extractor (~$20k) + pintura → materiales cerrará ~$510k+. Margen real ~46% (sigue sano).

3. **Lección de obra capturada** en el vault: `Conocimiento/Construccion/Lecciones-de-obra/Baño-Correa.md`. Sobrecosto explicado (guardacantos ~$80k + Sika MonoTop 620 "Cicatop" $65k + bolsa extra pegamento + membrana + cerámico antideslizante + Ceresita de más) + criterio técnico (zócalos, cerámica sobre cerámica, tuberías) + **checklist de materiales para cotizar baños**. (Antes estaba suelto en el inbox; quedó bien archivado.)

## Pendiente

1. **Limpieza de la tabla `obras` (DESTRUCTIVO — necesita OK explícito de Eze).** Hoy hay 9 fichas de obra abiertas, pero la mayoría son huérfanas (presupuesto NO aprobado) o no son obras. Target: dejar "obra vigente" = 3 reales.
   - **Borrar fichas de obra (5x Las Glorietas):** presupuesto_ids `d2557115`, `e6722251`, `144cf95a`, `d250e96a`, `1d7d75e9`. Eze dijo "borralos". Confirmar: ¿solo la fila de `obras` (seguro) o el presupuesto entero?
   - **Empresa (gastos generales)** (`5ad75f43`): no es obra, es cashflow → sacarle la ficha de `obras`.
   - **Reconciliar las 2 vigentes reales que están mal en la base:**
     - Pueyrredón 1100 (`9a3c7543`): tiene ficha de obra pero presupuesto SIN aprobar. Eze: "dibujo aprobado, falta MANDAR el presupuesto" → ¿es "etapa presupuesto" (todavía no obra) o se marca obra activa?
     - Zayden / Sliding Fibrocemento en Container (`d21edde6`): ficha abierta, presupuesto sin aprobar. Eze: "aprobado, pendiente que el cliente compre materiales" → marcar `presupuesto_aprobado=true`.
   - Resultado buscado: vigentes = **Correa (ejecución), Pueyrredón 1100 (falta presupuesto), Zayden Fibrocemento (falta materiales).**
   - Terminadas (no tocar): Tejido en Polder, Acondicionamiento cerámicos ingreso, Diseño Daromy 172.
   - Rechazadas (Eze quiere guardarlas aparte): Muebles Carolina (caro), Parapelotas/alambrado.

2. **Reporte de obra de la mañana — A CONSTRUIR (después de la limpieza).** Eze lo pidió: que a la mañana le llegue la **obra vigente + sus pendientes**, NO las cerradas; y si no cargó avance → "ayer no me contaste nada de esta obra".
   - **Decisión clave de arquitectura:** el reporte de la mañana hoy corre en la Mac (`~/Obsidian/RAVN/Sistema/panel/morning.sh` vía launchd `com.ravn.tudia` 7am) → repite el problema de "depende de la compu". Recomendado: mandarlo por **WhatsApp desde el bot (Railway, nube, 24/7)** con un cron 7am nuevo (el bot ya tiene `cronTick` cada 30min como base).
   - Falta definir con Eze: qué son "pendientes" de la obra (¿tareas categoría Obra? ¿etapas del presupuesto sin avance? ¿solo el reproche si no hubo avance ayer?).
   - "Obra vigente" se resuelve solo una vez hecha la limpieza del punto 1.

3. **Auditar RLS de App RAVN** (pendiente viejo, memoria `ravn-seguridad-webs`).

4. (Opcional) Cablear la lección de Correa al `cotizador-maestro` (receta de baño) para que no vuelva a saltear guardacantos/antideslizante/extractor/pintura.

## Contexto técnico (no re-investigar)
- App RAVN: `~/Documents/ravn`, Supabase `lryelzsstyghylphvgju`, creds en `.env.local`. SERVICE_ROLE_KEY formato `sb_secret_`.
- Bot: `~/Documents/ravn-bots`, Railway proyecto `ravn-bot-proveedores`, redeploya solo al pushear `main`. Credenciales Supabase del bot viven en Railway (no en el `.env` local viejo).
- Correa = presupuesto `762f49eb-a364-4bed-a9c7-3f31062a5f64`, obra `6e5e171c-e657-4c1b-ae10-a5c5fa19b58e`. Venta $2.900.000 (sin IVA) en `propuesta_comercial_pref`.
- Vigente vs cerrada se define en tabla `obras`: `finalizada_at` null = abierta; con fecha = terminada.

## Seguir
Nueva sesión: "leé `~/Documents/ravn/handoff-bano-correa.md` y continuá". Borrar al cerrar los pendientes.
