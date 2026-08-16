/**
 * Instrumento de margen (pedido de Eze, 16/08): hasta acá el visor cerraba el
 * COSTO y el precio lo ponía él a ojo. Este módulo hace el tramo que faltaba —
 * de costo a precio — y lo hace DETERMINÍSTICO: la UI no calcula nada, sólo
 * muestra lo que sale de acá.
 *
 * Dos reglas que vienen de afuera del visor y quedan visibles en pantalla para
 * poder discutirlas:
 *
 * 1. **El margen es sobre venta**, no sobre costo: `(precio − costo) / precio`.
 *    Es la misma cuenta que ya usa App RAVN en el cruce de obra
 *    (`src/lib/plan-compra/cruce.ts`: `(cobrado − real_total) / cobrado`), así
 *    que el número que ve acá es comparable con el margen real de la obra
 *    cerrada. Si las dos cuentas no fueran la misma, el contraste mentiría.
 * 2. **El piso es 30%** (`MARGEN_PISO_PCT`). Es regla de negocio de Eze, no un
 *    umbral del motor: por debajo se achica el alcance, no el margen. Se toca
 *    ACÁ y cambia en todo el visor.
 *
 * El costo llega como banda (piso—techo) porque así lo persiste el motor. El
 * margen, entonces, también es banda: el mismo precio deja más margen si la
 * obra sale barata y menos si sale cara. El instrumento muestra las dos puntas
 * sin elegir una (decisión de Eze, 16/08).
 */

/** Piso de margen sobre venta. Regla de Eze, no umbral del motor. */
export const MARGEN_PISO_PCT = 30;

/** Techo del dial de precio, en margen sobre el costo techo. */
export const MARGEN_TECHO_DIAL_PCT = 60;

export type MarginVerdictKind =
  | "sin_costo"
  | "bajo_costo"
  | "bajo_piso"
  | "piso_en_riesgo"
  | "sobre_piso";

export type MarginVerdict = {
  kind: MarginVerdictKind;
  severity: "blocking" | "warning" | "ok";
  /** Qué está pasando con el precio, en una línea. */
  headline: string;
  /** La regla que aplicó el visor, visible para poder discutirla. */
  criterion: string;
};

export type MarginBand = {
  price: number;
  costMin: number;
  costMax: number;
  /** Margen si la obra sale al techo del costo (la punta mala). */
  pctAtCostMax: number;
  /** Margen si la obra sale al piso del costo (la punta buena). */
  pctAtCostMin: number;
  profitAtCostMax: number;
  profitAtCostMin: number;
  /** Puntos de margen que se juegan entre las dos puntas. */
  spreadPoints: number;
  /** Precio que cierra el piso contra cada punta del costo. */
  priceAtFloorOverCostMax: number;
  priceAtFloorOverCostMin: number;
  meetsFloorAlways: boolean;
  verdict: MarginVerdict;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function n(value: number): string {
  return value.toLocaleString("es-AR");
}

/** Margen sobre venta. Precio ≤ 0 no define margen. */
export function marginPct(price: number, cost: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0) return null;
  return round1(((price - cost) / price) * 100);
}

/** Precio que deja `pct` de margen sobre venta contra ese costo. */
export function priceForMargin(pct: number, cost: number): number | null {
  if (!Number.isFinite(pct) || !Number.isFinite(cost) || pct >= 100) return null;
  return Math.round(cost / (1 - pct / 100));
}

/**
 * Escalón de redondeo comercial por magnitud: un presupuesto de millones no se
 * manda con centenas. Redondea SIEMPRE para arriba — hacia abajo se comería el
 * margen que el instrumento acaba de calcular.
 */
export function sellableStep(value: number): number {
  if (value >= 1_000_000) return 50_000;
  if (value >= 100_000) return 10_000;
  return 1_000;
}

export function roundUpToSellable(value: number): number {
  const step = sellableStep(value);
  return Math.ceil(value / step) * step;
}

