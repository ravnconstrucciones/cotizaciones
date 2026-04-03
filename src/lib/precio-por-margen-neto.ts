import { roundArs2 } from "./format-currency";

const MARGEN_MAX_PCT = 99.99;

/**
 * Remarque / recargo sobre costo (markup): cuánto sumás encima del costo.
 * Precio = costo × (1 + remarque/100). Ej.: costo 100 y remarque 40% → precio 140.
 */
export function precioObjetivoPorRemarqueSobreCosto(
  costo: number,
  remarquePct: number
): number {
  const c = roundArs2(costo);
  if (c <= 0) return 0;
  const r = Math.max(0, remarquePct);
  return roundArs2(c * (1 + r / 100));
}

/**
 * Margen neto sobre la venta: qué parte del precio es ganancia.
 * (precio − costo) / precio × 100. Con remarque 40% sobre costo → ≈ 28,57% sobre venta.
 */
export function margenSobreVentaPct(costo: number, precioVenta: number): number {
  const p = roundArs2(precioVenta);
  const c = roundArs2(costo);
  if (p <= 0) return 0;
  return roundArs2(((p - c) / p) * 100);
}

/** Precio que deja `margenPct` % de margen neto sobre la venta: costo / (1 − margen/100). */
export function precioObjetivoPorMargenNeto(
  costo: number,
  margenPct: number
): number {
  const c = roundArs2(costo);
  if (c <= 0) return 0;
  const m = Math.min(Math.max(margenPct, 0), MARGEN_MAX_PCT);
  const denom = 1 - m / 100;
  if (denom <= 0.000_01) return 0;
  return roundArs2(c / denom);
}

/** Descuento comercial sobre el precio ya armado por margen neto. */
export function aplicarBonificacionSobrePrecio(
  precio: number,
  bonificacionPct: number
): number {
  const p = roundArs2(precio);
  if (p <= 0) return 0;
  const b = Math.min(Math.max(bonificacionPct, 0), 100);
  return roundArs2(p * (1 - b / 100));
}
