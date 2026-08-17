/**
 * El visor está detrás de basic auth, así que la forma cómoda de entrar —y la
 * que documenta el propio handoff— es meter el usuario y la clave en la URL:
 * `http://RAVN:APORTODO@host/`. Con ESE documento abierto, Chrome rebota todo
 * `fetch` de ruta relativa antes de salir a la red:
 *
 *   Request cannot be constructed from a URL that includes credentials
 *
 * y como acá TODO va por rutas relativas (`/api/quotes`, `/api/taller…`,
 * `/api/pase`), la consola quedaba mirando la cotización que abrió el servidor:
 * no se podía cambiar de cotización, la mesa no cargaba y ninguna escritura
 * entraba. Se veía viva y no guardaba nada.
 *
 * `location.origin` NUNCA lleva las credenciales, así que resolver la ruta
 * contra el origen alcanza para que la request salga igual por donde salía.
 */
export function apiUrl(
  path: string,
  origin: string | null = typeof window === "undefined" ? null : window.location.origin
): string {
  if (!origin) return path;
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}