function verdictFor(args: { pctAtCostMax: number; pctAtCostMin: number }): MarginVerdict {
  const { pctAtCostMax, pctAtCostMin } = args;
  const floorCriterion = `Tu piso es ${MARGEN_PISO_PCT}% sobre venta. Debajo de ahí se achica el alcance, no el margen.`;

  if (pctAtCostMax >= MARGEN_PISO_PCT) {
    return {
      kind: "sobre_piso",
      severity: "ok",
      headline: `Cierra el piso salga como salga: ${n(pctAtCostMax)}% en el peor caso.`,
      criterion: floorCriterion,
    };
  }
  if (pctAtCostMin >= MARGEN_PISO_PCT) {
    return {
      kind: "piso_en_riesgo",
      severity: "warning",
      headline: `Llegás al piso sólo si la obra sale barata: al techo del costo quedás en ${n(pctAtCostMax)}%.`,
      criterion: `${floorCriterion} Acá el piso depende de que el costo no se corra: es apuesta, no margen.`,
    };
  }
  return {
    kind: "bajo_piso",
    severity: "blocking",
    headline: `Bajo el piso en las dos puntas: ${n(pctAtCostMax)}% a ${n(pctAtCostMin)}%.`,
    criterion: floorCriterion,
  };
}

/**
 * La banda de margen de un precio contra la banda de costo persistida.
 * `null` cuando el motor no cerró el costo — sin costo no hay margen que medir.
 */
export function marginBand(args: {
  price: number;
  costMin: number | null;
  costMax: number | null;
}): MarginBand | null {
  const { price, costMin, costMax } = args;
  if (
    costMin == null ||
    costMax == null ||
    !Number.isFinite(costMin) ||
    !Number.isFinite(costMax) ||
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return null;
  }

  const pctAtCostMax = marginPct(price, costMax);
  const pctAtCostMin = marginPct(price, costMin);
  if (pctAtCostMax == null || pctAtCostMin == null) return null;

  const priceAtFloorOverCostMax = priceForMargin(MARGEN_PISO_PCT, costMax) ?? 0;
  const priceAtFloorOverCostMin = priceForMargin(MARGEN_PISO_PCT, costMin) ?? 0;

  const verdict =
    price <= costMax
      ? {
          kind: "bajo_costo" as const,
          severity: "blocking" as const,
          headline:
            price <= costMin
              ? "El precio no cubre ni el piso del costo: estás pagando por trabajar."
              : "El precio no cubre el techo del costo: si la obra se corre, perdés plata.",
          criterion: `El costo directo va de ${n(costMin)} a ${n(costMax)}. Debajo del techo el margen es negativo en el peor caso.`,
        }
      : verdictFor({ pctAtCostMax, pctAtCostMin });

  return {
    price,
    costMin,
    costMax,
    pctAtCostMax,
    pctAtCostMin,
    profitAtCostMax: Math.round(price - costMax),
    profitAtCostMin: Math.round(price - costMin),
    spreadPoints: round1(pctAtCostMin - pctAtCostMax),
    priceAtFloorOverCostMax,
    priceAtFloorOverCostMin,
    meetsFloorAlways: pctAtCostMax >= MARGEN_PISO_PCT,
    verdict,
  };
}

/**
 * Precio de arranque del instrumento: el número ya persistido si existe (así el
 * dial abre donde Eze lo dejó), y si no, el que cierra el piso contra el techo
 * del costo, redondeado a número vendible. Nunca un número inventado: las dos
 * ramas salen de datos persistidos + la regla del piso.
 */
export function openingPrice(args: {
  persistedPrice: number | null;
  costMax: number | null;
}): { price: number; basis: "precio_persistido" | "piso_sobre_costo_techo" } | null {
  if (args.persistedPrice != null && Number.isFinite(args.persistedPrice) && args.persistedPrice > 0) {
    return { price: Math.round(args.persistedPrice), basis: "precio_persistido" };
  }
  if (args.costMax == null || !Number.isFinite(args.costMax) || args.costMax <= 0) return null;
  const floorPrice = priceForMargin(MARGEN_PISO_PCT, args.costMax);
  if (floorPrice == null) return null;
  return { price: roundUpToSellable(floorPrice), basis: "piso_sobre_costo_techo" };
}

/** Extremos del dial de precio: de costo techo (margen 0) al techo del dial. */
export function priceDialRange(costMax: number): { min: number; max: number } {
  return {
    min: Math.round(costMax),
    max: priceForMargin(MARGEN_TECHO_DIAL_PCT, costMax) ?? Math.round(costMax * 2.5),
  };
}
