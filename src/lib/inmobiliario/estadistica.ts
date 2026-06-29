export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(orden.length / 2);
  return orden.length % 2 === 0 ? (orden[mid - 1] + orden[mid]) / 2 : orden[mid];
}
export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const idx = (p / 100) * (orden.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return orden[lo];
  return orden[lo] + (orden[hi] - orden[lo]) * (idx - lo);
}
export function filtrarOutliers(valores: number[], pInf: number, pSup: number): number[] {
  if (valores.length === 0) return [];
  const min = percentil(valores, pInf);
  const max = percentil(valores, pSup);
  if (min === null || max === null) return valores;
  return valores.filter((v) => v >= min && v <= max);
}
