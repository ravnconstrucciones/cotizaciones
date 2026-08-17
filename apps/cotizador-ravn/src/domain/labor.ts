/**
 * MANO DE OBRA COMO RUBRO PROPIO — pedido 3 de Eze (16/08/2026).
 *
 * Textual: *"yo puedo poner mano de obra 1, mano de obra 2, mano de obra 3,
 * porque yo puedo hacer una investigación entre 3 proveedores y ver cuál es el
 * que me cobra más o menos… la que vale es la que yo voy a poner como la que me
 * cobran a mí"*.
 *
 * La MO sale de ser un ítem más del rubro y pasa a ser un rubro aparte, con una
 * lista ABIERTA de contendientes por rubro de obra:
 *
 * - **postulantes** — presupuestos reales de proveedores CON NOMBRE. Los carga
 *   él. Son los únicos que pueden PISAR el costo.
 * - **investigación SISMAT** e **investigación internet** — la vara contra la
 *   que se mide. Nunca las elige Eze: son lo que el motor ya trajo.
 *
 * Y el desvío es el producto: *"recitás el análisis… fijate que SISMAT está un
 * 10% abajo de lo que te está cobrando Fran"*. Por eso acá no se arma una tabla
 * de números, se arma una LECTURA.
 *
 * Todo determinístico y con los umbrales DEL MOTOR (`UMBRAL_DIVERGENCIA_PCT`,
 * `UMBRAL_DIVERGENCIA_CRITICA_PCT`, `VENCIMIENTO_DIAS`), igual que
 * `price-decision.ts` para materiales. No hay criterio paralelo: si el motor
 * mueve un umbral, se mueve también la lectura de la MO.
 */

import {
  UMBRAL_DIVERGENCIA_CRITICA_PCT,
  UMBRAL_DIVERGENCIA_PCT,
} from "../../../../src/lib/cotizador/cotizar";
import type { Unidad } from "../../../../src/lib/cotizador/tipos";
import { VENCIMIENTO_DIAS, diasEntre } from "../../../../src/lib/cotizador/vencimiento";
import { originName, pctDelta } from "./price-decision";
import type { PostulanteMO } from "../taller/types";
import type { BatchItem, QuoteBatch } from "./quote-workspace";

/** Días a partir de los cuales un presupuesto de MO deja de ser confiable. */
export const VENCIMIENTO_MO_DIAS = VENCIMIENTO_DIAS.mano_de_obra;

/**
 * El día de HOY en la máquina de Eze, no en UTC.
 *
 * `toISOString()` devuelve UTC: a las 21 de Buenos Aires ya es el día siguiente,
 * y un presupuesto cargado esta noche aparecía fechado mañana. La fecha de un
 * presupuesto es un dato de obra, así que se mide en la zona en la que se
 * trabaja.
 */
export function hoyLocalIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * `postulante` es un presupuesto de proveedor con nombre — el único que puede
 * pisar el costo. `investigacion` es la vara (SISMAT, internet). `propio` es un
 * precio de MO que Eze ya había cerrado en la mesa de App RAVN: no es una
 * investigación ni un postulante, pero ES el número que hoy está en el costo, y
 * esconderlo haría que un rubro con plata se leyera como "sin precio".
 */
export type LaborContenderKind = "postulante" | "investigacion" | "propio";

export type LaborContender = {
  /** `id` del postulante, o el origen (`sismat`, `internet`, …) si es investigación. */
  id: string;
  kind: LaborContenderKind;
  /** "Fran", "SISMAT", "internet". */
  label: string;
  /** De dónde salió: la procedencia que cargó Eze o la fuente persistida. */
  source: string | null;
  unitPrice: number;
  total: number;
  date: string;
  ageDays: number;
  expired: boolean;
  /** Desvío contra el más barato de TODO el abanico (postulantes + investigación). */
  deltaPct: number | null;
  cheapest: boolean;
  chosen: boolean;
};

export type LaborReadout = {
  severity: "ok" | "warning" | "blocking";
  /** El veredicto en una línea. */
  headline: string;
  /** El análisis recitado: una frase por comparación que valga la pena. */
  lines: string[];
};

