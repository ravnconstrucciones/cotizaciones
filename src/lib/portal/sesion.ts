import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Acceso del cliente al portal: contraseña por obra + cookie firmada.
 *
 * - La contraseña la elige Eze en el panel de la obra (15/11/2026: antes era
 *   un PIN numérico generado). Se guarda hasheada (scrypt + sal): no se puede
 *   volver a leer, sólo reemplazar. La columna sigue llamándose `pin_hash`.
 * - La cookie no guarda nada del cliente: sólo vencimiento, versión y una firma
 *   HMAC atada a la obra. Cambiar el PIN sube `sesion_version` y deja sin
 *   efecto todas las cookies anteriores.
 * - La clave de firma se deriva de SUPABASE_SERVICE_ROLE_KEY: no hace falta
 *   provisionar un secreto nuevo y nunca sale del servidor.
 */

const DIAS_SESION = 30;
export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;

export const CLAVE_MIN = 6;
export const CLAVE_MAX = 40;

/** Entre 6 y 40 caracteres, sin espacios al principio ni al final. */
export function claveValida(clave: string): boolean {
  return clave.length >= CLAVE_MIN && clave.length <= CLAVE_MAX && clave === clave.trim();
}

export function hashPin(pin: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(pin, sal, 32);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export function verificarPin(pin: string, guardado: string | null): boolean {
  if (!guardado) return false;
  const [algo, salHex, hashHex] = guardado.split("$");
  if (algo !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = scryptSync(pin, Buffer.from(salHex, "hex"), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

function clave(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  return createHmac("sha256", base).update("ravn-portal-sesion-v1").digest();
}

function firmar(presupuestoId: string, version: number, vence: number): string {
  return createHmac("sha256", clave()).update(`${presupuestoId}.${version}.${vence}`).digest("hex");
}

export function nombreCookie(slug: string): string {
  return `ravn_obra_${slug}`;
}

export function crearSesion(presupuestoId: string, version: number, ahora = Date.now()) {
  const vence = ahora + DIAS_SESION * 24 * 60 * 60 * 1000;
  return {
    valor: `${vence}.${version}.${firmar(presupuestoId, version, vence)}`,
    maxAge: DIAS_SESION * 24 * 60 * 60,
  };
}

export function sesionValida(
  valor: string | undefined,
  presupuestoId: string,
  versionActual: number,
  ahora = Date.now()
): boolean {
  if (!valor) return false;
  const [venceStr, versionStr, firma] = valor.split(".");
  const vence = Number(venceStr);
  const version = Number(versionStr);
  if (!Number.isFinite(vence) || !Number.isFinite(version) || !firma) return false;
  if (vence < ahora || version !== versionActual) return false;
  const esperada = Buffer.from(firmar(presupuestoId, version, vence), "hex");
  const recibida = Buffer.from(firma, "hex");
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}
