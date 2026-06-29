# Handoff — Finanzas Personales Fase 2 + auditoría "por cobrar" (2026-06-29)

## ✅ HECHO Y DEPLOYADO esta sesión (prod ravn-app-one-five)

**Fase 1 (cierre):** Gym→"Gym (SportClub)", Seguros $85.135, Netflix $21.125 como gasto variable (no fijo). Bot ravn-bots migrado al modelo nuevo (`disponible_ciclo`) + pusheado a Railway (commit f3ec63a). 120/120 tests.

**Fase 2 (deployada, dpl_56TS3tokeWLN7BE1HuBJbVGGzsZF, /finanzas 200):**
- `src/app/finanzas/cashflow-empresa-block.tsx` — cashflow empresa compacto, lee `/cashflow/resumen`, linkea a `/cashflow`.
- `src/app/finanzas/foto-tarjeta-block.tsx` + `src/lib/finanzas-foto-tarjeta.ts` — foto rubro por rubro desplegable, software SEPARADO. Decisiones Eze: sin DB/histórico (foto baked en `FOTO_ACTUAL`, reemplazar cada cierre), total por rubro + desplegar consumos, software fuera del total personal. Personal puro $2.811.561, software $733.444.
- Enchufados en `src/app/finanzas/finanzas-screen.tsx`. tsc+build verde.
- Memoria actualizada: [[proyecto-finanzas-personales]].

## ⏳ PENDIENTE — Eze
- Completar fijo **Servicios** ($200k placeholder) desde botón Editar en /finanzas.
- Cuando llegue cierre Julio: pasarme el resumen → swapeo `FOTO_ACTUAL` + redeploy.

## ✅ RESUELTO (2026-06-29 sesión 2) — Siding y Correa entraron al "por cobrar"
- **Siding de fibrocemento**: estaba FUERA del conteo (sin `propuesta_comercial_pref`). Se le cargó referencia $2.170.000 (presup `36dfddb0`). $0 cobrado → **$2.170.000 por cobrar**. Verificado por SQL.
- **Baño Correa**: referencia subida de $2.900.000 → **$3.300.000** (= $2,9M base ya cobrado + $400k cielorraso; el total $3,3M ya estaba en `monto_total_a_cobrar_ars`, se reconcilió la referencia). Saldo ahora = **$400.000 por cobrar** (antes $0). NO se usó `cobranza_cerrada_at` a propósito (mal-etiquetaría la obra como "ciclo de plata terminado").
- Ambos son fixes de DATOS (no código) → **ya viven en prod FIVE** sin deploy.
- Total por cobrar nuevo ≈ Pueyrredón ~$7,28M (flota blue) + Siding $2,17M + Correa $400k ≈ **$9,85M**.
- Lever correcto para obras NO cerradas = `propuesta_comercial_pref.precioSinIvaArsRedondeado` (NUNCA `cobranza_cerrada_at`, que es el estado terminal cian "Cobranza cerrada").

## 🔍 ABIERTO (HISTÓRICO) — auditoría "Total por cobrar (clientes) $7.283.300"
Eze preguntó de dónde sale. Investigado (route `src/app/cashflow/resumen/route.ts:358-419`): es Σ `saldo_por_cobrar_ars` de obras con `presupuesto_aprobado=true` (menos la obra "Empresa").
- **Pueyrredón 1100 = el grueso (~$7,28M).** Obra USD: US$8.050 × blue (~1.510) − $4.894.400 cobrados en pesos. FLOTA con el blue.
- **Siding fibrocemento ($2,17M, $0 cobrado) NO se cuenta** — `propuesta_comercial_pref` null → referencia null → saldo null. Sub-conteo. **FIX: cargar propuesta/referencia del Siding.**
- **Correa ($400k del cielorraso):** tiene propuesta ref; saldo = referencia − $2,9M cobrado. Como cobranza NO cerrada, NO usa el total fijado $3,3M, usa la propuesta. Si la propuesta está en $2,9M da $0. **FIX: cerrar total real de Correa (base + $400k).**
- Otras (Daromy/Acondicionamiento/Polder): referencia − cobrado, chico.
- Lógica saldo pesos: si `cobranza_cerrada_at` y `monto_total_a_cobrar_ars>0` → max(0, total−ingresos); sino referencia_propuesta − ingresos; sino null.
- Conclusión: número NO inflado, más bien sub-contado (Siding afuera) + Pueyrredón flota al blue.
- **HECHO (deploy dpl_8UQUn18...):** el bloque "Pendiente de cobro" ahora muestra DESGLOSE obra por obra debajo del número (`cashflow-empresa-block.tsx`, lee `obras_activas[].saldo_por_cobrar_ars`), con tag "USD · flota al blue" en las obras dolarizadas. Eze pidió "que flote pero especificame a qué se atribuye" → resuelto.

## OTRO HANDOFF VIVO (no tocar/borrar)
`/Users/ezeotero/Documents/ravn/handoff.md` = obra **Correa**, setear `obras.monto_total_a_cobrar_ars` (obra 6e5e171c-e657-4c1b-ae10-a5c5fa19b58e) con base + $400k cielorraso → cierra KPI Rédito. Se conecta directo con el FIX de Correa de arriba.
