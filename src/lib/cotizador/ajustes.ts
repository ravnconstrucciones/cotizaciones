/**
 * Ajustes de la mesa (hoja viva, Tramo B): lo que Eze editó se aplica SOBRE los
 * ítems recién instanciados, en cada corrida del motor. Así una edición
 * sobrevive a re-corridas (cambio de parámetros, refresh de precios) y la
 * receta sigue siendo la fuente de la estructura.
 *
 * Regla de oro: precio corregido por Eze PISA el rango (min = max = valor) y
 * queda con traza propia en precios.eze. La fórmula y los precios de fuente
 * quedan visibles como referencia — se pisa el número, no la traza.
 */
import { roundArs2 } from "../format-currency";
import type { AjustesMesa, ItemDesglose, ItemManualMesa, PrecioFechado } from "./tipos";

/** Recalcula subtotales de un ítem a partir de su cantidad y rango vigentes. */
function recalcularSubtotales(item: ItemDesglose): void {
  item.subtotal_min = item.precio_min == null ? 0 : roundArs2(item.cantidad * item.precio_min);
  item.subtotal_max = item.precio_max == null ? 0 : roundArs2(item.cantidad * item.precio_max);
}

/** Precio Eze sobre un ítem: pisa el rango y deja la traza en precios.eze. */
function aplicarPrecioEze(item: ItemDesglose, precio: PrecioFechado): void {
  item.precios = { ...item.precios, eze: precio };
  item.precio_min = precio.valor;
  item.precio_max = precio.valor;
  item.sin_precio = false;
  recalcularSubtotales(item);
}

/** Ítem manual de la mesa → ItemDesglose (sin fórmula: la cantidad es literal). */
export function itemManualADesglose(manual: ItemManualMesa): ItemDesglose {
  const precio = manual.precio;
  return {
    nombre: manual.nombre,
    etapa: "Agregado en mesa",
    tipo: manual.tipo,
    unidad: manual.unidad,
    formula: "(manual)",
    cantidad_base: manual.cantidad,
    desperdicio_pct: 0,
    cantidad: manual.cantidad,
    precios: precio ? { eze: precio } : {},
    precio_min: precio ? precio.valor : null,
    precio_max: precio ? precio.valor : null,
    subtotal_min: precio ? roundArs2(manual.cantidad * precio.valor) : 0,
    subtotal_max: precio ? roundArs2(manual.cantidad * precio.valor) : 0,
    divergencia_pct: null,
    sin_precio: !precio,
    notas: manual.notas,
    manual: true,
    rubro: manual.rubro,
  };
}

/**
 * Aplica los ajustes de la mesa sobre los ítems instanciados y agrega los
 * manuales al final. Ajustes que apuntan a un nombre que ya no existe en la
 * receta se ignoran en silencio (la receta pudo cambiar de versión).
 * Devuelve TODOS los ítems, incluidos los desactivados (activo: false): la
 * mesa los muestra apagados; quién suma y quién no lo decide cotizar().
 */
export function aplicarAjustes(items: ItemDesglose[], ajustes: AjustesMesa): ItemDesglose[] {
  const porNombre = new Map((ajustes.items ?? []).map((a) => [a.nombre, a]));

  const ajustados = items.map((original) => {
    const ajuste = porNombre.get(original.nombre);
    if (!ajuste) return original;
    const item: ItemDesglose = { ...original, precios: { ...original.precios } };
    if (typeof ajuste.cantidad === "number" && Number.isFinite(ajuste.cantidad)) {
      item.cantidad = ajuste.cantidad;
      item.cantidad_editada = true;
      recalcularSubtotales(item);
    }
    if (ajuste.precio_eze) aplicarPrecioEze(item, ajuste.precio_eze);
    if (ajuste.activo === false) item.activo = false;
    return item;
  });

  return [...ajustados, ...(ajustes.manuales ?? []).map(itemManualADesglose)];
}
