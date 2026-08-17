/**
 * Helpers puros de la puerta conversacional (spec 2026-08-17): del momento del
 * expediente sale QUÉ ola despacha la caja, y de acá salen el título
 * provisional del borrador y el pie de adjuntos del mensaje.
 */

const TITULO_MAX = 60;

export function tituloProvisional(texto: string, nombresArchivos: string[]): string {
  const renglon = texto
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (renglon) {
    return renglon.length > TITULO_MAX ? `${renglon.slice(0, TITULO_MAX)}…` : renglon;
  }
  const archivo = nombresArchivos[0];
  if (archivo) return archivo.replace(/\.[^.]+$/, "");
  return "Cotización nueva";
}

export function textoConAdjuntos(texto: string, nombresArchivos: string[]): string {
  if (nombresArchivos.length === 0) return texto;
  const pie = `Adjunté: ${nombresArchivos.join(", ")}`;
  return texto.trim().length > 0 ? `${texto.trimEnd()}\n\n${pie}` : pie;
}

export type MomentoExpediente = "entrada" | "reconocimiento" | "charla";

export function momentoDelExpediente(args: {
  entrada: boolean;
  legacyState: string;
  preview: boolean;
}): MomentoExpediente {
  if (args.entrada) return "entrada";
  if (args.legacyState === "borrador" && !args.preview) return "reconocimiento";
  return "charla";
}
