# Handoff — sesión 07/07/2026 (noche) — Fases 1-4 COMPLETAS y EN PROD; queda runbook en vivo como verificación

## Estado general
Módulo Dinero: **Fases 1, 2 y 3 completas y en producción.** La sesión nocturna (autónoma, pedido de Eze) cazó y arregló los 2 bugs del bot que rompían el runbook, construyó la Fase 3 entera (pantalla `/dinero` + card "Bolsillos y deudas" en la home), la pasó por dos waves de review (ravn-code-reviewer + verificador adversarial) y deployó todo. Ledger detallado: `.superpowers/sdd/progress.md` (sección "Ledger Fase 3").

## Qué se hizo esta noche (07/07 ~19:30-21:00)

### Bot (ravn-bots main → Railway, ambos deployados SUCCESS)
- `a7f3299`: **el bug del "Listo."** — parseJson (código del 13/06, NO de la fase) se quedaba con el array `opciones=[...]` de una duda y tiraba la pregunta. Por eso "22950 ferreteria" (19:23) recibió "Listo." sin hacer nada. Fix: el primer delimitador decide el top-level. Test con el caso real.
- `b696b8d`: defensa en profundidad — multi sin ítems procesables → aviso pidiendo reenvío, jamás "Listo." fantasma. 401/401 verdes.
- El error de las 17:46 (helado, `dineroBolsillos` undefined) era el bug ya arreglado a la tarde (armarCtx, 24652fb) — ese mensaje fue ANTES del redeploy.

### App (branch home-cards → Vercel ravn-app-one, READY)
- `f2f691f` **Fase 3**: `/dinero` (de quién es la plata por dueño, cuentas con desglose por bolsillo, libro de deudas con antigüedad, borradores del bot, quién financia cada obra, alertas "a conciliar") + card en la home + `/api/dinero` + `src/lib/dinero-tablero.ts` (matemática pura, 10 tests) + nav + prefetch.
- `c8454aa` review wave 1: borradores/alertas visibles SIEMPRE aun sin foto (spec decisión 4); USD en grupos mixtos; warn si /api/cuentas falla.
- `97fed03` review wave 2: vista `dinero_costos_obra` (el group by en la base — traer la tabla entera subcontaba en silencio al pasar el cap 1000 de PostgREST); USD "US$ 1.234" es-AR (salía "US$ $1,234"); cuenta inactiva con bolsillos visible; CHECK `financiamientos` deudor≠acreedor. **Migración 20260707230000 APLICADA en prod.**
- Verificación: tsc limpio, 403/403, build ✓, matemática corrida contra datos de prod (totales = SQL directo; Siding 100% financiado / Pueyrredón 64% propio). Advisors sin findings nuevos.
- Review wave 1 cerró la NOTA del handoff anterior (bot bolsillo vs espejo 'personal'): NO es bug vivo, el guard de financiamientos en dinero-sync lo cubre.

## PENDIENTE (retomar acá — necesita a Eze en WhatsApp)
0. **BUG VIVO + DATO SUCIO (21:42, PRIMERO esto)**: en el arqueo de Mercado Pago Eze dijo que tenía **$776** y el bot lo tomó como **$776.000** → propuso ajuste +$775.223 al bolsillo RAVN (empresa) y Eze lo CONFIRMÓ ("1"). Dos cosas:
   a) **Revertir el dato**: buscar el ajuste asentado ~2026-07-08 00:42 UTC — movimientos_plata (origen_tipo='ajuste', cuenta MP, monto +775.223, bolsillo empresa) Y su gemelo en cuenta_ajustes (delta 775223). Borrar ambos (o contra-ajustar) y dejar MP en el valor real que diga Eze (~$777/$776). OJO: con el switch del motor ya hecho, el saldo inflado se ve en TODA la app hasta revertirlo. Verificar después con `npx tsx scripts/dinero-foto.ts check`.
   b) **Cazar el bug de escala**: "776" → 776.000. Sospechosos en ravn-bots: la conversión de montos del clasificador Haiku (prompt) o la normalización de miles en el parser (montoMencionado / flujo arqueo en dineroFlujo.js). Reproducir con test: "en mp hay 776" NO puede volverse 776.000. Systematic-debugging: raíz primero, después fix + test de regresión + deploy Railway.
1. **Runbook Task 10 en vivo** (guión en ledger línea 63): reenviar el helado `gasto personal helado 10570 visa credito` y `22950 ferreteria` (con obra y medio de pago); arqueo; transferencia 1 parte y repartida 2 partes; cancelar con «2». Verificar cada impacto por SQL + `npx tsx scripts/dinero-foto.ts check` verde. DATO: "Ferreteria 800 obra siding" YA pasó entera en vivo (financiamiento $800 Siding→Pueyrredón automático ✓). OJO: ese gasto quedó cargado como $800 — confirmar con Eze si era real o prueba (si era prueba, borrarlo: gasto + patas + financiamiento).
2. **Ver /dinero y la card con los ojos de Eze** (funciona con datos reales, pero el visto estético es de él).
3. **SWITCH del motor HECHO y EN PROD** (commit posterior al handoff, /api/cuentas lee del ledger vía ajuste virtual delta ledger−motor; hoy delta=0 en todo, check independiente verde). El runbook en vivo sigue siendo la verificación operativa: si algo diverge, manda el ledger y /dinero lo muestra a conciliar.
4. Al cerrar Task 10: borrar `handoff.md` y `foto-dinero.html`.

## Gotchas
- Repo bot: handoff.md ajeno modificado en el working tree — NO tocarlo, commitear solo archivos propios.
- Vercel: proyecto `ravn-app-one` (decoy `ravn-app` NO).
- Blue del día: dolarapi.com/v1/dolares/blue.
