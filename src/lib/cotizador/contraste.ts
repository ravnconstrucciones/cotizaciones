import { normalizar } from "./texto";
import type { Desglose } from "./tipos";

/** Fila de presupuestos_gastos reducida a lo que necesita el contraste. */
export type GastoRealObra = {
  descripcion: string;
  importe: number;
  fecha: string; // YYYY-MM-DD
};

export type ItemContraste = {
  nombre: string;
  cotizado_min: number;
  cotizado_max: number;
  gastado: number;
  gastos_matcheados: number;
  /** % contra el punto medio cotizado; null si no hubo gastos matcheados. */
  desvio_pct: number | null;
};

/** Calibración de tiempos (spec §6.2.5): duración real estimada por fechas de gastos. */
export type TiempoContraste = {
  dias_cotizados_min: number;
  dias_cotizados_max: number;
  /** Días corridos entre el primer y el último gasto (inclusive); null si no hay fechas válidas. */
  dias_reales: number | null;
  /** 0 = dentro del rango cotizado; positivo = días sobre el máximo; negativo = días bajo el mínimo. */
  desvio_dias: number | null;
};

export type AjusteContraste = {
  total_cotizado_min: number;
  total_cotizado_max: number;
  total_gastado: number;
  desvio_total_pct: number | null;
  items: ItemContraste[];
  gastos_sin_match: Array<{ descripcion: string; importe: number }>;
  tiempo: TiempoContraste;
};

export type ResultadoContraste = {
  leccion: string;
  ajuste: AjusteContraste;
};

const MIN_LARGO_PALABRA = 4;

function palabrasClave(nombre: string): string[] {
  return normalizar(nombre)
    .split(" ")
    .filter((p) => p.length >= MIN_LARGO_PALABRA);
}

function desvioPct(gastado: number, medio: number): number | null {
  if (medio <= 0) return null;
  return Math.round(((gastado - medio) / medio) * 1000) / 10;
}

const MS_POR_DIA = 86_400_000;

/** Días corridos (inclusive) entre el primer y el último gasto con fecha válida. */
function duracionRealDias(gastos: GastoRealObra[]): number | null {
  const tiempos = gastos
    .map((g) => g.fecha)
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
    .map((f) => new Date(`${f}T00:00:00Z`).getTime())
    .filter((t) => Number.isFinite(t));
  if (tiempos.length === 0) return null;
  return Math.round((Math.max(...tiempos) - Math.min(...tiempos)) / MS_POR_DIA) + 1;
}

/**
 * Loop de oro (spec §6.2.5): al cerrar la obra, contrasta el desglose cotizado
 * contra los gastos reales — plata ítem por ítem Y duración (rango de fechas
 * de los gastos vs dias_min/dias_max cotizados). La lección y el ajuste van a
 * cotizador_lecciones (tipo contraste_obra) y se inyectan en la próxima
 * cotización de la receta.
 */
export function contrastarObra(
  desglose: Desglose,
  gastos: GastoRealObra[]
): ResultadoContraste {
  const claves = desglose.items.map((it) => ({ item: it, palabras: palabrasClave(it.nombre) }));
  const porItem = new Map<string, { gastado: number; n: number }>();
  const sinMatch: Array<{ descripcion: string; importe: number }> = [];

  for (const gasto of gastos) {
    const texto = normalizar(gasto.descripcion);
    const hit = claves.find(({ palabras }) => palabras.some((p) => texto.includes(p)));
    if (hit) {
      const acc = porItem.get(hit.item.nombre) ?? { gastado: 0, n: 0 };
      acc.gastado += gasto.importe;
      acc.n += 1;
      porItem.set(hit.item.nombre, acc);
    } else {
      sinMatch.push({ descripcion: gasto.descripcion, importe: gasto.importe });
    }
  }

  const items: ItemContraste[] = desglose.items.map((it) => {
    const acc = porItem.get(it.nombre) ?? { gastado: 0, n: 0 };
    const medio = (it.subtotal_min + it.subtotal_max) / 2;
    return {
      nombre: it.nombre,
      cotizado_min: it.subtotal_min,
      cotizado_max: it.subtotal_max,
      gastado: acc.gastado,
      gastos_matcheados: acc.n,
      desvio_pct: acc.n > 0 ? desvioPct(acc.gastado, medio) : null,
    };
  });

  const totalGastado = gastos.reduce((a, g) => a + g.importe, 0);
  const medioTotal = (desglose.totales.total_min + desglose.totales.total_max) / 2;
  const desvioTotal = desvioPct(totalGastado, medioTotal);

  const peores = items
    .filter((i) => i.desvio_pct != null)
    .sort((a, b) => Math.abs(b.desvio_pct!) - Math.abs(a.desvio_pct!))
    .slice(0, 3)
    .map((i) => `${i.nombre} ${i.desvio_pct! > 0 ? "+" : ""}${i.desvio_pct}%`)
    .join(", ");

  const montoSinMatch = sinMatch.reduce((a, g) => a + g.importe, 0);

  // Calibración de tiempos (spec §6.2.5, segunda mitad).
  const diasReales = duracionRealDias(gastos);
  const diasMin = desglose.tiempo.dias_min;
  const diasMax = desglose.tiempo.dias_max;
  let desvioDias: number | null = null;
  if (diasReales != null) {
    if (diasReales > diasMax) desvioDias = diasReales - diasMax;
    else if (diasReales < diasMin) desvioDias = diasReales - diasMin;
    else desvioDias = 0;
  }
  const tiempo: TiempoContraste = {
    dias_cotizados_min: diasMin,
    dias_cotizados_max: diasMax,
    dias_reales: diasReales,
    desvio_dias: desvioDias,
  };

  let leccion =
    `Contraste de obra (${desglose.receta_nombre} v${desglose.receta_version}): ` +
    `cotizado $${desglose.totales.total_min}–$${desglose.totales.total_max} ` +
    `vs gastado real $${totalGastado}` +
    (desvioTotal == null
      ? "."
      : ` (desvío ${desvioTotal > 0 ? "+" : ""}${desvioTotal}% sobre el punto medio).`);
  if (peores) leccion += ` Mayores desvíos por ítem: ${peores}.`;
  if (sinMatch.length > 0) {
    leccion += ` ${sinMatch.length} gasto(s) sin match por $${montoSinMatch}.`;
  }
  if (diasReales != null) {
    if (desvioDias === 0) {
      leccion += ` Duración real ${diasReales} día(s), dentro del rango cotizado ${diasMin}–${diasMax}.`;
    } else {
      leccion +=
        ` Duración real ${diasReales} día(s) vs ${diasMin}–${diasMax} cotizados ` +
        `(${desvioDias! > 0 ? "+" : ""}${desvioDias} día(s) — ajustar dias_min/dias_max de la receta).`;
    }
  }

  return {
    leccion,
    ajuste: {
      total_cotizado_min: desglose.totales.total_min,
      total_cotizado_max: desglose.totales.total_max,
      total_gastado: totalGastado,
      desvio_total_pct: desvioTotal,
      items,
      gastos_sin_match: sinMatch,
      tiempo,
    },
  };
}
