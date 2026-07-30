/**
 * Costo de IA de RAVN — los DOS lados, separados a propósito (pedido 29/07).
 *
 *  1. SUSCRIPCIONES: fijas, grandes, cobradas en USD. Viven en `finanzas_fijos`
 *     con `categoria='ia'` y `moneda='USD'`.
 *  2. API POR USO: chica, variable. Vive en `api_uso`, la escribe el bot.
 *
 * Hoy los dos números se confunden en uno solo y el fijo parece enorme sin que
 * se vea que la parte variable es centavos. Esta lib los mantiene aparte y
 * calcula la relación entre ambos.
 *
 * Módulo puro: no toca red ni Supabase. La ruta le pasa las filas y el blue.
 * Regla `feedback-dos-cajas-pesos-dolares`: lo que se paga en USD se cuenta en
 * USD y FLOTA al blue venta — nunca se congela en pesos. Por eso `monto_ars`
 * de una fila USD es solo un snapshot y acá se recalcula.
 */

export type FijoIaRow = {
  id: string;
  nombre: string;
  moneda: string;
  monto_usd: number | null;
  monto_ars: number;
  activo: boolean;
  categoria: string | null;
};

export type SuscripcionIa = {
  id: string;
  nombre: string;
  /** null cuando es un fijo en ARS y no hay cotización para convertirlo. */
  usd_mes: number | null;
  ars_mes: number | null;
  /** true = el importe nace en dólares (la fuente de verdad es usd_mes). */
  nativa_usd: boolean;
};

export type BloqueSuscripciones = {
  items: SuscripcionIa[];
  total_usd: number;
  total_ars: number | null;
  /** Ítems que no se pudieron expresar en USD por falta de cotización. */
  sin_cotizacion: number;
};

export type UsoApiRow = {
  creado_at: string;
  servicio: string | null;
  costo_usd: number | string | null;
};

export type BloqueApi = {
  mes_usd: number;
  mes_llamadas: number;
  hoy_usd: number;
  hoy_llamadas: number;
  por_servicio: { servicio: string; usd: number; llamadas: number }[];
};

/** Pesos de un fijo, flotando al blue si nace en dólares. */
export function arsDeFijo(f: FijoIaRow, blue: number | null): number | null {
  if (f.moneda === "USD" && f.monto_usd != null) {
    return blue && blue > 0 ? f.monto_usd * blue : null;
  }
  return f.monto_ars;
}

/** Dólares de un fijo. Un fijo en ARS necesita el blue para expresarse en USD. */
export function usdDeFijo(f: FijoIaRow, blue: number | null): number | null {
  if (f.moneda === "USD" && f.monto_usd != null) return f.monto_usd;
  if (blue && blue > 0) return f.monto_ars / blue;
  return null;
}

/**
 * Las suscripciones de IA activas, ordenadas de mayor a menor gasto.
 *
 * El orden lo decide el importe, no la columna `orden` de la tabla: la card
 * existe para que se vea de un vistazo quién se come la plata.
 */
export function armarSuscripcionesIa(
  fijos: FijoIaRow[],
  blue: number | null
): BloqueSuscripciones {
  const items: SuscripcionIa[] = fijos
    .filter((f) => f.activo && f.categoria === "ia")
    .map((f) => ({
      id: f.id,
      nombre: f.nombre,
      usd_mes: usdDeFijo(f, blue),
      ars_mes: arsDeFijo(f, blue),
      nativa_usd: f.moneda === "USD" && f.monto_usd != null,
    }))
    .sort((a, b) => (b.usd_mes ?? 0) - (a.usd_mes ?? 0));

  const total_usd = items.reduce((acc, i) => acc + (i.usd_mes ?? 0), 0);
  const arsConocidos = items.filter((i) => i.ars_mes != null);
  const total_ars =
    arsConocidos.length === items.length && items.length > 0
      ? arsConocidos.reduce((acc, i) => acc + (i.ars_mes ?? 0), 0)
      : null;

  return {
    items,
    total_usd,
    total_ars,
    sin_cotizacion: items.filter((i) => i.usd_mes == null).length,
  };
}

/**
 * Resume `api_uso` del mes: total, hoy y desglose por servicio.
 *
 * `hoyAR` y `fechaAR` los inyecta la ruta para que el corte del día sea el de
 * Eze (UTC−3) y para que el test no dependa de la hora de la máquina.
 */
export function resumirApiUso(
  filas: UsoApiRow[],
  hoyAR: string,
  fechaAR: (iso: string) => string
): BloqueApi {
  const porServicio = new Map<string, { usd: number; llamadas: number }>();
  let mes_usd = 0;
  let mes_llamadas = 0;
  let hoy_usd = 0;
  let hoy_llamadas = 0;

  for (const f of filas) {
    const costo = Number(f.costo_usd) || 0;
    const servicio = f.servicio ?? "otro";
    mes_usd += costo;
    mes_llamadas += 1;
    const acc = porServicio.get(servicio) ?? { usd: 0, llamadas: 0 };
    acc.usd += costo;
    acc.llamadas += 1;
    porServicio.set(servicio, acc);
    if (fechaAR(f.creado_at) === hoyAR) {
      hoy_usd += costo;
      hoy_llamadas += 1;
    }
  }

  return {
    mes_usd,
    mes_llamadas,
    hoy_usd,
    hoy_llamadas,
    por_servicio: [...porServicio.entries()]
      .map(([servicio, v]) => ({ servicio, ...v }))
      .sort((a, b) => b.usd - a.usd),
  };
}

/**
 * Cuántas veces la suscripción pesa lo que la API del mes.
 *
 * Es EL número de la card: hoy son US$140 de abono contra centavos de uso.
 * null cuando todavía no hay gasto de API (division por cero, no "infinito").
 */
export function ratioSuscripcionApi(
  totalSuscripcionesUsd: number,
  apiMesUsd: number
): number | null {
  if (apiMesUsd <= 0) return null;
  return totalSuscripcionesUsd / apiMesUsd;
}
