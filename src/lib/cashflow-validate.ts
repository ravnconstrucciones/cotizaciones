import type { CashflowTipo } from "@/lib/cashflow-compute";

const INGRESO = new Set(["anticipo", "cuota_avance", "cuota_final", "otro"]);
const EGRESO = new Set([
  "material",
  "mano_de_obra",
  "subcontrato",
  "gasto_fijo",
  "otro",
]);

export function categoriaValidaParaTipo(
  tipo: CashflowTipo,
  categoria: string
): boolean {
  if (tipo === "ingreso") return INGRESO.has(categoria);
  return EGRESO.has(categoria);
}

export function categoriasOpciones(tipo: CashflowTipo): string[] {
  return tipo === "ingreso"
    ? ["anticipo", "cuota_avance", "cuota_final", "otro"]
    : ["material", "mano_de_obra", "subcontrato", "gasto_fijo", "otro"];
}
