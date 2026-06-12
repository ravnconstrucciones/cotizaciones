import { normalizar } from "./texto";
import type { ExtraDesglose, ItemDesglose, Receta, TotalesDesglose } from "./tipos";

/** Factor de zona para countries / barrios privados (spec §6.2.3: +15–20%). */
export const FACTOR_ZONA_PREMIUM = { min: 1.15, max: 1.2 } as const;

const MARCAS_ZONA_PREMIUM = [
  "nordelta",
  "country",
  "barrio privado",
  "barrio cerrado",
  "puertos",
  "santa barbara",
  "san isidro chico",
];

export function esZonaPremium(zona?: string | null): boolean {
  if (!zona) return false;
  const z = normalizar(zona);
  return MARCAS_ZONA_PREMIUM.some((marca) => z.includes(marca));
}

export type OpcionesTotales = {
  imprevistos_pct: number;
  zona?: string;
};

export function calcularTotales(
  items: ItemDesglose[],
  extras: ExtraDesglose[],
  opciones: OpcionesTotales
): TotalesDesglose {
  let materialesMin = 0;
  let materialesMax = 0;
  let moMin = 0;
  let moMax = 0;
  for (const it of items) {
    if (it.tipo === "material") {
      materialesMin += it.subtotal_min;
      materialesMax += it.subtotal_max;
    } else {
      moMin += it.subtotal_min;
      moMax += it.subtotal_max;
    }
  }
  let extrasMin = 0;
  let extrasMax = 0;
  for (const ex of extras) {
    extrasMin += ex.monto_min;
    extrasMax += ex.monto_max;
  }

  const subtotalMin = materialesMin + moMin + extrasMin;
  const subtotalMax = materialesMax + moMax + extrasMax;

  const premium = esZonaPremium(opciones.zona);
  const factorMin = premium ? FACTOR_ZONA_PREMIUM.min : 1;
  const factorMax = premium ? FACTOR_ZONA_PREMIUM.max : 1;
  const imprevistos = 1 + opciones.imprevistos_pct / 100;

  return {
    materiales_min: materialesMin,
    materiales_max: materialesMax,
    mano_de_obra_min: moMin,
    mano_de_obra_max: moMax,
    extras_min: extrasMin,
    extras_max: extrasMax,
    subtotal_min: subtotalMin,
    subtotal_max: subtotalMax,
    imprevistos_pct: opciones.imprevistos_pct,
    factor_zona_min: factorMin,
    factor_zona_max: factorMax,
    total_min: Math.round(subtotalMin * imprevistos * factorMin),
    total_max: Math.round(subtotalMax * imprevistos * factorMax),
  };
}

export function calcularTiempo(receta: Receta): {
  dias_min: number;
  dias_max: number;
  cuadrilla_max: number;
} {
  let diasMin = 0;
  let diasMax = 0;
  let cuadrilla = 0;
  for (const etapa of receta.etapas) {
    diasMin += etapa.dias_min ?? 0;
    diasMax += etapa.dias_max ?? etapa.dias_min ?? 0;
    cuadrilla = Math.max(cuadrilla, etapa.cuadrilla ?? 0);
  }
  return { dias_min: diasMin, dias_max: diasMax, cuadrilla_max: cuadrilla };
}
