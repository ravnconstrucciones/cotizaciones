export interface MaestroItemCosto {
  costo_mo_m2: number;
  costo_materiales_m2: number;
}
export function costoConstruccionUsdM2(
  items: MaestroItemCosto[],
  cotizacionUsd: number,
): number | null {
  if (!cotizacionUsd || cotizacionUsd <= 0) return null;
  const totalArs = items.reduce(
    (acc, it) => acc + (it.costo_mo_m2 || 0) + (it.costo_materiales_m2 || 0),
    0,
  );
  return Math.round((totalArs / cotizacionUsd) * 100) / 100;
}
