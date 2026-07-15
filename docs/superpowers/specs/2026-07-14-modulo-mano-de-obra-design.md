# Módulo Mano de Obra — Diseño

**Fecha:** 2026-07-14
**Estado:** aprobado en conversación, pendiente de plan de implementación

## Qué es

Control de pagos de mano de obra por obra: qué se arregló con cada gremio/persona
(monto arreglado), cuánto se le pagó y cuánto le falta cobrar (saldo). Los pagos
se cargan por el bot de WhatsApp y quedan a la vez como gastos de la obra.

## Decisiones tomadas (con Eze, 14/07)

- **Unidad del acuerdo:** varios acuerdos por persona/gremio, uno por trabajo
  (ej: "filtración $700.000" y "cielorraso $300.000" son dos acuerdos aunque
  sea el mismo gremio). La persona puede quedar vacía y completarse después.
- **Ubicación:** nodo "Mano de obra" en el orbital de cada obra + página global
  `/mano-obra` con todos los acuerdos abiertos de todas las obras.
- **Alta de acuerdos:** SOLO desde la app. El bot solo registra pagos.
- **Saldo:** siempre derivado (arreglado − suma de pagos vinculados). Nunca se
  guarda un saldo.

## Modelo de datos

### Tabla nueva `mo_acuerdos`

| Columna | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| presupuesto_id | uuid fk → presupuestos | misma convención que `presupuestos_gastos` (la obra cuelga del presupuesto) |
| persona | text null | nombre del gremio/empleado; opcional |
| trabajo | text | descripción del arreglo ("filtración", "cielorraso") |
| monto_arreglado | numeric | importe LITERAL arreglado |
| moneda | text default 'ARS' | USD soportado (los gastos ya lo soportan) |
| estado | text default 'abierto' | abierto / saldado |
| notas | text null | |
| created_at / updated_at | timestamptz | |

RLS igual que el resto de tablas del negocio (usuario auth + `es_bot()` solo
lectura para consultas del bot; insert/update de acuerdos solo app).

### Cambio en `presupuestos_gastos`

Columna nueva `mo_acuerdo_id uuid null fk → mo_acuerdos`. Un pago de mano de
obra es UN gasto de obra común (descuenta cuenta, entra al ledger, aparece en
gastos y en el cruce plan/real) que además apunta al acuerdo. **Una sola fila
de plata, cero doble conteo.**

## Pantallas

### Nodo "Mano de obra" en el orbital de obra (`/obras/[id]`)

- Lista de acuerdos: persona, trabajo, arreglado, pagado, **saldo**, fecha del
  último pago. Total de la obra al pie (arreglado / pagado / saldo).
- Alta y edición de acuerdos (única vía de alta).
- **Vincular pagos existentes:** lista de gastos de la obra que parecen MO
  (rubro/descripcion) sin `mo_acuerdo_id`, para engancharlos a un acuerdo con
  un toque. Necesario para Baño Correa, que ya tiene pagos cargados de antes.
- Desvincular = poner `mo_acuerdo_id` en null (el gasto no se borra).

### Página global `/mano-obra`

- Todos los acuerdos abiertos de todas las obras: a quién se le debe, cuánto,
  hace cuánto no cobra (fecha del último pago vinculado).
- Total adeudado general. Filtro/agrupado por obra.
- Estética App RAVN existente (dark, misma familia visual que /dinero).

## Bot (ravn-bots, Railway)

- Extiende el flujo borrador→confirmo de `dineroFlujo.js`. Un pago de MO
  ("le pagué 200 a Juan del baño Correa") se detecta y se matchea contra
  acuerdos **abiertos** por persona/trabajo + obra:
  - 1 match → el borrador muestra el acuerdo y el saldo que quedaría; confirmo
    guarda el gasto con `mo_acuerdo_id`.
  - 0 o varios matches → el bot pregunta cuál (o "sin acuerdo") antes de
    confirmar. Nunca inventa el vínculo.
- Importes LITERALES como siempre (200 ≠ 200.000 salvo "lucas/palo" explícito).
- Consulta de lectura: "¿cuánto le debo a Juan?" / "¿cómo vengo con la mano de
  obra de Correa?" → responde desde `mo_acuerdos` + pagos vinculados.
- El bot NO crea ni edita acuerdos.

## Datos semilla (pasados por Eze 14/07, importes literales)

| Obra | Trabajo | Arreglado |
|---|---|---|
| Baño Correa (Lucila Lagomarsino / Correa 3750) | Filtración | $700.000 |
| Baño Correa | Cielorraso | $300.000 |
| Baño Correa | 2 extractores | $100.000 |
| Container Glorietas (siding fibrocemento) | Mano de obra siding | $1.250.000 |
| Baño Av. Pueyrredón | Obra | $2.750.000 |
| Baño Av. Pueyrredón | Plomería | $250.000 |

Tras sembrar Baño Correa: vincular los pagos MO ya cargados y verificar el
saldo con Eze (tiene anotado "MO saldo $700k" — el cruce contra las filas
reales manda, no el relato).

## Errores y bordes

- Pago que supera el saldo: se permite (la realidad manda), la pantalla muestra
  saldo negativo en rojo — es señal de revisar el arreglo, no un bloqueo.
- Acuerdo con pagos vinculados no se borra: se marca saldado o se editan los
  vínculos primero.
- Gasto MO en USD contra acuerdo en ARS (o viceversa): fase 1 NO cruza monedas;
  el bot avisa y deja el gasto sin vincular para resolver en la app.

## Testing / verificación

- Migración probada contra el proyecto Supabase (apply_migration).
- Verificación end-to-end: crear acuerdo en la app → cargar pago por bot →
  ver saldo actualizado en orbital y en /mano-obra → confirmar que el gasto
  aparece en gastos de obra y que el ledger no duplica.
- Seed de las 3 obras verificado contra los totales de esta tabla.

## Fuera de alcance (fase 1)

- Recordatorios/avisos de pagos pendientes.
- Cruce con lo que cobra RAVN del cliente.
- Alta de acuerdos por bot.
