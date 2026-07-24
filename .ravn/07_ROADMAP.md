> **Naturaleza:** INTENCIÓN
> **Última verificación:** 2026-07-23
> **Fuente:** Eze (decisión de prioridades 23/07) + estado real de la app
> **Estado:** BORRADOR — pendiente validación Eze

# Roadmap — App RAVN

## Existe (en producción)

- **Obras**: fichas, archivos/fotos (`obra_archivos`), plan de compra sembrado
  al aprobar cotización, panel de gastos con fallback a `rentabilidad_inputs`.
- **Cotizaciones**: galería con cara de tarjeta, mesa de revisión `/cotizar`
  (Tramos A+B de la cotizadora), doble precio SISMAT + internet, margen y
  emisión por consola (decisión de Eze, nunca automática).
- **Dinero**: ledger como única fuente de verdad, deudas con terceros, arqueos
  por caja, guardia de saldo, papelera universal, modo dólar editable.
- **Mano de obra**: acuerdos, pagos ligados a gastos, informes por empleado.
- **Bot (ravn-bots en Railway)**: asesor por WhatsApp, transcripción de audios,
  registro de gastos por foto de ticket, jobs del cerebro (cerebro, sinapsis,
  FODA dominical, datos de obra, top30 precios).
- **Daemon de scrap** (Mac): precios retail 6 cadenas, modo frío.
- **Tu Día** (`/dia`): panel de vida+negocio autoactualizado.

## En curso

- Cotizadora Tramo C — frenado por ley 2: 6 preguntas del siding esperan
  respuesta de Eze (cargadas como tareas el 14/07).

## Próximos 4 frentes (orden decidido por Eze, 23/07 — todos al hilo, con review)

1. **Loop cotizado vs real**: obra terminada → comparación cotizado/plan/real →
   lección que alimenta la próxima cotización. Cierra el ciclo "se alimenta sola".
2. **Scrap: cobertura + confianza**: más rubros (sanitarios, eléctrica,
   aberturas), frescura visible por precio, alertas de desvío fuerte.
3. **Tramo C — cotizar por WhatsApp**: consultas y cotizaciones desde el bot,
   sin compu.
4. **Librería de componentes UI RAVN**: patrones reutilizables (tarjetas,
   tablas negras, chips, glass) para que toda pantalla nueva salga top en minutos.

## No-goals (por ahora)

- Multiusuario / permisos por rol (Eze es el único operador).
- Módulo depósito/inventario (anotado, sin arrancar).
- Emisión automática de presupuestos sin revisión de Eze (contra ADR 0003).
