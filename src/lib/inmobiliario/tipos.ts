export type TipoDato = "publicacion" | "cierre" | "referencia";
export type TipoProp = "departamento" | "casa" | "ph" | "lote";
export type Region = "CABA" | "GBA_NORTE";
export type Veredicto = "construir" | "comprar" | "esperar";
export type Confianza = "alta" | "media" | "estimada";

export interface AvisoNormalizado {
  fuente: string;
  tipoDato: TipoDato;
  fuenteId: string;
  zonaMatch: string;
  operacion: "venta";
  tipoProp: TipoProp;
  precioUsd: number;
  m2: number;
  usdPorM2: number;
  ambientes: number | null;
  antiguedad: number | null;
  capturadoEn: string;
}

export interface AgregadoZona {
  medianaPublicacionUsdM2: number | null;
  medianaCierreUsdM2: number | null;
  factorAjuste: number;
  refReporteUsdM2: number | null;
  p25UsdM2: number | null;
  p75UsdM2: number | null;
  nAvisos: number;
  nEscrituras: number;
  confianza: Confianza;
}