export type LaborRubro = {
  batchId: string;
  etapa: string;
  /** Ítem de MO del rubro. Es el que cierra el pase si hay elegido. */
  itemName: string;
  unidad: Unidad;
  cantidad: number;
  contenders: LaborContender[];
  chosen: LaborContender | null;
  /** Lo que entra hoy al costo del rubro. */
  costMin: number | null;
  costMax: number | null;
  costBasis: "postulante" | "propio" | "investigacion" | "sin_precio";
  /** Lo que había calculado el motor para ese ítem, antes de cualquier elegido. */
  engineMin: number | null;
  engineMax: number | null;
  readout: LaborReadout;
};

export type LaborBoard = {
  rubros: LaborRubro[];
  /** Suma de lo que entra al costo. `null` si ningún rubro tiene precio. */
  totalMin: number | null;
  totalMax: number | null;
  /** Rubros con al menos un presupuesto de proveedor cargado. */
  withCandidates: number;
  /** Rubros con un proveedor marcado como "el que me cobran a mí". */
  withChosen: number;
};

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

function pctText(value: number): string {
  return `${Math.abs(value).toLocaleString("es-AR")}%`;
}

/** El único ítem de mano de obra del rubro (en la base nunca hay más de uno). */
function laborItem(batch: QuoteBatch): BatchItem | null {
  return batch.items.find((item) => item.tipo === "mano_de_obra" && !item.manual) ?? null;
}

/**
 * Todo lo que el motor ya persistió para ese ítem. No se descarta ninguna
 * fuente: un precio guardado que no se muestra es un número que desaparece.
 */
function persistedContenders(item: BatchItem, cantidad: number): LaborContender[] {
  return item.offers.map((offer) => ({
    id: offer.origin,
    kind: offer.origin === "eze" ? ("propio" as const) : ("investigacion" as const),
    label: originName(offer.origin),
    source: offer.source,
    unitPrice: offer.value,
    total: offer.value * cantidad,
    date: offer.date,
    ageDays: offer.ageDays,
    expired: offer.expired,
    deltaPct: null,
    cheapest: false,
    chosen: false,
  }));
}

function candidates(
  postulantes: readonly PostulanteMO[],
  cantidad: number,
  today: string
): LaborContender[] {
  return postulantes.map((p) => {
    const ageDays = diasEntre(p.fecha, today);
    return {
      id: p.id,
      kind: "postulante" as const,
      label: p.proveedor,
      source: p.procedencia,
      unitPrice: p.precioUnit,
      total: p.precioUnit * cantidad,
      date: p.fecha,
      ageDays,
      expired: ageDays > VENCIMIENTO_MO_DIAS,
      deltaPct: null,
      cheapest: false,
      chosen: p.elegido,
    };
  });
}

/**
 * La lectura. Cada frase compara DOS números concretos y dice el %: es lo que
 * Eze pidió cuando dijo "recitás el análisis".
 */
