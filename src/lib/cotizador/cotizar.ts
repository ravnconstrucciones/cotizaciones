import { aplicarAjustes } from "./ajustes";
import { evaluarChecklist } from "./checklist";
import { instanciarItems, validarParametros } from "./instanciar";
import { evaluarSanidad, type BandaM2 } from "./sanidad";
import { calcularTiempo, calcularTotales } from "./totales";
import { avisosVencidos } from "./vencimiento";
import type {
  AjustesMesa,
  Desglose,
  Divergencia,
  ExtraDesglose,
  PrecioItem,
  Receta,
  Revision,
} from "./tipos";

/** Imprevistos por defecto si la IA no manda otro (spec §6.2.3). */
export const IMPREVISTOS_DEFAULT_PCT = 10;

/** Umbral de divergencia SISMAT vs internet que se marca en la mesa (§6.4). */
export const UMBRAL_DIVERGENCIA_PCT = 25;

/**
 * Umbral CRÍTICO: uno de los precios es ≥2x el otro (divergencia ≥100%). Hace
 * RUIDO fuerte en la mesa — casi siempre es un ítem SISMAT equivocado para el
 * laburo (el caso pileta: "excavación de sótano a máquina" $62k/m³ usada para
 * excavar una pileta, vs mercado $25k/m³ = 148%). Se eligió 100% y no el "200%"
 * literal que pidió Eze porque su peor error fue 148% y con 200% se escapaba.
 */
export const UMBRAL_DIVERGENCIA_CRITICA_PCT = 100;

export class FaltanParametrosError extends Error {
  faltan: string[];
  constructor(faltan: string[]) {
    super(`Faltan parámetros requeridos de la receta: ${faltan.join(", ")}`);
    this.name = "FaltanParametrosError";
    this.faltan = faltan;
  }
}

/** Lo que decidió la IA. Este módulo hace TODA la aritmética (spec §6.2.1). */
export type EntradaCotizacion = {
  receta: Receta;
  parametros: Record<string, number | string>;
  precios: Record<string, PrecioItem>;
  extras?: ExtraDesglose[];
  imprevistos_pct?: number;
  zona?: string;
  banda_m2?: BandaM2;
  dudas?: string[];
  /** Ediciones de la mesa (hoja viva): se aplican sobre los ítems instanciados. */
  ajustes?: AjustesMesa;
  /** YYYY-MM-DD para el cálculo de vencimientos; default: hoy. Inyectable en tests. */
  hoy?: string;
};

export type CotizacionCalculada = {
  desglose: Desglose;
  revision: Revision;
  total_min: number;
  total_max: number;
};

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function cotizar(entrada: EntradaCotizacion): CotizacionCalculada {
  const faltan = validarParametros(entrada.receta, entrada.parametros);
  if (faltan.length > 0) throw new FaltanParametrosError(faltan);

  const hoy = entrada.hoy ?? hoyIso();
  const extras = entrada.extras ?? [];
  const imprevistos = entrada.imprevistos_pct ?? IMPREVISTOS_DEFAULT_PCT;

  const instanciados = instanciarItems(entrada.receta, entrada.parametros, entrada.precios);
  const items = entrada.ajustes ? aplicarAjustes(instanciados, entrada.ajustes) : instanciados;
  // Los ítems que Eze apagó en la mesa (activo: false) quedan VISIBLES en el
  // desglose pero fuera de todo cálculo y control: no suman, y si el checklist
  // los reclama debe cantar "faltante" (el recorte de alcance se ve).
  const activos = items.filter((i) => i.activo !== false);
  const totales = calcularTotales(activos, extras, {
    imprevistos_pct: imprevistos,
    zona: entrada.zona,
  });
  const tiempo = calcularTiempo(entrada.receta);

  const divergencias: Divergencia[] = activos
    .filter(
      (i) =>
        i.divergencia_pct != null &&
        i.divergencia_pct > UMBRAL_DIVERGENCIA_PCT &&
        i.precios.sismat != null &&
        i.precios.internet != null
    )
    .map((i) => {
      const s = i.precios.sismat!.valor;
      const net = i.precios.internet!.valor;
      const ret = i.precios.retail;
      // Retail como desempate: ¿a cuál se acerca más? Equidistante = null.
      let retailRespalda: "sismat" | "internet" | null = null;
      if (ret) {
        const dS = Math.abs(ret.valor - s);
        const dN = Math.abs(ret.valor - net);
        retailRespalda = dS === dN ? null : dS < dN ? "sismat" : "internet";
      }
      return {
        item: i.nombre,
        sismat: s,
        internet: net,
        divergencia_pct: i.divergencia_pct!,
        nivel:
          i.divergencia_pct! >= UMBRAL_DIVERGENCIA_CRITICA_PCT
            ? ("critica" as const)
            : ("marca" as const),
        fuente_sismat: i.precios.sismat!.fuente,
        fuente_internet: i.precios.internet!.fuente,
        ...(ret
          ? {
              retail: ret.valor,
              fuente_retail: ret.fuente,
              retail_respalda: retailRespalda,
            }
          : {}),
      };
    });

  const revision: Revision = {
    checklist: evaluarChecklist({
      items: activos,
      extras,
      checklist_receta: entrada.receta.checklist,
      imprevistos_pct: imprevistos,
      zona: entrada.zona,
    }),
    sanidad: evaluarSanidad({
      items: activos,
      totales,
      parametros: entrada.parametros,
      banda_m2: entrada.banda_m2,
    }),
    precios_vencidos: avisosVencidos(activos, extras, hoy),
    divergencias,
    dudas: entrada.dudas ?? [],
  };

  const desglose: Desglose = {
    receta_nombre: entrada.receta.nombre,
    receta_version: entrada.receta.version,
    parametros: entrada.parametros,
    items,
    extras,
    totales,
    tiempo,
    generado_at: new Date().toISOString(),
    ...(entrada.ajustes ? { ajustes: entrada.ajustes } : {}),
  };

  return {
    desglose,
    revision,
    total_min: totales.total_min,
    total_max: totales.total_max,
  };
}
