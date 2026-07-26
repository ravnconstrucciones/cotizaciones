/**
 * Subida DIRECTA a Supabase Storage con URL firmada (spec handoff 26/07).
 *
 * El body de una función de Vercel muere en ~4,5 MB, así que los archivos
 * grandes no pueden viajar por /api. El flujo nuevo es en tres pasos:
 *   1. POST .../archivos/firmar    → el server arma el path y firma la subida.
 *   2. uploadToSignedUrl(...)      → el navegador sube DIRECTO al bucket.
 *   3. POST .../archivos/confirmar → el server verifica el objeto y persiste
 *      la fila (cotizacion_archivos) o la portada (foto_portada_path).
 *
 * Acá vive la lógica pura compartida por los dos endpoints: armado y
 * validación de paths, mapeo tipo→carpeta y techos de tamaño. El path lo
 * genera SIEMPRE el server (el cliente nunca elige dónde escribe) y en
 * `confirmar` se re-valida que el path pertenezca a la cotización de la URL.
 */

export const BUCKET_ARCHIVOS = "obra-archivos";

/** Techo real del bucket: 50 MB. Dejamos margen para fotos de celular. */
export const MAX_SUBIDA_BYTES = 25 * 1024 * 1024;
/** La portada es una imagen de tarjeta: 8 MB alcanza (mismo techo histórico). */
export const MAX_PORTADA_BYTES = 8 * 1024 * 1024;

export const TIPOS_PORTADA_OK = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export type TipoSubida = "foto" | "propuesta" | "diagnostico" | "portada";

const CARPETAS: Record<string, string> = {
  foto: "fotos",
  diagnostico: "diagnosticos",
  propuesta: "propuestas",
  portada: "portadas-cotizacion",
};

/** Misma convención histórica de la ruta multipart: desconocido → propuestas. */
export function carpetaDeTipo(tipo: string): string {
  return CARPETAS[tipo] ?? "propuestas";
}

export function maxBytesDeTipo(tipo: string): number {
  return tipo === "portada" ? MAX_PORTADA_BYTES : MAX_SUBIDA_BYTES;
}

/**
 * Extensión saneada del nombre original (solo [a-z0-9], máx. 10, con
 * fallback). Sin punto en el nombre → fallback: si no, "IMGSINPUNTO" se
 * volvería una "extensión" larguísima que confirmar rechazaría.
 */
export function extensionLimpia(nombre: string, fallback: string): string {
  const punto = nombre.lastIndexOf(".");
  const cruda = punto > 0 ? nombre.slice(punto + 1) : "";
  const ext = cruda.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return ext || fallback;
}

/**
 * Path canónico de una subida: {carpeta}/{cotizacionId}/{ts}.{ext}.
 * `ts` viene de afuera (Date.now() del server) para que esto sea puro.
 */
export function armarPathSubida(opts: {
  cotizacionId: string;
  tipo: string;
  nombre: string;
  ts: number;
}): string {
  const fallback = opts.tipo === "portada" || opts.tipo === "foto" ? "jpg" : "pdf";
  const ext = extensionLimpia(opts.nombre, fallback);
  return `${carpetaDeTipo(opts.tipo)}/${opts.cotizacionId}/${opts.ts}.${ext}`;
}

/**
 * Valida en `confirmar` que el path (que viene del cliente) sea EXACTAMENTE
 * uno que `firmar` pudo haber emitido para esta cotización y este tipo:
 * carpeta correcta, id correcto y nombre {dígitos}.{ext} — nada de `..`,
 * subcarpetas ni nombres arbitrarios. Devuelve false ante cualquier duda.
 */
export function pathValidoParaConfirmar(path: string, cotizacionId: string, tipo: string): boolean {
  if (!cotizacionId) return false;
  const partes = path.split("/");
  if (partes.length !== 3) return false;
  const [carpeta, id, nombre] = partes;
  if (carpeta !== carpetaDeTipo(tipo)) return false;
  if (id !== cotizacionId) return false;
  return /^\d+\.[a-z0-9]{1,10}$/.test(nombre);
}