function readout(args: {
  contenders: readonly LaborContender[];
  chosen: LaborContender | null;
  postulantes: readonly LaborContender[];
  research: readonly LaborContender[];
  propio: LaborContender | null;
}): LaborReadout {
  const { contenders, chosen, postulantes, research, propio } = args;
  const lines: string[] = [];

  if (contenders.length === 0) {
    return {
      severity: "blocking",
      headline: "Sin precio de mano de obra: ni investigación ni presupuesto.",
      lines: ["Este rubro no suma MO al costo hasta que entre un número."],
    };
  }

  // ── El desvío del elegido contra todo lo demás ──────────────────────────────
  if (chosen) {
    let worst = 0;

    for (const other of contenders) {
      if (other.id === chosen.id) continue;
      const delta = pctDelta(other.unitPrice, chosen.unitPrice);
      if (delta === 0) {
        lines.push(`${other.label} te pasó exactamente el mismo número: ${money(other.total)}.`);
        continue;
      }
      const lado = delta > 0 ? "abajo" : "arriba";
      lines.push(
        `${other.label} está ${pctText(delta)} ${lado} de lo que te cobra ${chosen.label}: ` +
          `${money(other.total)} contra ${money(chosen.total)}.`
      );
      if (other.kind !== "postulante" && delta > worst) worst = delta;
    }

    if (chosen.expired) {
      lines.push(
        `El presupuesto de ${chosen.label} tiene ${chosen.ageDays} días ` +
          `(el límite de la MO son ${VENCIMIENTO_MO_DIAS}): pedile que lo confirme antes de cerrar.`
      );
    }

    const severity =
      worst >= UMBRAL_DIVERGENCIA_CRITICA_PCT
        ? "blocking"
        : worst > UMBRAL_DIVERGENCIA_PCT || chosen.expired
          ? "warning"
          : "ok";

    const headline =
      worst >= UMBRAL_DIVERGENCIA_CRITICA_PCT
        ? `${chosen.label} está más del doble de la referencia: revisá que sea el mismo trabajo.`
        : worst > UMBRAL_DIVERGENCIA_PCT
          ? `${chosen.label} está ${pctText(worst)} arriba de la referencia más barata.`
          : `Va con ${chosen.label}: ${money(chosen.unitPrice)} por unidad · ${money(chosen.total)} el rubro.`;

    return { severity, headline, lines };
  }

  // ── Sin elegido: manda lo que ya tenía el motor, y hay que decir qué falta ──
  const referencias = propio ? [propio, ...research] : research;

  for (const p of postulantes) {
    const contra = referencias;
    for (const ref of contra) {
      const delta = pctDelta(ref.unitPrice, p.unitPrice);
      const lado = delta > 0 ? "arriba" : "abajo";
      lines.push(
        delta === 0
          ? `${p.label} pasó lo mismo que ${ref.label}: ${money(p.total)}.`
          : `${p.label} está ${pctText(delta)} ${lado} de ${ref.label}: ` +
            `${money(p.total)} contra ${money(ref.total)}.`
      );
    }
    if (contra.length === 0) {
      lines.push(`${p.label}: ${money(p.total)}. No hay investigación para contrastarlo.`);
    }
  }

  if (postulantes.length > 1) {
    const barato = postulantes.reduce((low, p) => (p.unitPrice < low.unitPrice ? p : low));
    const caro = postulantes.reduce((high, p) => (p.unitPrice > high.unitPrice ? p : high));
    if (barato.id !== caro.id) {
      lines.push(
        `Entre los presupuestos hay ${pctText(pctDelta(barato.unitPrice, caro.unitPrice))} de ` +
          `diferencia: ${barato.label} es el más barato, ${caro.label} el más caro.`
      );
    }
  }

  const base = propio ? "tu número" : "la investigación";

  if (postulantes.length > 0) {
    return {
      severity: "warning",
      headline:
        postulantes.length === 1
          ? `Tenés el presupuesto de ${postulantes[0].label} y no lo marcaste: el costo sigue siendo ${base}.`
          : `Tenés ${postulantes.length} presupuestos y ninguno marcado: el costo sigue siendo ${base}.`,
      lines,
    };
  }

  // Sin postulantes pero con un número propio ya cerrado: el rubro TIENE precio
  // y hay que decirlo, no leerlo como si estuviera vacío.
  if (propio) {
    for (const ref of research) {
      const delta = pctDelta(ref.unitPrice, propio.unitPrice);
      lines.push(
        delta === 0
          ? `${ref.label} coincide con tu número: ${money(ref.total)}.`
          : `${ref.label} está ${pctText(delta)} ${delta > 0 ? "abajo" : "arriba"} de tu número: ` +
            `${money(ref.total)} contra ${money(propio.total)}.`
      );
    }
    lines.push(
      "Cargá el presupuesto de un proveedor con nombre para saber si ese número sigue siendo el que te cobran."
    );
    return {
      severity: "ok",
      headline: `Cerrado con tu número: ${money(propio.unitPrice)} por unidad · ${money(propio.total)} el rubro.`,
      lines,
    };
  }

  if (research.length === 1) {
    return {
      severity: "warning",
      headline: `Sólo la investigación de ${research[0].label}: nadie pasó precio todavía.`,
      lines: [
        `${research[0].label} da ${money(research[0].total)} el rubro. ` +
          "Cargá el presupuesto de un proveedor para tener contra qué medirlo.",
      ],
    };
  }

  const [a, b] = research;
  const delta = pctDelta(Math.min(a.unitPrice, b.unitPrice), Math.max(a.unitPrice, b.unitPrice));
  return {
    severity: "warning",
    headline: "Nadie pasó precio: el costo es la investigación.",
    lines: [
      delta === 0
        ? `${a.label} e ${b.label} coinciden en ${money(a.total)}.`
        : `${a.label} e ${b.label} difieren ${pctText(delta)}: ${money(a.total)} contra ${money(b.total)}` +
          (delta > UMBRAL_DIVERGENCIA_PCT ? ", que es más de lo que el motor tolera." : "."),
      "Cargá el presupuesto de un proveedor para saber cuál de las dos se parece a la realidad.",
    ],
  };
}

