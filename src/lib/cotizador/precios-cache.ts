/**
 * Cache fechado de precios (tabla `precios_items`) → PrecioItem del motor.
 *
 * La capa fina del Capítulo 1: acá se decide QUÉ precio ve el panel /cotizar y
 * con qué traza. Regla madre (ley 1): un ítem sin fila en el cache queda SIN
 * precio y el motor lo marca `sin_precio` — jamás se rellena con un invento.
 */
import { fetchPreciosComparados, type PrecioCadena } from "./retail";
import type { PrecioFechado, PrecioItem, PrecioItemRow } from "./tipos";

/** Filas del cache → PrecioItem por nombre de ítem (los 3 slots). */
export function combinarPrecios(rows: PrecioItemRow[]): Record<string, PrecioItem> {
  const out: Record<string, PrecioItem> = {};
  for (const r of rows) {
    const precio: PrecioFechado = { valor: r.valor, fuente: r.fuente, fecha: r.fecha };
    (out[r.item] ??= {})[r.origen] = precio;
  }
  // Solo-retail: instanciar.ts calcula el rango con sismat+internet; si lo único
  // vivo que hay es retail, se copia a internet con la fuente INTACTA ("(ref.
  // retail)") para que el take-off tenga total. No es un invento: es un precio
  // real de catálogo, y la traza dice exactamente de dónde salió.
  for (const p of Object.values(out)) {
    if (p.retail && !p.internet && !p.sismat) p.internet = p.retail;
  }
  return out;
}

/** Primera cadena que trajo precio (la principal del rubro viene primera). */
export function elegirPrecioRetail(comparados: PrecioCadena[]): PrecioFechado | null {
  for (const c of comparados) if (c.precio) return c.precio;
  return null;
}

/** revisado_at más reciente por ítem — para el "revisado hace 2 h" del panel. */
export function revisadoPorItem(rows: PrecioItemRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!out[r.item] || r.revisado_at > out[r.item]) out[r.item] = r.revisado_at;
  }
  return out;
}

/**
 * Busca el precio retail VIVO de cada ítem (cadena de referencia de su rubro,
 * ver retail.ts) y devuelve las filas listas para upsertear en `precios_items`.
 * Los ítems que ninguna cadena tenía NO devuelven fila (ley 1). Secuencial a
 * propósito: son pocas decenas de ítems y no queremos ametrallar los catálogos.
 */
export async function refrescarRetail(
  items: string[],
  hoy: string,
  fetchImpl: typeof fetch = fetch
): Promise<PrecioItemRow[]> {
  const ahora = new Date().toISOString();
  const filas: PrecioItemRow[] = [];
  for (const item of items) {
    const precio = elegirPrecioRetail(await fetchPreciosComparados(item, hoy, fetchImpl));
    if (precio) {
      filas.push({ item, origen: "retail", ...precio, revisado_at: ahora });
    }
  }
  return filas;
}
