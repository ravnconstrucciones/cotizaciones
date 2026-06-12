import type { ItemDesglose, ResultadoSanidad, TotalesDesglose } from "./tipos";

/** Banda de mercado del rubro en $/m² — la trae la IA con fuente y fecha. */
export type BandaM2 = { min: number; max: number; fuente: string; fecha: string };

export type EntradaSanidad = {
  items: ItemDesglose[];
  totales: TotalesDesglose;
  parametros: Record<string, number | string>;
  banda_m2?: BandaM2;
};

/** Convención de la receta: el parámetro de superficie se llama así. */
const PARAMETRO_SUPERFICIE = "superficie_m2";

/**
 * Sanidad física (spec §6.2.7): rendimientos dentro de rangos físicos,
 * ítems sin precio marcados, y precio final por m² dentro de la banda
 * de mercado del rubro. Fuera de banda → la mesa lo muestra, no se entrega solo.
 */
export function evaluarSanidad(entrada: EntradaSanidad): ResultadoSanidad[] {
  const out: ResultadoSanidad[] = [];

  for (const it of entrada.items) {
    if (it.rango_fisico) {
      const base = entrada.parametros[it.rango_fisico.parametro];
      if (typeof base !== "number" || !Number.isFinite(base) || base <= 0) {
        out.push({
          chequeo: `rendimiento: ${it.nombre}`,
          estado: "sin_datos",
          detalle: `falta el parámetro "${it.rango_fisico.parametro}" para chequear el rango físico`,
        });
      } else {
        const ratio = Math.round((it.cantidad / base) * 10000) / 10000;
        const ok = ratio >= it.rango_fisico.min && ratio <= it.rango_fisico.max;
        out.push({
          chequeo: `rendimiento: ${it.nombre}`,
          estado: ok ? "ok" : "fuera_de_rango",
          detalle: `${ratio} ${it.unidad} por ${it.rango_fisico.parametro} (admisible ${it.rango_fisico.min}–${it.rango_fisico.max})`,
        });
      }
    }
    if (it.sin_precio) {
      out.push({
        chequeo: `precio: ${it.nombre}`,
        estado: "sin_datos",
        detalle: "ítem sin precio: el total está incompleto hasta conseguirlo",
      });
    }
  }

  const superficie = entrada.parametros[PARAMETRO_SUPERFICIE];
  if (typeof superficie !== "number" || !Number.isFinite(superficie) || superficie <= 0) {
    out.push({
      chequeo: "precio por m2",
      estado: "sin_datos",
      detalle: `sin parámetro ${PARAMETRO_SUPERFICIE}: no se puede chequear la banda de mercado`,
    });
  } else if (!entrada.banda_m2) {
    out.push({
      chequeo: "precio por m2",
      estado: "sin_datos",
      detalle: "sin banda de mercado del rubro (banda_m2): conseguirla con fuente y fecha",
    });
  } else {
    const pm2Min = Math.round(entrada.totales.total_min / superficie);
    const pm2Max = Math.round(entrada.totales.total_max / superficie);
    const fuera = pm2Max < entrada.banda_m2.min || pm2Min > entrada.banda_m2.max;
    out.push({
      chequeo: "precio por m2",
      estado: fuera ? "fuera_de_rango" : "ok",
      detalle: `$${pm2Min}–$${pm2Max}/m² vs banda $${entrada.banda_m2.min}–$${entrada.banda_m2.max} (${entrada.banda_m2.fuente}, ${entrada.banda_m2.fecha})`,
    });
  }

  return out;
}