/**
 * Arma el rubro de mano de obra de un rubro de obra: quién compite, cuánto se
 * desvía cada uno y qué entra al costo.
 */
export function laborRubro(
  batch: QuoteBatch,
  postulantes: readonly PostulanteMO[],
  today: string
): LaborRubro | null {
  const item = laborItem(batch);
  if (!item) return null;

  const míos = candidates(
    postulantes.filter((p) => p.batchId === batch.id && p.itemName === item.name),
    item.cantidad,
    today
  );
  const persistidos = persistedContenders(item, item.cantidad);
  const research = persistidos.filter((c) => c.kind === "investigacion");
  const propio = persistidos.find((c) => c.kind === "propio") ?? null;
  const contenders = [...míos, ...persistidos];

  // El más barato del abanico entero: la referencia contra la que se lee todo.
  const cheapest = contenders.length
    ? contenders.reduce((low, c) => (c.unitPrice < low.unitPrice ? c : low))
    : null;

  for (const c of contenders) {
    c.deltaPct = cheapest && contenders.length > 1 ? pctDelta(cheapest.unitPrice, c.unitPrice) : null;
    c.cheapest = cheapest != null && contenders.length > 1 && c.id === cheapest.id;
  }

  const chosen = míos.find((c) => c.chosen) ?? null;

  // Con elegido el costo COLAPSA a su número (regla de Eze: pisa el costo). Sin
  // elegido queda el rango que ya calculó el motor: la investigación.
  const costMin = chosen ? chosen.total : item.priced ? item.subtotalMin : null;
  const costMax = chosen ? chosen.total : item.priced ? item.subtotalMax : null;

  return {
    batchId: batch.id,
    etapa: batch.etapa,
    itemName: item.name,
    unidad: item.unidad,
    cantidad: item.cantidad,
    contenders,
    chosen,
    costMin,
    costMax,
    costBasis: chosen
      ? "postulante"
      : !item.priced
        ? "sin_precio"
        : propio
          ? "propio"
          : "investigacion",
    engineMin: item.priced ? item.subtotalMin : null,
    engineMax: item.priced ? item.subtotalMax : null,
    readout: readout({ contenders, chosen, postulantes: míos, research, propio }),
  };
}

export function laborBoard(
  batches: readonly QuoteBatch[],
  postulantes: readonly PostulanteMO[],
  today: string
): LaborBoard {
  const rubros = batches
    .map((batch) => laborRubro(batch, postulantes, today))
    .filter((rubro): rubro is LaborRubro => rubro !== null);

  const conPrecio = rubros.filter((r) => r.costMin != null && r.costMax != null);

  return {
    rubros,
    totalMin: conPrecio.length ? conPrecio.reduce((sum, r) => sum + (r.costMin ?? 0), 0) : null,
    totalMax: conPrecio.length ? conPrecio.reduce((sum, r) => sum + (r.costMax ?? 0), 0) : null,
    withCandidates: rubros.filter((r) => r.contenders.some((c) => c.kind === "postulante")).length,
    withChosen: rubros.filter((r) => r.chosen != null).length,
  };
}

/**
 * Lo que el elegido de cada rubro le mueve al costo total de la cotización,
 * contra lo que había calculado el motor. Es lo que la consola de margen tiene
 * que sumar para recalcular AL TOQUE, sin confirmación (regla de Eze: *"pisa el
 * costo y recalcula el precio al toque"*).
 */
export function laborOverrideDelta(board: LaborBoard): { min: number; max: number } {
  let min = 0;
  let max = 0;

  for (const rubro of board.rubros) {
    if (!rubro.chosen) continue;
    // Sin precio del motor el postulante no reemplaza nada: SUMA entero.
    min += rubro.chosen.total - (rubro.engineMin ?? 0);
    max += rubro.chosen.total - (rubro.engineMax ?? 0);
  }

  return { min, max };
}
