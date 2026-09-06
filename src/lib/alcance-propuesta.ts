import type { ItemDesglose } from "@/lib/cotizador/tipos";

/** El documento y su vista previa comparten exactamente el alcance activo. */
export function agruparAlcancePropuesta(items: ItemDesglose[]) {
  const etapas: { nombre: string; items: ItemDesglose[] }[] = [];
  for (const item of items) {
    if (item.activo === false) continue;
    const nombre = item.etapa?.trim() || "Trabajos previstos";
    const etapa = etapas.find((e) => e.nombre === nombre);
    if (etapa) etapa.items.push(item);
    else etapas.push({ nombre, items: [item] });
  }
  return etapas;
}
