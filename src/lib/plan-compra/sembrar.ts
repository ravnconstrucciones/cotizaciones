import type { Desglose, ExtraDesglose, ItemDesglose } from "@/lib/cotizador/tipos";
import type { CotizadoSnapshot, PlanItemInsert } from "./tipos";

/** Fuente y fecha "representativas" del ítem: internet si existe, sino SISMAT. */
function fuenteDeItem(item: ItemDesglose): { fuente: string | null; fecha: string | null } {
  const p = item.precios.internet ?? item.precios.sismat ?? null;
  return { fuente: p?.fuente ?? null, fecha: p?.fecha ?? null };
}

function medio(min: number | null, max: number | null): number | null {
  if (min == null || max == null) return null;
  return Math.round((min + max) / 2);
}

function desdeItem(item: ItemDesglose, presupuestoId: string, cotizacionId: string): PlanItemInsert {
  const { fuente, fecha } = fuenteDeItem(item);
  const cotizado: CotizadoSnapshot = {
    cantidad: item.cantidad,
    unidad: item.unidad,
    precio_min: item.precio_min,
    precio_max: item.precio_max,
    subtotal_min: item.subtotal_min,
    subtotal_max: item.subtotal_max,
    fuente,
    fecha,
  };
  return {
    presupuesto_id: presupuestoId,
    cotizacion_id: cotizacionId,
    origen: "cotizacion",
    tipo: item.tipo,
    nombre: item.nombre,
    etapa: item.etapa ?? null,
    unidad: item.unidad ?? null,
    cantidad: item.cantidad,
    precio_unitario: medio(item.precio_min, item.precio_max),
    incluido: true,
    notas: null,
    cotizado,
  };
}

function desdeExtra(extra: ExtraDesglose, presupuestoId: string, cotizacionId: string): PlanItemInsert {
  return {
    presupuesto_id: presupuestoId,
    cotizacion_id: cotizacionId,
    origen: "cotizacion",
    tipo: "extra",
    nombre: extra.nombre,
    etapa: "Extras",
    unidad: null,
    cantidad: 1,
    precio_unitario: medio(extra.monto_min, extra.monto_max),
    incluido: true,
    notas: null,
    cotizado: {
      cantidad: 1,
      unidad: null,
      precio_min: extra.monto_min,
      precio_max: extra.monto_max,
      subtotal_min: extra.monto_min,
      subtotal_max: extra.monto_max,
      fuente: extra.fuente ?? null,
      fecha: extra.fecha ?? null,
    },
  };
}

/**
 * Sembrado del plan de compra (spec 2026-07-03): cada ítem y extra del desglose
 * cotizado se vuelve una fila editable del plan, con la foto cotizada congelada
 * adentro. Puro: el llamador hace el insert.
 */
export function sembrarPlanDesdeDesglose(
  desglose: Desglose,
  presupuestoId: string,
  cotizacionId: string
): PlanItemInsert[] {
  // Los ítems apagados en la hoja viva (activo: false) están FUERA del alcance
  // cotizado: no suman al total y no deben resucitar como compra en el plan.
  const items = (desglose.items ?? [])
    .filter((i) => i.activo !== false)
    .map((i) => desdeItem(i, presupuestoId, cotizacionId));
  const extras = (desglose.extras ?? []).map((e) => desdeExtra(e, presupuestoId, cotizacionId));
  return [...items, ...extras];
}
