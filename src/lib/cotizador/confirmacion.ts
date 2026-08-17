/**
 * Precios de la CONFIRMACIÓN del reconocimiento (puerta de entrada, spec
 * 2026-08-17): el motor pone el CUÁNTO con fuente fechada. Acá se fusionan el
 * cache global `precios_items` y las referencias que la ola trajo fechadas.
 * Regla: para sismat/internet gana la fecha más nueva; `eze` es intocable —
 * sale solo del cache, porque es el número que él tipeó alguna vez.
 */
import type { PrecioFechado, PrecioItem, PrecioItemRow } from "./tipos";

export type ReferenciaPrecio = {
  nombre: string;
  valor: number;
  fuente: string;
  fecha: string; // YYYY-MM-DD
  origen: "sismat" | "internet";
};

export function validarReferencia(v: unknown): ReferenciaPrecio | { error: string } {
  const r = v as ReferenciaPrecio;
  if (!r || typeof r !== "object") return { error: "referencia inválida" };
  if (typeof r.nombre !== "string" || !r.nombre.trim()) return { error: "referencia sin nombre" };
  if (!(typeof r.valor === "number" && Number.isFinite(r.valor) && r.valor > 0)) {
    return { error: `referencia "${r.nombre}": valor inválido` };
  }
  if (typeof r.fuente !== "string" || !r.fuente.trim()) {
    return { error: `referencia "${r.nombre}": sin fuente (un precio sin fuente es un invento)` };
  }
  if (typeof r.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) {
    return { error: `referencia "${r.nombre}": fecha inválida (YYYY-MM-DD)` };
  }
  if (r.origen !== "sismat" && r.origen !== "internet") {
    return { error: `referencia "${r.nombre}": origen inválido (sismat | internet)` };
  }
  return { nombre: r.nombre, valor: r.valor, fuente: r.fuente, fecha: r.fecha, origen: r.origen };
}

export function preciosParaConfirmacion(
  nombres: string[],
  cache: PrecioItemRow[],
  referencias: ReferenciaPrecio[]
): Record<string, PrecioItem> {
  const enReceta = new Set(nombres);
  const out: Record<string, PrecioItem> = {};

  const slot = (nombre: string): PrecioItem => (out[nombre] ??= {});

  for (const fila of cache) {
    if (!enReceta.has(fila.item)) continue;
    const fechado: PrecioFechado = { valor: fila.valor, fuente: fila.fuente, fecha: fila.fecha };
    slot(fila.item)[fila.origen] = fechado;
  }

  for (const ref of referencias) {
    if (!enReceta.has(ref.nombre)) continue;
    const actual = slot(ref.nombre)[ref.origen];
    // Fecha ISO: la comparación lexicográfica ES la cronológica.
    if (!actual || ref.fecha > actual.fecha) {
      slot(ref.nombre)[ref.origen] = { valor: ref.valor, fuente: ref.fuente, fecha: ref.fecha };
    }
  }

  // Entradas que quedaron vacías (ni cache ni referencia) no se devuelven:
  // aguas abajo `instanciarItems` las lee como sin_precio.
  for (const nombre of Object.keys(out)) {
    if (Object.keys(out[nombre]).length === 0) delete out[nombre];
  }
  return out;
}
