import { INMOBILIARIO_CONFIG as C } from "@/lib/inmobiliario/config";
import type { Veredicto } from "@/lib/inmobiliario/tipos";

export function calcularVeredicto(
  cierreUsdM2: number | null,
  costoConstrUsdM2: number | null,
  varMensual: number | null,
): Veredicto {
  if (!cierreUsdM2 || !costoConstrUsdM2 || costoConstrUsdM2 <= 0) return "esperar";
  const v = varMensual ?? 0;
  if (v <= C.umbralCaida) return "esperar";
  const brecha = cierreUsdM2 / costoConstrUsdM2;
  if (brecha >= C.brechaAlta && v >= 0) return "construir";
  if (brecha >= C.brechaMedia) return "comprar";
  return "esperar";
}
