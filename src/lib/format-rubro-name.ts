/**
 * UI: quita prefijo tipo "1 - " del nombre de rubro tal como viene en BD.
 * No altera ids ni valores persistidos; solo para lectura humana.
 */
export function formatRubroName(name: string): string {
  return String(name ?? "").replace(/^\d+\s*-\s*/, "").trim();
}
