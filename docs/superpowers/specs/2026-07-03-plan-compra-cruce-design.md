# Plan de compra y cruce cotizado / plan / real — Diseño

**Fecha:** 2026-07-03
**Estado:** aprobado por Eze (conversación 2026-07-02/03)
**Objetivo:** cerrar el loop del cotizador — saber si un laburo se cobró bien o mal comparando lo cotizado al cliente contra lo que Eze decide comprar de verdad y contra lo que efectivamente gasta, y que ese aprendizaje alimente la próxima cotización.

## Problema

La cotización (receta del cotizador maestro) incluye TODO lo que el laburo lleva en teoría. Pero en obra Eze toma decisiones: cosas cotizadas que no compra (plato de ducha), reemplazos (otro porcelanato), agregados que no estaban cotizados (flete). Hoy no hay dónde registrar esa "cotización interna post-decisiones" ni forma de cruzarla con los gastos reales. Resultado: no se sabe el margen real de cada obra ni qué ítems se cotizan sistemáticamente mal.

## Las tres fotos

1. **Cotizado** — el desglose de la cotización aprobada. Congelado, intocable. Es la evidencia de lo que se le cobró al cliente.
2. **Plan de compra** — pieza NUEVA. Lista editable de lo que Eze decide comprar/pagar de verdad. Vive en la obra.
3. **Real** — los gastos de `presupuestos_gastos` (cargados por Eze o el bot). Ya existe.

## Decisiones de diseño (con Eze)

- **Ubicación:** el plan vive **en la obra**, no en la cotización ni en un módulo aparte. Se siembra automáticamente al aprobar la cotización (mismo flujo que ya crea presupuesto + obra). La cotización queda congelada.
- **Cruce gasto↔ítem:** vínculo **opcional** al cargar el gasto (selector de un toque). Gasto sin asignar queda visible en el cruce como "sin asignar" y se asigna después desde ahí. Cero fricción obligatoria. Matching automático por nombre: fase 2, NO ahora.
- **Alcance:** materiales **y** mano de obra, en dos bloques separados del plan. Sin la pata de MO el veredicto "cobré bien/mal" queda incompleto.
- **Regla de uso reemplazos** (criterio de Eze, se muestra como ayuda en la pantalla): *misma cosa con otra marca/modelo → editar la fila; concepto distinto → excluir y agregar.*

## Flujo completo

1. **Aprobar cotización** (existente: `POST /api/cotizaciones/[id]/aprobar` → `crearObraDesdeCotizacion`) — se agrega: copiar cada `ItemDesglose` del `desglose` jsonb como fila de `obra_plan_items`, con snapshot congelado del valor cotizado. Igual que el loop de oro actual, este paso corre después del cambio de estado y un fallo acá nunca bloquea la aprobación.
2. **Plan de compra** — sección nueva en la obra. Dos bloques (Materiales / Mano de obra). Por ítem: toggle incluido/excluido, cantidad y precio previsto editables, nota (marca/proveedor), alta de ítems manuales (origen `manual`, sin snapshot cotizado).
3. **Gastos** — flujo actual intacto; se agrega selector opcional de ítem del plan al cargar/editar un gasto de obra. El bot sigue insertando sin asignar.
4. **Cruce** — pantalla/tab en la misma sección: tabla por ítem con columnas Cotizado / Plan / Real + desvío; resumen arriba: precio cobrado al cliente, costo planificado, costo real, margen real en $ y % (vs margen implícito al cotizar); lista de gastos sin asignar con asignación rápida; totales suman todo (incluidos, excluidos y agregados) así el cierre global siempre da.
5. **Cerrar cruce (lección)** — al terminar la obra, botón que genera una lección con: ítems con desvío relevante (cotizado vs real), ítems olvidados (agregados sin cotizar), exclusiones, desvío global y margen final. Se guarda en `cotizador_lecciones`, que el cotizador maestro ya lee antes de cada cotización nueva. Ahí cierra el loop de aprendizaje.

## Datos

### Tabla nueva `obra_plan_items`

```sql
create table public.obra_plan_items (
  id uuid primary key default gen_random_uuid(),
  creado_at timestamptz not null default now(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  cotizacion_id uuid references public.cotizaciones(id),
  origen text not null default 'manual' check (origen in ('cotizacion','manual')),
  tipo text not null check (tipo in ('material','mano_de_obra')),
  nombre text not null,
  etapa text,
  unidad text,
  cantidad numeric,          -- cantidad planificada (editable)
  precio_unitario numeric,   -- precio previsto (editable)
  incluido boolean not null default true,
  notas text,
  cotizado jsonb             -- snapshot congelado del ItemDesglose de origen
                             -- {cantidad, unidad, precio_min, precio_max,
                             --  subtotal_min, subtotal_max, fuente, fecha}
                             -- null para origen 'manual'
);
```

