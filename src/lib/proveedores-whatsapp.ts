/**
 * Teléfonos de la agenda de proveedores → deep link de WhatsApp.
 *
 * El bot (ravn-bots/src/telefonos.js) guarda los teléfonos COMO VENÍAN
 * escritos en el flyer/mensaje ("1156698192", "11 5555-4444", "+54 9 11..."),
 * deduplicados pero sin normalizar a E.164. Acá se normaliza recién al armar
 * el link: wa.me exige 549 + característica + abonado, sin 0 ni 15.
 */

/**
 * Dígitos nacionales del número (característica + abonado, 10 dígitos en el
 * caso típico): saca todo lo no numérico, el prefijo país 54, el 9 de celular
 * internacional, el 0 de discado nacional y el 15 de discado local (asumido
 * AMBA → característica 11; ningún área code argentino arranca con 15).
 * null si lo que queda no tiene forma de teléfono.
 */
export function digitosNacionales(tel: string): string | null {
  let d = String(tel ?? "").replace(/\D/g, "");
  if (d.startsWith("54")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("9")) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 && d.startsWith("15")) d = "11" + d.slice(2);
  if (d.length < 8 || d.length > 11) return null;
  return d;
}

/** Deep link a la conversación de WhatsApp, o null si el número no da. */
export function linkWhatsapp(tel: string): string | null {
  const d = digitosNacionales(tel);
  return d ? `https://wa.me/549${d}` : null;
}

/**
 * Cómo se muestra el número en la tarjeta: "11 5669-8192" para el caso AMBA
 * de 10 dígitos; si no se pudo normalizar, el string tal cual vino del bot.
 */
export function formatoTelefono(tel: string): string {
  const d = digitosNacionales(tel);
  if (d && d.length === 10) {
    return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return String(tel ?? "").trim();
}
