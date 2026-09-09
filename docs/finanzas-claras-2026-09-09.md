# Finanzas claras en App RAVN

Pedido de Eze, 09/09/2026: ver resultado y margen por obra, mano de obra pagada, costos por rubro y unidad; finanzas personales completas; pagos por operario y resumen semanal exportable. Sacar Pendientes y Agenda del recorrido. Interfaz móvil sobria, negro/blanco/acero, controles cómodos, navegación rápida.

## Implementación

- [x] Proyectos: unificar todas las vistas con fotos, métricas y barras. Una lectura agregada; filtrar en memoria. Conservar todos los expedientes. Compresión de portadas antes de subir.
- [x] Obra: resumen económico y análisis por rubro/unidad desde registros reales. Gastos vinculados a caja cuentan una sola vez. Valores desconocidos se muestran como pendientes, nunca cero ficticio. No sumar superficies de trabajos diferentes.
- [x] Personal: total real del período incluyendo fijos pagados y extraordinarios. Categorías, evolución, búsqueda y exportación. Presupuesto planificado conserva su pantalla y no se suma a gastos reales.
- [x] Personal de obra: registro de cada pago, filtros por persona/obra/fechas, semana actual/anterior, CSV y resumen imprimible/compartible. Medio no registrado permanece explícito.
- [x] Inicio y navegación: quitar agenda/pendientes; accesos directos a obras, personal, pagos y registro. Evitar fondos animados pesados y consultas ajenas al contenido visible.
- [x] Relevos desde conversaciones: procedimiento compartido que aplica registro por destino, verificación de duplicados y ledger, y deja identidad/evidencia persistida. No requiere automatización por horario.

## Límites y verificación

Sin cambio de precios, clasificación histórica inferida, eliminación de datos ni nuevas dependencias. Reutilizar tablas, autenticación, write-points y fórmulas existentes. Pruebas dirigidas de cálculos financieros (duplicación, moneda, datos incompletos y unidades), tipos/build y una revisión visual móvil. El cierre distingue implementación, integración y publicación.

Referencia visual: hero sobrio y contenido fotográfico de la colección Heroes de 21st.dev; se adapta a un tablero de trabajo sin efectos de scroll. Animaciones sólo con Framer Motion, respetando movimiento reducido.

## Verificación y estado

- 70 pruebas dirigidas aprobadas; compilación completa y comprobación de tipos.
- Lectura de endpoints contra Supabase: proyectos, personal, pagos y detalle responden correctamente; totales contrastados con SQL independiente.
- Migración aditiva de mediciones aplicada. Ningún gasto ni medición histórica fue inventado.
- Revisión visual productiva bloqueada por la aprobación automática del navegador; también se rechazó abrir la maqueta por URL local. No se afirma QA visual.
