import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";

/** `presupuestos_gastos.importe` se guarda en ARS (incl. presupuestos en USD). */
export function importeGastoObraArs(row: { importe: unknown }): number {
  return roundArs2(parseNum(row.importe));
}
