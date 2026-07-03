import type { Cruce } from "./cruce";

const UMBRAL_DESVIO_PCT = 10;

/**
 * Lección tipo contraste_obra a partir del cruce por plan (vínculo exacto
 * gasto↔ítem, sin matching difuso). Se guarda en cotizador_lecciones y el
 * cotizador maestro la lee antes de la próxima cotización de la receta.
 */
export function leccionDesdeCruce(
  recetaNombre: string,
  cruce: Cruce
): { leccion: string; ajuste: Record<string, unknown> } {
  const desviados = cruce.filas.filter(
    (f) => f.desvio_pct != null && Math.abs(f.desvio_pct) >= UMBRAL_DESVIO_PCT
  );
  const sinCotizar = cruce.filas.filter((f) => f.cotizado == null && (f.plan > 0 || f.real > 0));
  const excluidos = cruce.filas.filter((f) => !f.item.incluido);

  const partes: string[] = [];
  for (const f of desviados) {
    partes.push(`${f.item.nombre}: cotizado ${f.cotizado}, real ${f.real} (${f.desvio_pct}%)`);
  }
  for (const f of sinCotizar) {
    partes.push(
      `${f.item.nombre}: NO estaba cotizado, salió ${f.real || f.plan} — cotizarlo la próxima`
    );
  }
  for (const f of excluidos) {
    partes.push(`${f.item.nombre}: cotizado ${f.cotizado} pero excluido en obra (no se compró)`);
  }
  if (cruce.totales.real_sin_asignar > 0) {
    partes.push(`Gastos sin asignar por ${cruce.totales.real_sin_asignar}`);
  }
  const margen =
    cruce.margen.margen_pct != null ? ` Margen real ${cruce.margen.margen_pct}%.` : "";
  const leccion =
    (partes.length > 0
      ? `Contraste por plan (${recetaNombre}): ${partes.join("; ")}.`
      : `Contraste por plan (${recetaNombre}): sin desvíos relevantes.`) + margen;

  return {
    leccion,
    ajuste: {
      modo: "plan",
      total_cotizado: cruce.totales.cotizado,
      total_plan: cruce.totales.plan,
      total_real: cruce.totales.real_total,
      margen_real_pct: cruce.margen.margen_pct,
      desviados: desviados.map((f) => ({
        nombre: f.item.nombre,
        cotizado: f.cotizado,
        real: f.real,
        desvio_pct: f.desvio_pct,
      })),
      sin_cotizar: sinCotizar.map((f) => ({ nombre: f.item.nombre, real: f.real || f.plan })),
      excluidos: excluidos.map((f) => ({ nombre: f.item.nombre, cotizado: f.cotizado })),
      sin_asignar_total: cruce.totales.real_sin_asignar,
    },
  };
}
