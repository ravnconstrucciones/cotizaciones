/** Panel de referencia del usuario (mismas variantes que listan en Mercados Online). */
export const CRONISTA_DOLAR_URL =
  "https://www.cronista.com/MercadosOnline/dolar.html";

/** Etiquetas al estilo panel de El Cronista (Mercados Online / Dólar). */
export const ETIQUETA_CASA_DOLAR: Record<string, string> = {
  oficial: "Oficial (BNA)",
  blue: "Blue",
  bolsa: "MEP (Bolsa)",
  contadoconliqui: "CCL (contado con liquidación)",
  mayorista: "Mayorista",
  tarjeta: "Tarjeta / turista",
  cripto: "Cripto (USDT)",
};

export function etiquetaCasaDolar(casa: string, nombreApi: string): string {
  return ETIQUETA_CASA_DOLAR[casa] ?? nombreApi;
}
