import { safeTextEqual } from "./constant-time";

/**
 * Acceso por ENLACE, no por diálogo.
 *
 * El basic auth del navegador pedía usuario y contraseña en cada dispositivo y
 * en cada sesión: fricción pura en la única herramienta que Eze tiene que abrir
 * con ganas. Acá la puerta se cruza UNA vez —el enlace trae la llave— y el
 * navegador se queda con una cookie firmada. La URL sigue siendo pública y el
 * visor sigue mostrando costos y márgenes reales: la llave protege, el diálogo
 * sólo molestaba.
 *
 * La cookie NO es la llave: es un HMAC derivado de ella. Si alguien lee la
 * cookie no puede reconstruir el enlace, y rotar la llave invalida todas las
 * cookies vivas de una.
 */

export const ACCESS_COOKIE = "qz_acceso";
export const ACCESS_QUERY_PARAM = "k";

/** Un año: para el navegador que ya entró una vez, la puerta deja de existir. */
export const ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const COOKIE_PAYLOAD = "cotizador-ravn/acceso/v1";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256 de un texto fijo con la llave. Web Crypto: corre en el Edge. */
export async function deriveAccessCookie(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(COOKIE_PAYLOAD));
  return base64Url(new Uint8Array(signature));
}

/** Falla cerrada: sin llave configurada no entra nadie. */
export function accessKeyMatches(
  candidate: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!expected) return false;
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  return safeTextEqual(candidate, expected);
}

export async function accessCookieIsValid(
  cookie: string | null | undefined,
  key: string | null | undefined
): Promise<boolean> {
  if (!key) return false;
  if (typeof cookie !== "string" || cookie.length === 0) return false;
  return safeTextEqual(cookie, await deriveAccessCookie(key));
}
