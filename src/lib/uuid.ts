/**
 * Validación de UUID (v1–v5, case-insensitive). Pura y testeable.
 * Defensiva: cualquier valor no-string devuelve false sin tirar.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor.trim());
}
