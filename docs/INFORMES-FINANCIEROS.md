# Revisiones financieras desde conversaciones

Al relevar gastos por pedido de Eze, registrar los movimientos inequívocos mediante `/api/gastos/rapido`, cruzando previamente duplicados. La autorización para entrar y leer sus servicios y registrar informes fue otorgada el 09/09/2026; no habilita compras sin aprobación específica ni permite eludir permisos del navegador.

Guardar una revisión en `eventos` con `origen=sistema`, `tipo=informe_financiero`, `estado=procesado` y título fechado. `contenido` usa:

- `schema: ravn.informe-financiero.v1` y `reference` estable de la revisión para no duplicarla por reintentos.
- `fecha`, `thread_id`, `estado: parcial|completo`.
- `resumen`: lista de hechos verificados; separar compras, cuotas, pagos de tarjeta, transferencias y reintegros.
- `fuentes`: lista de `{nombre, estado, detalle}` que distingue lectura actual, evidencia fechada y acceso bloqueado.
- `pendientes`: lista de datos o verificaciones que faltan, sin presentar saldos viejos como deuda actual.
- IDs de gastos, obra y revisión precedente cuando corresponda.

La pantalla `/finanzas/tarjetas` conserva las revisiones previas `revision_financiera_integral` como historia fechada. No reemplazar ni borrar evidencia previa. Al resolver parte de un lote `conciliacion_pendiente`, actualizar sólo esos movimientos con sus IDs de destino; el resto permanece pendiente.

Leer los registros vinculados y `dinero_huerfanos` antes de cerrar. Un informe es evidencia de la revisión, no un nuevo movimiento de caja. Los saldos de tarjetas excluyen fechas futuras y no suman otra vez `cuentas.saldo_inicial`, ya representado en el registro de dinero.
