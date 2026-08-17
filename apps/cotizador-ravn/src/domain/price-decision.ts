import {
  UMBRAL_DIVERGENCIA_CRITICA_PCT,
  UMBRAL_DIVERGENCIA_PCT,
} from "../../../../src/lib/cotizador/cotizar";
import type { ItemDesglose, OrigenPrecio, PrecioFechado } from "../../../../src/lib/cotizador/tipos";
import {
  VENCIMIENTO_DIAS,
  VENCIMIENTO_EZE_DIAS,
  diasEntre,
} from "../../../../src/lib/cotizador/vencimiento";

/**
 * Pedidos 9 y 10 de Eze (16/08): cada número comparado contra su referencia, y
 * el visor OPINANDO — cuál es la más barata, cuál usaría, cuál descarta y por
 * qué.
 *
 * Todo lo de acá es DETERMINÍSTICO y sale de los umbrales que ya usa el motor
 * (`UMBRAL_DIVERGENCIA_PCT`, `UMBRAL_DIVERGENCIA_CRITICA_PCT`,
 * `VENCIMIENTO_DIAS`). No hay criterio inventado en el visor: si el motor
 * cambia el umbral, cambia la recomendación. El criterio se muestra en
 * pantalla para que Eze lo pueda discutir.
 */

/** Orden de lectura de las fuentes en el instrumento. */
const OFFER_ORDER: readonly OrigenPrecio[] = ["eze", "sismat", "internet", "retail"] as const;

/** `retail` es desempate de referencia: no entra al costo (ver tipos.ts). */
const COST_ORIGINS: readonly OrigenPrecio[] = ["eze", "sismat", "internet"] as const;

export type ItemOffer = {
  origin: OrigenPrecio;
  value: number;
  source: string;
  date: string;
  ageDays: number;
  expired: boolean;
  /** Desvío contra la oferta más barata que entra al costo. */
  deltaPct: number | null;
  cheapest: boolean;
  recommended: boolean;
  discarded: boolean;
  /** Referencia de mercado que no entra al costo. */
  reference: boolean;
  note: string | null;
};

export type DecisionKind =
  | "sin_precio"
  | "divergencia_critica"
  | "divergencia"
  | "precio_vencido"
  | "sin_contraste"
  | "cerrado";

export type ItemDecision = {
  kind: DecisionKind;
  severity: "blocking" | "warning" | "ok";
  /** Qué hay que decidir, en una línea. */
  headline: string;
  /** La regla que aplicó el visor, visible para poder discutirla. */
  criterion: string;
  /** Divergencia SISMAT vs internet persistida por el motor. */
  spreadPct: number | null;
};

export type ItemPricing = {
  offers: ItemOffer[];
  decision: ItemDecision;
};

const SEVERITY_ORDER: Record<DecisionKind, number> = {
  sin_precio: 0,
  divergencia_critica: 1,
  divergencia: 2,
  precio_vencido: 3,
  sin_contraste: 4,
  cerrado: 5,
};

/** Orden de la cola de decisiones: primero lo que frena el costo. */
export function decisionRank(kind: DecisionKind): number {
  return SEVERITY_ORDER[kind];
}

function limitFor(item: ItemDesglose, origin: OrigenPrecio): number {
  return origin === "eze" ? VENCIMIENTO_EZE_DIAS : VENCIMIENTO_DIAS[item.tipo];
}

/** Formato es-AR para los números que van dentro del texto del veredicto. */
function n(value: number): string {
  return value.toLocaleString("es-AR");
}

/**
 * Desvío de `to` contra `from`, en % con un decimal. Es LA cuenta del desvío en
 * todo el visor: la comparten los precios por ítem y el rubro de mano de obra.
 * No escribir otra.
 */
export function pctDelta(from: number, to: number): number {
  if (from <= 0) return 0;
  return Math.round(((to - from) / from) * 1000) / 10;
}

const pct = pctDelta;

type RawOffer = { origin: OrigenPrecio; price: PrecioFechado; ageDays: number; expired: boolean };

