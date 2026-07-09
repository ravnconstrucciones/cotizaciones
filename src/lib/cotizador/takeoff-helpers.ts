/** Nombres de TODOS los ítems de una receta (material y MO) — para el cache. */
import type { Receta } from "./tipos";

export function itemsDeReceta(receta: Pick<Receta, "etapas">): string[] {
  const nombres = new Set<string>();
  for (const etapa of receta.etapas ?? []) {
    for (const item of etapa.items ?? []) nombres.add(item.nombre);
  }
  return [...nombres];
}

/** Solo los materiales (el refresco retail no busca mano de obra en Easy). */
export function materialesDeReceta(receta: Pick<Receta, "etapas">): string[] {
  const nombres = new Set<string>();
  for (const etapa of receta.etapas ?? []) {
    for (const item of etapa.items ?? []) {
      if (item.tipo === "material") nombres.add(item.nombre);
    }
  }
  return [...nombres];
}
