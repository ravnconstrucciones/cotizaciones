import type { AvisoVencido, ExtraDesglose, ItemDesglose, PrecioFechado, TipoItem } from "./tipos";

/** Días de validez de un precio (spec §6.2.4, configurable). */
export const VENCIMIENTO_DIAS: Record<TipoItem, number> = {
  material: 15,
  mano_de_obra: 30,
};

const MS_DIA = 24 * 60 * 60 * 1000;

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