RLS: mismo patrón que `presupuestos_gastos` (Eze total; bot select — el bot no edita el plan en fase 1).

### Columna nueva en `presupuestos_gastos`

```sql
alter table public.presupuestos_gastos
  add column plan_item_id uuid references public.obra_plan_items(id) on delete set null;
```

`on delete set null`: si se borra un ítem del plan, el gasto vuelve a "sin asignar", nunca se pierde.

### Reglas

- Ítem excluido con gastos vinculados: NO se borra, se marca `incluido = false` (no se pierde historia).
- Ítem `origen='cotizacion'` no se puede borrar, solo excluir. Ítems `manual` sí se borran (si no tienen gastos).
- El snapshot `cotizado` no se edita jamás desde la UI.

## Cálculo del cruce (todo en código, la IA no suma)

- **Cotizado por ítem:** punto medio de `subtotal_min`/`subtotal_max` del snapshot (mostrando el rango). Total cotizado de referencia = suma de snapshots. **Precio cobrado al cliente** = `importe_final` del presupuesto (el que fijó Eze al aprobar), no la suma de ítems.
- **Plan por ítem:** `cantidad × precio_unitario` si incluido; excluido = 0.
- **Real por ítem:** suma de `presupuestos_gastos.monto` con ese `plan_item_id`. Sin asignar: bucket aparte visible, entra al total real global.
- **Margen real** = precio cobrado − (real total, asignado + sin asignar). Nada queda escondido.

## UI

- **Ruta:** `/obras/[id]/plan` (sección hermana de `/obras/[id]/gastos`), con acceso desde la pantalla orbital de la obra. Dos tabs internas: **Plan** (edición) y **Cruce** (comparación). Estética App RAVN existente (negro/blanco, Raleway, cero radius).
- **Plan:** dos bloques (Materiales / MO), filas con toggle, cantidad, precio, nota; botón "+ ítem"; leyenda de la regla de reemplazos.
- **Cruce:** resumen de márgenes arriba (cobrado / plan / real / margen $ y %), tabla de tres columnas con desvío por ítem (verde ganó / rojo perdió), sección "sin asignar" con selector inline.
- **Gastos:** en el form de gasto de obra existente, un select opcional "Ítem del plan" (solo si la obra tiene plan).
- **Retroactivo:** en obras con cotización vinculada y sin plan, botón "Importar plan desde cotización". Obras sin cotización: plan arranca vacío, carga manual.

## Casos borde

- Cotización re-aprobada / segunda cotización sobre la misma obra: el import no duplica — si ya hay ítems `origen='cotizacion'` de esa cotización, no vuelve a sembrar.
- Aprobación con `importe_final` distinto del rango: el margen usa siempre `importe_final`.
- Gasto de obra sin plan: todo funciona como hoy; el selector no aparece.
- Fallo del sembrado en la aprobación: la cotización queda aprobada igual (patrón actual); el plan se importa retroactivo con el botón.

## Fuera de alcance (fase 2)

- Matching automático gasto↔ítem por similitud de nombre.
- Edición del plan desde el bot de WhatsApp.
- Vista agregada multi-obra de compras/proveedores.
- Alertas de desvío en vivo durante la obra.

## Enmiendas (plan de implementación 2026-07-03)

1. `obra_plan_items` se clava a `presupuesto_id` (no `obra_id`): todo el módulo obras del repo (`/obras/[id]`, gastos, archivos) usa `presupuestos.id`.
2. `tipo` admite `'extra'`: los extras del desglose (flete, volquete) también se siembran y cruzan.
3. Sin botón "cerrar cruce": la lección se genera en el flujo CERRAR OBRA existente (`finalizarObra` → `correrContrasteObra`), enriquecido con contraste exacto por plan cuando la obra tiene plan.

## Testing

- Unit: sembrado desglose→plan (snapshot correcto, no duplica), cálculo del cruce (excluidos, agregados, sin asignar, margen), guard de borrado según origen/gastos.
- Manual: aprobar una cotización de prueba → plan nace; importar retroactivo en obra existente; cargar gasto con y sin asignación; verificar totales contra cuentas a mano.
