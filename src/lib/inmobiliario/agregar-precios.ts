import type { AvisoNormalizado, AgregadoZona } from "@/lib/inmobiliario/tipos";
import { INMOBILIARIO_CONFIG as C } from "@/lib/inmobiliario/config";
import { mediana, percentil, filtrarOutliers } from "@/lib/inmobiliario/estadistica";

export function agregarZona(avisos: AvisoNormalizado[]): AgregadoZona {
  const pub = filtrarOutliers(
    avisos.filter((a) => a.tipoDato === "publicacion").map((a) => a.usdPorM2),
    C.percentilInferior, C.percentilSuperior,
  );
  const cierre = filtrarOutliers(
    avisos.filter((a) => a.tipoDato === "cierre").map((a) => a.usdPorM2),
    C.percentilInferior, C.percentilSuperior,
  );
  const ref = avisos.filter((a) => a.tipoDato === "referencia").map((a) => a.usdPorM2);

  const medianaPublicacionUsdM2 = mediana(pub);
  const medianaCierreReal = mediana(cierre);
  const refReporteUsdM2 = mediana(ref);
  const nEscrituras = cierre.length;

  let factorAjuste = C.factorAjustePorDefecto;
  let confianza: AgregadoZona["confianza"] = "estimada";

  if (medianaCierreReal !== null && medianaPublicacionUsdM2 !== null && medianaPublicacionUsdM2 > 0) {
    factorAjuste = medianaCierreReal / medianaPublicacionUsdM2;
    confianza = nEscrituras >= C.minEscriturasAlta ? "alta" : "media";
  } else if (refReporteUsdM2 !== null) {
    confianza = "media";
  }

  const medianaCierreUsdM2 =
    medianaCierreReal ??
    (medianaPublicacionUsdM2 !== null ? round2(medianaPublicacionUsdM2 * factorAjuste) : null);

  return {
    medianaPublicacionUsdM2,
    medianaCierreUsdM2,
    factorAjuste: round3(factorAjuste),
    refReporteUsdM2,
    p25UsdM2: percentil(pub, 25),
    p75UsdM2: percentil(pub, 75),
    nAvisos: pub.length,
    nEscrituras,
    confianza,
  };
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
