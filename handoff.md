# Handoff — sesión 2026-07-02 (tarde)

Contexto al límite. Hacer `/clear` y retomar de acá.

## Qué se hizo en esta sesión

1. **Sistema de CUENTAS completo, COMMITEADO y EN PROD** (commits `15f8359` + rename en branch `home-cards`, deploy Ready en Vercel `ravn-app-one` = "RAVN APP FIVE"):
   - Tabla `cuentas` en Supabase (migración `crear_sistema_cuentas`): nombre, moneda ARS/USD, saldo_inicial (foto 02/07), fecha_saldo_inicial, procedencia propia/obra, activa, orden. RLS con patrón de la app (select auth, escritura no_bot).
   - `cuenta_id` nullable + índice en `presupuestos_gastos`, `cashflow_items`, `retiros_socio`, `gastos_personales`. NULL = "sin asignar" (histórico), no toca saldos.
   - **Saldo derivado** en `src/lib/cuentas.ts` (función pura `saldosPorCuenta`, 9 tests; suite total 319 verde): inicial + movimientos asignados en la moneda de la cuenta. Dedup espejo gasto↔libreta: la cuenta vive en el GASTO (`cashflow_item_id` del espejo se ignora). Gasto desde cuenta USD se pasa con `cotizacion_venta_ars_por_usd` de la fila; sin cotización no ajusta.
   - `GET /api/cuentas` (`src/app/api/cuentas/route.ts`): cuentas + saldos + agregados por moneda/procedencia.
   - `SelectorCuenta` (`src/components/selector-cuenta.tsx`) enchufado en: gasto de obra (`src/app/obras/[id]/gastos/gastos-screen.tsx`), retiro rápido (`modulo-salud-negocio.tsx` + `/api/negocio/retiro` acepta cuenta_id), registro rápido de caja (`cashflow-registro-rapido-modal.tsx` + `/api/cashflow/registrar-movimiento`).
   - Tarjeta de la home: bloque "Dónde está" con cada cuenta, chip `obra` para caja de obra (`modulo-plata.tsx`).
2. **Cuentas cargadas (02/07):** Efectivo $1.5M (obra Pueyrredón), **Efectivo propio $1.086M** (lo sumó Eze por mensaje), MP $135.532, Balanz $1.105.150 + US$148, BBVA $94.294 + US$30, USD billete US$2.220 (obra). `negocio_config.patrimonio_ars` actualizado a **2.420.976** (ahora incluye efectivo propio).
3. **Tarjeta renombrada PLATA → DINERO** (pedido de Eze: "no me gusta PLATA") — título del panel y label del héroe ("Dinero total"). Deployado.

## LOOP PEDIDO POR EZE (retomar con /loop en la sesión nueva)
Eze lanzó `/loop hasta que quede perfecto! y revisa al bot porque hay muchas cosas que siento que flaquea lo siento muy duro...` — quedó SIN ARRANCAR por contexto al límite. En la sesión nueva: **relanzar el loop de mejora del bot** (repo `~/Documents/ravn-bots`, deploy Railway, servicio principal `src/advisorService.js` + `index.js`).

**Caso concreto que lo disparó (captura 02/07 18:46):** Eze mandó al bot la foto de un flyer de volquetes ("El Benya", 3 números de WhatsApp) con el texto "Guaerae telefono en volquetes" (= guardame el teléfono). El bot respondió con el menú rígido de siempre (1. moodboard / 2. filosofía / 3. procesar en Mac / 4. archivar) — NO entendió la intención. Eze lo siente "muy duro": menús enlatados en vez de entender qué quiere.

**Qué quiere (sus palabras):** "tiene que agendar el número o armarme dentro de la app una lista de proveedores o agendarlos al cel, bah no sé qué puede hacer" — está abierto a propuesta. Dirección sugerida (validar con él):
1. Tabla `proveedores` en Supabase (nombre, rubro, teléfonos[], notas, origen_foto) + vista en App RAVN — pega con el agente ravn-compras que ya registra proveedores.
2. Nuevo destino del bot: foto/texto con intención "guardar contacto/proveedor" → extraer con visión (nombre, rubro, teléfonos del flyer) → insertar en `proveedores` y confirmar con lo guardado.
3. De paso, revisar la rigidez general: que clasifique intención ANTES de tirar menú (el menú solo si de verdad es ambiguo).

## SIGUIENTE PASO GRANDE: sección /dinero propia
Eze pidió que el dinero sea **una sección más dentro de la página, tipo /proyectos o /cotizaciones** (no solo una tarjeta en la home). Frente para sesión dedicada:
- Ruta `/dinero` con la vista completa: dinero total, desglose por cuenta con saldos derivados, movimientos por cuenta, retiros/aportes, conciliación.
- Mirar cómo están armadas `/cotizaciones` (`src/app/cotizaciones/`) y `/obras` para copiar el patrón de navegación/entrada desde la home.
- **PREGUNTAR a Eze**: ¿la tarjeta Dinero de la home queda como resumen que linkea a /dinero (como obras) o desaparece de la home?
- Ya existe `/finanzas` (personal, ciclo tarjeta) — definir si /dinero la absorbe o conviven (dinero=empresa+total, finanzas=personal).

## Decisiones/datos de Eze en esta sesión
- Sumó $1.086.000 de plata SUYA en efectivo (cuenta "Efectivo propio", separada del efectivo de obra).
- No le gusta "PLATA" como nombre → "DINERO".

## Pendientes abiertos
1. Bot WhatsApp (ravn-bots Railway) no asigna cuenta al cargar gastos → quedan "sin asignar".
2. Conciliar $20.000 efectivo obra (libreta 1.520.000 vs foto 1.500.000) y US$20 billete (2.220 vs 2.200).
3. Registrar HOY el primer retiro de socio (pago al banco) con el selector de cuenta nuevo — lo hace Eze en la app.
4. Branch `home-cards` con 3 commits sin pushear; sigue el lote viejo sin commitear (daemon/jobs + cotizador retail — decidir con Eze).
5. Los de siempre (en memoria): limpieza vault, archivar 5 cotizaciones, cuota container, toggles Supabase, job auditoría domingo 05/07.
