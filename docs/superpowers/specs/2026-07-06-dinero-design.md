# Módulo Dinero — diseño

**Fecha:** 2026-07-06 · **Estado:** validado en entrevista con Eze (pendiente OK final sobre spec)

## Problema

La plata de Ravn se mueve entre mundos que hoy el sistema no distingue dentro de una misma cuenta:
plata de cada obra (del cliente), plata de la empresa (RAVN) y plata personal de Eze conviven en el
Francés, en Mercado Pago y en efectivo. Los casos reales que dispararon el módulo:

- **Siding Glorietas:** la mano de obra ($450.000) se pagó con efectivo de la obra Pueyrredón.
  Quedó registrado el gasto con su cuenta, pero no la deuda entre obras ni cuánto de Glorietas
  está financiado por Pueyrredón.
- **Volquete Palermo:** se retiraron $90.000 del Francés (plata de la obra) a MP y se pagó un
  volquete de $150.000 desde MP — $60.000 los puso Eze de su bolsillo. Esa mezcla se perdió.
- El bot solo ofrece cuentas de la moneda del gasto (un gasto en pesos nunca ofrece la caja en
  dólares de la obra), y el clasificador re-emite acciones del historial (referencia estética
  fantasma, gasto duplicado).

Riesgo que define el módulo: **gastar plata de un cliente en otra obra sin verlo = fundirse.**
Prioridad declarada por Eze: claridad total por sobre velocidad de carga ("no importa un mensaje
más").

## Decisiones de la entrevista

1. **Bolsillos + libro de deudas (A+B).** El sistema sabe de quién es la plata dentro de CADA
   cuenta (bolsillos por dueño) y además lleva un libro de deudas entre dueños.
2. **Los cobros se liberan a medida que avanza la obra.** Cada cobro entra al bolsillo de la obra;
   Eze puede pagarse parcialmente durante la obra y el sistema avisa si un retiro come plata que
   todavía es costo futuro (contra el plan de compra).
3. **La deuda entre obras es real, la devolución es manual.** Cuando la obra deudora cobra, el
   sistema propone devolver; si nunca se devuelve, al cierre de la obra se netea y queda asentado
   como financiamiento absorbido. El tablero muestra la deuda siempre.
4. **El bot no asienta nada sin confirmación.** Todo entra como borrador; el bot pregunta lo que
   falte (de a una, con menús numerados), arma el resumen completo y recién con el "confirmo" de
   Eze impacta saldos. Un borrador colgado queda visible en la app, jamás asienta solo.
5. **Tres dueños:** cada obra, RAVN (empresa) y Eze (personal). "Me pago de las obras" tiene dos
   saltos: obra→RAVN (margen) y RAVN→Eze (retiro).
6. **Arranque = foto inicial + reconstrucción de cruces.** Se declara cuánto hay en cada cuenta y
   de quién es; los cruces pasados conocidos se cargan a mano como financiamientos iniciales
   (siding $450k, volquete $60k de Eze, etc.). Los gastos históricos por obra NO se tocan: siguen
   siendo la historia de costos. Diferencias → quedan visibles como "a conciliar".
7. **Nombre:** módulo **Dinero** (ruta `/dinero` en App RAVN). Cashflow sigue siendo proyección
   por obra; Dinero es la realidad de la plata. El tablero Salud del Negocio consume de acá.
8. **Enfoque de construcción: ledger central** (elegido sobre "columnas por tabla" y "triggers").
9. **Revisión obligatoria:** cada etapa de implementación pasa por el agente `ravn-code-reviewer`
   y verificación en vivo antes de darse por terminada.

## Modelo de datos

### `movimientos_plata` (ledger — fuente de verdad de saldos)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| fecha | date | |
| cuenta_id | uuid → cuentas | |
| dueno_tipo | text | `obra` \| `empresa` \| `personal` |
| dueno_obra_id | uuid → presupuestos, null | solo si dueno_tipo=obra |
| monto | numeric | con signo, en la moneda de la cuenta |
| moneda | text | ARS \| USD (redundante con cuenta, valida consistencia) |
| cotizacion_ars_por_usd | numeric null | solo si la operación cruzó moneda |
| grupo_id | uuid | agrupa las patas de una misma operación |
| origen_tipo | text | `gasto_obra` \| `gasto_empresa` \| `gasto_personal` \| `cobro` \| `transferencia` \| `financiamiento_devolucion` \| `retiro` \| `ajuste` \| `foto_inicial` \| `cierre_obra` |
| origen_id | uuid null | fila de la tabla de detalle |
| estado | text | `borrador` \| `asentado` |
| descripcion | text | |
| evento_id | uuid null | trazabilidad WhatsApp |
| created_at | timestamptz | |

Reglas:
- Una operación = 1..n filas con el mismo `grupo_id` (volquete: −90k bolsillo Palermo en MP +
  −60k bolsillo personal en MP; transferencia: −X en cuenta origen, +X en cuenta destino, mismo dueño).
- Solo `asentado` suma a saldos. El bot escribe `borrador`; el "confirmo" asienta el grupo entero.
- Saldo de bolsillo = Σ movimientos asentados por (cuenta, dueño). Saldo de cuenta = Σ de sus
  bolsillos y debe igualar el motor actual (chequeo de consistencia durante la convivencia).

### `financiamientos` (libro de deudas)

| Campo | Tipo | Nota |
|---|---|---|
| id | uuid pk | |
| deudor_tipo / deudor_obra_id | | quién debe |
| acreedor_tipo / acreedor_obra_id | | a quién le debe |
| monto_original / saldo_pendiente | numeric | |
| moneda | text | |
| estado | text | `abierto` \| `devuelto` \| `absorbido` |
| origen_grupo_id | uuid → movimientos_plata.grupo_id | la operación que lo creó |
| notas, created_at, updated_at | | |

- Se crea en la misma confirmación que el gasto cruzado ("gasto de Glorietas pagado con bolsillo
  Pueyrredón → financiamiento Glorietas←Pueyrredón $450k").
- Devoluciones = operación del ledger (`financiamiento_devolucion`) que baja `saldo_pendiente`.
- Al cierre de obra, los abiertos se netean → `absorbido` (queda asentado, no desaparece).

### Lo existente

- `presupuestos_gastos`, `gastos_empresa`, `gastos_personales`, `cashflow_items`,
  `transferencias`, `retiros_socio`, `cuenta_ajustes` siguen siendo el **detalle**; al confirmar,
  cada registro genera su espejo en el ledger (lo escribe la app/bot, sin triggers).
- Movimientos anteriores a la foto inicial: sin espejo, quedan como historia.
- `cuentas.procedencia` queda obsoleta como mecanismo (los bolsillos la reemplazan); se mantiene
  informativa.

## Flujo del bot

Checklist que el bot completa antes de asentar cualquier operación de plata (pregunta SOLO lo que
falta, de a una, menús numerados como hoy):

1. Qué fue: gasto / cobro / transferencia / devolución / retiro / arqueo.
2. Monto y moneda.
3. Obra a la que imputa (si es gasto de obra) — o empresa/personal.
4. Cuenta por la que pasó la plata.
5. **De qué bolsillo salió** (¿plata de esa obra, de otra, de RAVN, tuya?) — si la cuenta tiene un
   solo bolsillo con saldo, se propone solo.
6. Si cruza dueños → genera el financiamiento y lo dice explícito.
7. Si cruza moneda → pregunta la cotización real de la operación.
8. Resumen final armado + "¿Confirmo?" → recién ahí asienta (grupo completo, atómico).

Fixes del clasificador incluidos en este módulo (bugs del 06/07):
- Clasificar SOLO el último mensaje; el historial es contexto, nunca fuente de acciones nuevas.
- Guarda en código: descartar acciones cuyo dato clave (URL, monto) no esté en el mensaje actual.
- Menú de cuentas: ofrecer ambas monedas cuando existan cajas de obra en las dos (el cruce de
  moneda lo resuelve el paso 7).

## Tablero (en `/dinero` + resumen en Salud del Negocio)

- **Por cuenta:** saldo total y desglose por bolsillo.
- **Por obra:** costo total y composición del financiamiento — % caja propia, % otras obras (con
  detalle de cuáles), % RAVN/Eze. Deudas abiertas con antigüedad.
- **Alertas:** bolsillo de obra por debajo de sus costos pendientes (plan de compra); borradores
  sin confirmar; diferencias "a conciliar".
- Cobros en USD flotan al blue del día (regla existente de dos cajas).

## Foto inicial (día de salida a producción)

Sesión guiada: Eze declara cuánto hay en cada cuenta y de quién es → filas `foto_inicial` por
bolsillo; se enumeran los cruces pasados → `financiamientos` iniciales; diferencias → `ajuste`
"a conciliar". Después de la foto, el motor de saldos de la app pasa a leer del ledger.

## Verificación

- Cada fase revisada por `ravn-code-reviewer` + prueba en vivo (mensaje real al bot de prueba,
  chequeo del asiento en la base y del tablero).
- Invariantes testeables: grupo asentado atómico; Σ bolsillos = saldo cuenta; ningún movimiento
  asentado sin dueño; financiamiento cuadra con su grupo de origen.

## Fases sugeridas (el plan detallado va aparte)

1. Migración: tablas nuevas + vistas de saldos (convivencia con motor actual, chequeo cruzado).
2. Bot: flujo borrador→confirmación + fixes del clasificador + menú multi-moneda.
3. App: `/dinero` (cuentas, bolsillos, financiamientos, borradores) + tablero home.
4. Foto inicial + reconstrucción de cruces con Eze → switch del motor de saldos.
