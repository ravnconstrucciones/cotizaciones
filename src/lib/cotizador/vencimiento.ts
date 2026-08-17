import type { AvisoVencido, ExtraDesglose, ItemDesglose, PrecioFechado, TipoItem } from "./tipos";

/** Días de validez de un precio (spec §6.2.4, configurable). */
export const VENCIMIENTO_DIAS: Record<TipoItem, number> = {
  material: 15,
  mano_de_obra: 30,
  // Alquiler de maquinaria: precio de mercado, vence como un material. La
  // propia no lleva precio, así que este valor nunca le aplica.
  maquinaria: 15,
};

/**
 * El precio corregido por Eze pisa el rango pero no es eterno: pasados estos
 * días AVISA en sanidad (decisión Eze 12/07: aviso, nunca borrado — la regla
 * de oro sigue pisando hasta que él lo toque o lo limpie).
 */
export const VENCIMIENTO_EZE_DIAS = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

const CALENDARIO_AR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * HOY como fecha civil argentina (YYYY-MM-DD), la única que sirve acá.
 *
 * `new Date().toISOString()` es UTC: a las 21 de Buenos Aires ya es el día
 * siguiente, así que un precio cerrado de noche quedaba fechado MAÑANA y todo
 * lo que se mide contra "hoy" corría un día. Y `getTimezoneOffset()` tampoco
 * alcanza: da la zona de la MÁQUINA, que en Vercel es UTC — el servidor y el
 * navegador de Eze calculaban días distintos para el mismo instante.
 *
 * La zona se nombra, no se hereda. Mismo criterio que `src/lib/semana.ts`.
 */
export function hoyIsoAR(now: Date = new Date()): string {
  return CALENDARIO_AR.format(now);
}

/** Días de calendario entre dos fechas YYYY-MM-DD (UTC, sin horas). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / MS_DIA);
}

export function precioVencido(
  precio: PrecioFechado,
  tipo: TipoItem,
  hoy: string,
  limites: Record<TipoItem, number> = VENCIMIENTO_DIAS
): boolean {
  return diasEntre(precio.fecha, hoy) > limites[tipo];
}

/** Avisos de TODOS los precios vencidos del desglose (una fila por fuente vencida). */
export function avisosVencidos(
  items: ItemDesglose[],
  extras: ExtraDesglose[],
  hoy: string,
  limites: Record<TipoItem, number> = VENCIMIENTO_DIAS
): AvisoVencido[] {
  const avisos: AvisoVencido[] = [];
  for (const it of items) {
    for (const precio of [it.precios.sismat, it.precios.internet]) {
      if (precio && precioVencido(precio, it.tipo, hoy, limites)) {
        avisos.push({
          item: it.nombre,
          fuente: precio.fuente,
          fecha: precio.fecha,
          dias: diasEntre(precio.fecha, hoy),
          limite: limites[it.tipo],
        });
      }
    }
    const eze = it.precios.eze;
    if (eze && diasEntre(eze.fecha, hoy) > VENCIMIENTO_EZE_DIAS) {
      avisos.push({
        item: it.nombre,
        fuente: eze.fuente,
        fecha: eze.fecha,
        dias: diasEntre(eze.fecha, hoy),
        limite: VENCIMIENTO_EZE_DIAS,
      });
    }
  }
  for (const ex of extras) {
    const precio: PrecioFechado = { valor: ex.monto_max, fuente: ex.fuente, fecha: ex.fecha };
    if (precioVencido(precio, "material", hoy, limites)) {
      avisos.push({
        item: ex.nombre,
        fuente: ex.fuente,
        fecha: ex.fecha,
        dias: diasEntre(ex.fecha, hoy),
        limite: limites.material,
      });
    }
  }
  return avisos;
}
