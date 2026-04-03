import { roundArs2 } from "@/lib/format-currency";

/**
 * Redondeo comercial ARS: hacia arriba al siguiente múltiplo de $1.000
 * (ej. $ 58.552,50 → $ 59.000).
 */
export function redondearArsAlMilSuperior(n: number): number {
  const x = roundArs2(Number.isFinite(n) ? n : 0);
  if (x <= 0) return 0;
  return Math.ceil(x / 1000) * 1000;
}
