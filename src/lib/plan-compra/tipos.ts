/** Tipos del plan de compra (espejo de la tabla obra_plan_items). */

export type PlanTipo = "material" | "mano_de_obra" | "extra";
export type PlanOrigen = "cotizacion" | "manual";

/** Foto congelada del ítem cotizado. La UI nunca la edita. */
export type CotizadoSnapshot = {
  cantidad: number | null;
  unidad: string | null;
  precio_min: number | null;
  precio_max: number | null;
  subtotal_min: number;
  subtotal_max: number;
  fuente: string | null;
  fecha: string | null; // YYYY-MM-DD del precio de origen
};

export type PlanItemInsert = {
  presupuesto_id: string;
  cotizacion_id: string | null;
  origen: PlanOrigen;
  tipo: PlanTipo;
  nombre: string;
  etapa: string | null;
  unidad: string | null;
  cantidad: number | null;
  precio_unitario: number | null;
  incluido: boolean;
  notas: string | null;
  cotizado: CotizadoSnapshot | null;
};

export type PlanItemRow = PlanItemInsert & { id: string; creado_at: string };

/** Punto medio del subtotal cotizado; null si el ítem es manual (sin snapshot). */
export function cotizadoMedio(item: { cotizado: CotizadoSnapshot | null }): number | null {
  if (!item.cotizado) return null;
  return Math.round((item.cotizado.subtotal_min + item.cotizado.subtotal_max) / 2);
}
