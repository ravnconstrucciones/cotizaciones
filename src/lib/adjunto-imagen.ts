/**
 * Validación PURA de la imagen adjunta del prompt box (sin Supabase: testeable).
 * Límites del componente de referencia (AI Prompt Box 21st.dev): imagen, máx 10 MB.
 */

export const ADJUNTO_IMAGEN_MAX_BYTES = 10 * 1024 * 1024;

export function validarImagenAdjunta(file: {
  type: string;
  size: number;
}): string | null {
  if (!file.type.startsWith("image/")) {
    return "Solo se pueden adjuntar imágenes.";
  }
  if (file.size > ADJUNTO_IMAGEN_MAX_BYTES) {
    return "La imagen supera los 10 MB.";
  }
  return null;
}

/** Extensión segura para el path de Storage (fallback jpg, mismo criterio que gastos-storage). */
export function extensionImagen(file: { name: string; type: string }): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName) && fromName !== file.name.toLowerCase()) {
    return fromName;
  }
  const t = file.type.toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("avif")) return "avif";
  return "jpg";
}