function rawOffers(item: ItemDesglose, today: string): RawOffer[] {
  return OFFER_ORDER.flatMap((origin) => {
    const price = item.precios[origin];
    if (!price) return [];
    const ageDays = diasEntre(price.fecha, today);
    return [{ origin, price, ageDays, expired: ageDays > limitFor(item, origin) }];
  });
}

/**
 * Desempate cuando SISMAT e internet divergen por encima del umbral: gana la
 * que el retail respalda (a cuál le da la razón el mercado). Sin retail no hay
 * desempate y la decisión queda para Eze.
 */
function retailPick(cost: RawOffer[], retail: RawOffer | undefined): RawOffer | null {
  if (!retail || cost.length < 2) return null;
  return [...cost].sort(
    (a, b) =>
      Math.abs(a.price.valor - retail.price.valor) - Math.abs(b.price.valor - retail.price.valor)
  )[0];
}

export function itemPricing(item: ItemDesglose, today: string): ItemPricing {
  const raw = rawOffers(item, today);
  const cost = raw.filter((offer) => COST_ORIGINS.includes(offer.origin));
  const retail = raw.find((offer) => offer.origin === "retail");
  const eze = cost.find((offer) => offer.origin === "eze");
  const cheapest = cost.length
    ? cost.reduce((low, offer) => (offer.price.valor < low.price.valor ? offer : low))
    : null;
  const spreadPct =
    typeof item.divergencia_pct === "number" && Number.isFinite(item.divergencia_pct)
      ? item.divergencia_pct
      : null;

  let recommended: RawOffer | null = null;
  let decision: ItemDecision;

  if (item.sin_precio === true || cost.length === 0) {
    decision = {
      kind: "sin_precio",
      severity: "blocking",
      headline: "Sin precio de costo: el ítem no suma al total.",
      criterion: "Un ítem sin fuente fechada no entra al costo. Definilo o sacalo del alcance.",
      spreadPct,
    };
  } else if (eze) {
    recommended = eze;
    decision = eze.expired
      ? {
          kind: "precio_vencido",
          severity: "warning",
          headline: `Tu número tiene ${eze.ageDays} días y sigue pisando el rango.`,
          criterion: `Regla de la mesa: el precio tuyo pisa siempre. Pasados ${VENCIMIENTO_EZE_DIAS} días avisa, no se borra.`,
          spreadPct,
        }
      : {
          kind: "cerrado",
          severity: "ok",
          headline: "Cerrado con tu número.",
          criterion: "Regla de la mesa: el precio corregido por vos pisa el rango.",
          spreadPct,
        };
  } else if (cost.length === 1) {
    recommended = cost[0];
    const only = cost[0];
    decision = only.expired
      ? {
          kind: "precio_vencido",
          severity: "warning",
          headline: `Precio de ${only.ageDays} días y sin contraste.`,
          criterion: `Un ${item.tipo === "material" ? "material" : "trabajo"} vence a los ${limitFor(item, only.origin)} días. Falta además la segunda fuente.`,
          spreadPct,
        }
      : {
          kind: "sin_contraste",
          severity: "warning",
          headline: "Una sola fuente: entra al costo sin contraste.",
          criterion: "El costo se cierra con dos fuentes (SISMAT + internet) o con tu número.",
          spreadPct,
        };
  } else if (spreadPct !== null && spreadPct >= UMBRAL_DIVERGENCIA_CRITICA_PCT) {
    decision = {
      kind: "divergencia_critica",
      severity: "blocking",
      headline: `Las fuentes difieren ${n(spreadPct)}%: una de las dos está equivocada.`,
      criterion: `Arriba de ${UMBRAL_DIVERGENCIA_CRITICA_PCT}% casi siempre es un ítem de SISMAT que no corresponde al laburo. No recomiendo ninguna hasta revisarlo.`,
      spreadPct,
    };
  } else if (spreadPct !== null && spreadPct > UMBRAL_DIVERGENCIA_PCT) {
    const pick = retailPick(cost, retail);
    recommended = pick;
    decision = pick
      ? {
          kind: "divergencia",
          severity: "warning",
          headline: `Difieren ${n(spreadPct)}%: el retail le da la razón a ${originName(pick.origin)}.`,
          criterion: `Arriba de ${UMBRAL_DIVERGENCIA_PCT}% desempata el precio de retail, que es referencia de mercado y no entra al costo.`,
          spreadPct,
        }
      : {
          kind: "divergencia",
          severity: "warning",
          headline: `Difieren ${n(spreadPct)}% y no hay retail para desempatar.`,
          criterion: `Arriba de ${UMBRAL_DIVERGENCIA_PCT}% no elijo solo: falta un tercer precio o tu decisión.`,
          spreadPct,
        };
  } else {
    recommended = cheapest;
    decision = {
      kind: "cerrado",
      severity: "ok",
      headline:
        spreadPct === null
          ? "Fuentes coincidentes: entra la más barata."
          : `Las dos fuentes coinciden dentro del ${n(spreadPct)}%: entra la más barata.`,
      criterion: `Debajo de ${UMBRAL_DIVERGENCIA_PCT}% de diferencia el visor toma la más barata con fuente fechada.`,
      spreadPct,
    };
  }

  /**
   * Un precio vencido devuelve el ítem a la cola — pero SÓLO si es el precio que
   * está en el costo. Con el ítem cerrado por Eze, el número que manda es el
   * suyo (esa es la regla de la mesa) y un SISMAT viejo al lado no lo mueve: la
   * tarjeta era ruido en la única cola que tiene que llegar a cero para que se
   * despliegue el tablero. La referencia vieja se sigue viendo en la oferta, con
   * su nota de vencida — no se esconde nada, deja de pedir una decisión que ya
   * está tomada.
   */
  const expiredCost = cost.filter((offer) => offer.expired && !(eze && offer.origin !== "eze"));
  if (decision.kind === "cerrado" && expiredCost.length > 0) {
    const worst = expiredCost.reduce((old, offer) => (offer.ageDays > old.ageDays ? offer : old));
    decision = {
      kind: "precio_vencido",
      severity: "warning",
      headline: `El precio de ${originName(worst.origin)} tiene ${worst.ageDays} días.`,
      criterion: `Un ${item.tipo === "material" ? "material" : "trabajo"} vence a los ${limitFor(item, worst.origin)} días: hay que refrescarlo antes de cerrar.`,
      spreadPct,
    };
  }

  const base = cheapest?.price.valor ?? null;

  const offers: ItemOffer[] = raw.map((offer) => {
    const reference = offer.origin === "retail";
    const isRecommended = recommended?.origin === offer.origin;
    const isCheapest = !reference && cheapest?.origin === offer.origin && cost.length > 1;
    const discarded =
      !reference &&
      !isRecommended &&
      cost.length > 1 &&
      (offer.expired || decision.kind === "divergencia");

    return {
      origin: offer.origin,
      value: offer.price.valor,
      source: offer.price.fuente,
      date: offer.price.fecha,
      ageDays: offer.ageDays,
      expired: offer.expired,
      deltaPct: base === null || reference ? null : pct(base, offer.price.valor),
      cheapest: isCheapest,
      recommended: isRecommended,
      discarded,
      reference,
      note: offerNote({ offer, reference, discarded, decisionKind: decision.kind, item }),
    };
  });

  return { offers, decision };
}

function offerNote(args: {
  offer: RawOffer;
  reference: boolean;
  discarded: boolean;
  decisionKind: DecisionKind;
  item: ItemDesglose;
}): string | null {
  const { offer, reference, discarded, decisionKind, item } = args;
  if (reference) return "Referencia de mercado · no entra al costo";
  if (offer.expired) {
    return `Vencido: ${offer.ageDays} días (límite ${offer.origin === "eze" ? VENCIMIENTO_EZE_DIAS : VENCIMIENTO_DIAS[item.tipo]})`;
  }
  if (discarded && decisionKind === "divergencia") return "Descartada: el retail no la respalda";
  return null;
}

const ORIGIN_NAMES: Record<OrigenPrecio, string> = {
  sismat: "SISMAT",
  internet: "internet",
  retail: "retail",
  eze: "tu número",
};

export function originName(origin: OrigenPrecio): string {
  return ORIGIN_NAMES[origin];
}
