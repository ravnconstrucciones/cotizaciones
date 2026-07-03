# Handoff — sesión 2026-07-03 (feature Plan de compra y cruce)

Contexto al límite. Si se corta, `/clear` y retomar de acá.

## Feature HECHA, commits LOCALES en `home-cards` — falta: fixes de revisión + push (= deploy)

**Qué es:** plan de compra y cruce cotizado/plan/real. Spec: `docs/superpowers/specs/2026-07-03-plan-compra-cruce-design.md`. Plan: `docs/superpowers/plans/2026-07-03-plan-compra-cruce.md`. Commits `d1e73a4..18aa93e` (9 tasks completas, 11 tests nuevos, suite 338 pass, E2E contra prod verificado con datos TEST ya borrados).

- Migraciones YA APLICADAS a prod Supabase: `obra_plan_items` + `presupuestos_gastos.plan_item_id` + FK fix.
- Código: `src/lib/plan-compra/` (tipos/sembrar/importar/cruce/leccion), paso 3.5 en `crear-obra.ts`, `POST /api/obras/[id]/plan/importar`, pantalla `/obras/[id]/plan`, selector en gastos-screen, camino plan en `contraste-obra.ts`, links de navegación.

## PENDIENTE INMEDIATO — aplicar fixes del code-review y deployar

Revisión multi-agente corrida (7/8 respondieron). **Fixes a aplicar** (decididos):
1. `plan-screen.tsx` CampoNumero: usar `parseFormattedNumber` de `@/lib/format-currency` (hoy "15.000,50" → NaN silencioso).
2. `plan-screen.tsx` importarDesdeCotizacion: manejar `motivo === "error"` (hoy falla muda).
3. `plan-screen.tsx`: eliminar `gastosPorItem` y el `.some` de borrarItem — usar `f.cant_gastos` que ya viene en `cruce.filas`.
4. `importar.ts` idempotencia: bloquear si el presupuesto ya tiene ítems origen='cotizacion' de CUALQUIER cotización (hoy una 2ª cotización duplica el plan y dobla totales).
5. `contraste-obra.ts` contrastePorPlan: (a) guard `gastos.length === 0 → return 0` (hoy cierra obra sin gastos → lección con margen ~100% falso que contamina al cotizador maestro); (b) si no hay cotización vinculada → NO insertar lección "sin-receta" (ensucia las lecciones generales); (c) Promise.all para las 3 queries.
6. `leccion.ts`: ítem con cotizado === 0 y real > 0 debe entrar como "sin cotizar" (hoy invisible).
7. Migración nueva: `alter publication supabase_realtime add table obra_plan_items` (sin eso useRealtimeTable no recibe nada) — aplicar a prod vía MCP.
Descartados a conciencia: policy DELETE más estricta (app single-user), merge CampoNumero/CampoNota, dedup clases CSS, useCallback noise, doble reload realtime+load (escala chica), lección por cada cotización múltiple (caso raro, documentar).

Después de los fixes: `npx tsc --noEmit && npx vitest run` (agregar/ajustar tests de leccion/importar si aplica) → commit → **`git push origin home-cards` = deploy automático a prod (`ravn-app-one`)** → verificar deploy READY.

**OK ya dado por Eze**: "hace todo y deploya todo". Al terminar avisarle: la próxima cotización que apruebe siembra el plan solo; obras en curso → botón "Importar desde la cotización" en `/obras/[id]/plan`.

Falta 1 finder (altitude) — output en `/private/tmp/claude-501/-Users-ezeotero/487e5a5e-49cf-40b0-9091-dc38788ebdad/tasks/a9bb81090acdd3103.output` (JSONL, el resultado es el último texto). Si trae algo grave, evaluarlo antes del push.

## Contexto heredado de otras sesiones de hoy (YA EN PROD, solo referencia)
Purga flujo viejo (/nuevo-presupuesto, /rentabilidad, /propuesta), /control-gastos borrado, home/cashflow espejo Dinero. Remito intacto. NO borrar libs `ravn-propuesta-pref`/`ravn-rentabilidad-inputs`.

## PENDIENTE GRANDE (arrastrado): LOOP DEL BOT
Loop de mejora del bot (repo `~/Documents/ravn-bots`, Railway) SIN ARRANCAR. Caso: flyer volquetes "El Benya" + "guardame teléfono" → menú rígido. Eze lo siente "muy duro".

## Al terminar todo, borrar este handoff.md.
