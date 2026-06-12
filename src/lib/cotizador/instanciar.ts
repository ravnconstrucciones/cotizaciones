import { roundArs2 } from "../format-currency";
import { evaluarFormula } from "./formula";
import type { ItemDesglose, PrecioItem, Receta } from "./tipos";

/** Solo los parámetros numéricos (los de texto/opción no entran a fórmulas). */
export function parametrosNumericos(
  parametros: Record<string, number | string>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parametros)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** Nombres de parámetros requeridos por la receta que faltan en la ficha. */
export function validarParametros(
  receta: Receta,
  parametros: Record<string, number | string>
): string[] {
  return receta.parametros
    .filter((p) => p.requerido && !(p.nombre in parametros))
    .map((p) => p.nombre);
}

function redondearCantidad(
  valor: number,
  redondeo: "arriba" | "ninguno"
): number {
  if (redondeo === "arriba") return Math.ceil(valor - 1e-9);
  return Math.round(valor * 100) / 100;
}

/** Receta + parámetros + precios → ítems del desglose. TODA la aritmética acá. */
export function instanciarItems(
  receta: Receta,
  parametros: Record<string, number | string>,
  precios: Record<string, PrecioItem>
): ItemDesglose[] {
  const vars = parametrosNumericos(parametros);
  const items: ItemDesglose[] = [];
  const etapas = [...receta.etapas].sort((a, b) => a.orden - b.orden);

  for (const etapa of etapas) {
    for (const item of etapa.items) {
      const cantidadBase = evaluarFormula(item.formula, vars);
      const desperdicio = item.desperdicio_pct ?? 0;
      const redondeo =
        item.redondeo ?? (item.tipo === "material" ? "arriba" : "ninguno");
      const cantidad = redondearCantidad(
        cantidadBase * (1 + desperdicio / 100),
        redondeo
      );

      const precioItem = precios[item.nombre] ?? {};
      const valores = [precioItem.sismat?.valor, precioItem.internet?.valor].filter(
        (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0
      );
      const sinPrecio = valores.length === 0;
      const precioMin = sinPrecio ? null : Math.min(...valores);
      const precioMax = sinPrecio ? null : Math.max(...valores);

      let divergencia: number | null = null;
      if (precioItem.sismat && precioItem.internet && precioMin && precioMin > 0) {
        divergencia =
          Math.round(
            (Math.abs(precioItem.internet.valor - precioItem.sismat.valor) /
              precioMin) *
              1000
          ) / 10;
      }

      items.push({
        nombre: item.nombre,
        etapa: etapa.nombre,
        tipo: item.tipo,
        unidad: item.unidad,
        formula: item.formula,
        cantidad_base: roundArs2(cantidadBase),
        desperdicio_pct: desperdicio,
        cantidad,
        precios: precioItem,
        precio_min: precioMin,
        precio_max: precioMax,
        subtotal_min: precioMin == null ? 0 : roundArs2(cantidad * precioMin),
        subtotal_max: precioMax == null ? 0 : roundArs2(cantidad * precioMax),
        divergencia_pct: divergencia,
        sin_precio: sinPrecio,
        rango_fisico: item.rango_fisico,
        notas: item.notas,
      });
    }
  }
  return items;
}
