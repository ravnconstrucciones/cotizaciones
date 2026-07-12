/**
 * Recortes del render por ítem (Tramo B ítem 5) — lógica PURA, testeable.
 * El recorte en sí lo hace el browser (canvas); acá viven la validación del
 * rectángulo, el slug del ítem y el path de Storage.
 */

export const CROP_MAX_BYTES = 8 * 1024 * 1024; // 8 MB, mismo límite que la portada.

/** Lado mínimo del rectángulo en px de la imagen original (evita recortes-accidente). */
export const CROP_MIN_LADO = 16;

/** Lado mayor máximo del recorte exportado (el thumbnail se ve a ~36px; 512 sobra para retina). */
export const CROP_EXPORT_MAX = 512;

export type RectCrop = { x: number; y: number; ancho: number; alto: number };

/** Segmento seguro de filename a partir del nombre del ítem (sin acentos ni símbolos). */
export function slugItem(nombre: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "item";
}

export function pathCropItem(
  cotizacionId: string,
  itemNombre: string,
  ext: string,
  ts: number
): string {
  const extLimpia = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `crops-item/${cotizacionId}/${slugItem(itemNombre)}-${ts}.${extLimpia}`;
}

/**
 * Ajusta el rectángulo a los límites de la imagen. Devuelve null si lo que
 * queda es demasiado chico para ser un recorte intencional.
 */
export function normalizarRect(
  rect: RectCrop,
  imgAncho: number,
  imgAlto: number,
  minLado: number = CROP_MIN_LADO
): RectCrop | null {
  if (imgAncho <= 0 || imgAlto <= 0) return null;
  // Acepta rectángulos dibujados en cualquier dirección (ancho/alto negativos).
  let x = rect.ancho < 0 ? rect.x + rect.ancho : rect.x;
  let y = rect.alto < 0 ? rect.y + rect.alto : rect.y;
  let ancho = Math.abs(rect.ancho);
  let alto = Math.abs(rect.alto);
  if (x < 0) {
    ancho += x;
    x = 0;
  }
  if (y < 0) {
    alto += y;
    y = 0;
  }
  ancho = Math.min(ancho, imgAncho - x);
  alto = Math.min(alto, imgAlto - y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || ancho < minLado || alto < minLado) return null;
  return { x: Math.round(x), y: Math.round(y), ancho: Math.round(ancho), alto: Math.round(alto) };
}

/** Escala de exportación: achica si el lado mayor supera CROP_EXPORT_MAX, nunca agranda. */
export function escalaExport(ancho: number, alto: number, max: number = CROP_EXPORT_MAX): number {
  const mayor = Math.max(ancho, alto);
  if (mayor <= max) return 1;
  return max / mayor;
}
