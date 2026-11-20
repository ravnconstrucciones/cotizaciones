import { cookies, headers } from "next/headers";
import { nombreObraPortal, portalPorSlug, type PortalRow } from "./datos";
import { nombreCookie, sesionValida } from "./sesion";

/**
 * Resuelve qué puede ver quien abre /o/<slug>:
 *   "no_existe" → slug desconocido o portal apagado (misma pantalla para ambos)
 *   "pin"       → falta la contraseña o la sesión venció / cambió la contraseña;
 *                 lleva el nombre de la obra para mostrarlo en la puerta
 *   "ok"        → cookie válida para ESTA obra
 */
/** Ruta de una obra según el dominio: sin "/o" en portal.ravnconstrucciones.com.ar. */
export function rutaObra(host: string | null, slug: string): string {
  return (host ?? "").split(":")[0].toLowerCase() === "portal.ravnconstrucciones.com.ar" ? `/${slug}` : `/o/${slug}`;
}

export async function rutaObraActual(slug: string): Promise<string> {
  return rutaObra((await headers()).get("host"), slug);
}

export async function accesoCliente(
  slug: string
): Promise<{ estado: "no_existe" } | { estado: "pin"; obra: string } | { estado: "ok"; portal: PortalRow }> {
  const portal = await portalPorSlug(slug);
  if (!portal || !portal.activo || !portal.pin_hash) return { estado: "no_existe" };
  const jar = await cookies();
  const valor = jar.get(nombreCookie(slug))?.value;
  if (!sesionValida(valor, portal.presupuesto_id, portal.sesion_version)) return { estado: "pin", obra: await nombreObraPortal(portal) };
  return { estado: "ok", portal };
}
