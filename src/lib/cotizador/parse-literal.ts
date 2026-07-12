/**
 * Parsea un número tipeado en la mesa con convención argentina: coma
 * decimal, punto de miles ("1.234,56" → 1234.56).
 *
 * Excepción anti-footgun: un solo punto seguido de 1 o 2 dígitos al final,
 * sin coma, es decimal inequívoco — un grupo de miles lleva exactamente 3
 * dígitos, así que "2.5" solo puede querer decir 2,5 (antes se leía 25,
 * violando la regla de importes literales).
 *
 * Devuelve null si no es un número > 0.
 */
export function parseLiteral(s: string): number | null {
  const crudo = s.trim();
  if (crudo === "") return null;
  const limpio =
    !crudo.includes(",") && /^\d+\.\d{1,2}$/.test(crudo)
      ? crudo
      : crudo.replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}
