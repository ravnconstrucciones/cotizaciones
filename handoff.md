# Handoff — sesión 06/07/2026 (bugs del bot + diseño módulo Dinero)

## Objetivo de la sesión
(1) Diagnosticar y limpiar las fallas del bot de hoy; (2) diseñar el módulo **Dinero** del Centro de Mando (financiamiento cruzado entre obras, bolsillos por dueño, libro de deudas). El handoff anterior (finanzas personales 05/07) estaba TERMINADO y se reemplazó por este.

## Estado

### Hecho ✅ (datos, todo en Supabase prod)
- **Diagnóstico bugs bot**: (a) el clasificador (Haiku) recibe TODO el historial y re-emite acciones viejas — así nació la "referencia estética" fantasma con "22500 ferreteria" y el gasto duplicado de $22.500; (b) el menú de cuentas filtra por moneda del gasto → nunca ofrece la caja USD para gastos en pesos. AÚN SIN FIX EN CÓDIGO — entra en la implementación del módulo (o como parche previo chico en `~/Documents/ravn-bots/src/advisorService.js` + `cuentas.js`).
- **Limpieza**: borrados ferretería $22.500 dupl. (gastos_empresa), comisión US$50 dupl., referencia fantasma, y el 450k siding que el bot cargó hoy en Pueyrredón (el real está en Glorietas desde 03/07: "Mano de obra tira cemento (Saivin)", cuenta Efectivo obra Pueyrredón = financiamiento cruzado ya asentado).
- **Cargas**: Garage $12.800 (obra Pueyrredón, efectivo obra), Café $4.500 (personal, MP), **Volquete $150.000** (obra Pueyrredón, MP — el bot nunca lo había guardado; nota: $90k caja obra + $60k de Eze, formalizar en el libro de deudas cuando exista).
- **Cuenta renombrada**: "USD billete" → **"Efectivo obra Pueyrredón US$"** (id 77ccfb1f).
- **Spec módulo Dinero** escrita y commiteada: `docs/superpowers/specs/2026-07-06-dinero-design.md` (commit `0ed0de4`, branch `home-cards`). Memoria: `proyecto-modulo-dinero.md`.

### Decisiones de diseño (cerradas en entrevista con Eze — ver spec)
Bolsillos por dueño (obra/RAVN/personal) en cada cuenta + libro de deudas; cobros se liberan durante la obra con alerta anti-fundirse; deuda real con devolución manual y neteo al cierre; bot = borrador hasta "confirmo" (caso típico: 2 preguntas + confirmación); foto inicial + reconstrucción de cruces; nombre **Dinero** (`/dinero`), NO "Plata"; **todo revisado por agente ravn-code-reviewer** (pedido explícito).

### Pendientes
1. ~~Aprobar spec~~ **HECHO 07/07**.
2. ~~Parche bot~~ **HECHO Y DEPLOYADO 07/07** (commit `1653fd1` en ravn-bots/main → Railway): guardia anti-fantasmas + menú multi-moneda. Falta SOLO prueba en vivo de Eze por WhatsApp.
3. ~~Fase 1 módulo Dinero~~ **HECHA 07/07** (commits `fae424b..7326fe6` en home-cards): migraciones `movimientos_plata` + `financiamientos` + índice origen_grupo_id APLICADAS EN PROD, vista `dinero_saldos_bolsillos`, motor `src/lib/dinero.ts` (10 tests, suite 381 verde), verificación en vivo OK, review ravn-code-reviewer aprobado. Plan ejecutado: `docs/superpowers/plans/2026-07-07-dinero-fase-1.md`; ledger en `.superpowers/sdd/progress.md` (minors diferidos a F2–F4 anotados ahí).
4. **DECISIÓN TOMADA POR EZE 07/07**: foto inicial COMPLETA, UNA SOLA VEZ, al ARRANQUE de la Fase 2 (se adelanta desde F4). Eze declara en una sola sesión guiada: cuánto hay en cada cuenta y de quién es (bolsillos, filas `foto_inicial`) + los cruces pasados conocidos (siding $450k Glorietas←Pueyrredón, volquete $60k de Eze) como `financiamientos` iniciales. El bot recién asienta DESPUÉS de esa foto — nunca sobre bolsillos vacíos. `chequeoConsistencia` (ya hecho, F1) valida la foto contra el motor actual. Fase 4 queda reducida a: switch del motor de saldos al ledger + cierre de convivencia. Pedido explícito de Eze: mantener el review de `ravn-code-reviewer` como control de cada fase.
   → Siguiente paso: `superpowers:writing-plans` para Fase 2 = foto inicial guiada + bot borrador→confirmo + RPC asentar + espejo ledger. El RPC debe: ser el único camino del bot a 'asentado', validar moneda=cuenta y deudor≠acreedor, setear updated_at, idempotencia por origen_grupo_id (todo anotado también en `.superpowers/sdd/progress.md`).
5. Conciliar $20k/US$20 de las cajas (viejo, en notas de cuentas).
6. Branch `home-cards` sigue con commits sin mergear (frentes cotizador + spec + Fase 1 Dinero).

## Archivos clave
- Spec: `~/Documents/ravn/docs/superpowers/specs/2026-07-06-dinero-design.md`
- Bot: `~/Documents/ravn-bots/src/advisorService.js` (clasificador, línea ~350 llama a Haiku con historial; case gasto ~línea 605), `src/cuentas.js` (menú/detección, `opcionesPreguntaCuenta` filtra por moneda)
- App: `~/Documents/ravn` (branch home-cards)
- Memoria: `proyecto-modulo-dinero.md` en el memory dir

## Qué se intentó y falló
Nada fallido — la sesión fue diagnóstico + datos + diseño. Sin cambios de código todavía.

## Plan siguiente paso
Leer spec → OK de Eze → `superpowers:writing-plans` → implementar fase 1 (migraciones `movimientos_plata` + `financiamientos` + vistas) con ravn-code-reviewer al cierre de cada fase.
