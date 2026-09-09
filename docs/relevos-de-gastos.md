# Relevos de gastos desde conversaciones

Pedido de Eze, 09/09/2026. Cuando pide relevar/cargar gastos, el trabajo incluye registrarlos en App RAVN y verificar persistencia. La instrucción común para todos los agentes vive en el vault: `Sistema/Relevos de gastos desde conversaciones.md`, apuntada por `CLAUDE.md`.

No es un proceso por horario: lo dispara el pedido en la conversación. El agente identifica gastos, resuelve entidades reales y prepara el lote. El código valida y registra.

## Destino y write-point

`POST /api/gastos/rapido` (o invocación local del mismo handler con credenciales de servidor):

- Personal: `tipo=personal`, concepto, monto ARS, categoría, fecha, cuenta; `fijo_id` y `extraordinario` cuando corresponda.
- Empresa: `tipo=empresa`, concepto, monto, categoría, fecha y cuenta.
- Obra: `tipo=obra`, `presupuesto_id`, importe ARS, descripción, fecha, cuenta, `rubro_id`, `plan_item_id` y `mo_acuerdo_id` conocidos. Acuerdo y plan deben pertenecer a la misma obra.
- Cobro: `tipo=ingreso`; nunca se registra como gasto negativo.

Antes del lote, cruzar por fecha, monto, concepto, cuenta, obra y fuente del comprobante con registros existentes. Un reintento de red usa `reintento:true`; el guard de dos minutos NO sustituye la conciliación histórica del lote. Si falla la lectura de duplicados, se detiene antes de escribir.

No inferir operario, obra, cuenta o cantidad ejecutada cuando exista ambigüedad. Resolver sólo el dato faltante; seguir con los comprobantes completos. Una factura presupuestada no es un pago, un pago de tarjeta no vuelve a registrar sus consumos y una transferencia entre cuentas propias no es gasto.

Registrar un movimiento por hecho, mantener el importe en centavos y conservar referencia de la fuente. Verificar respuesta `id`, `espejo.ok` y patas; luego reconsultar filas y totales de App RAVN. Revisar `dinero_huerfanos` antes de cerrar. No declarar completo un gasto sin cuenta: queda identificado para conciliar.

El resultado del relevo informa registrados, ya existentes, pendientes y total por ámbito. El contexto y la evidencia van al vault; los importes operativos y sus IDs viven en App RAVN.
