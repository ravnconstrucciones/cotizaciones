import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";

/** `presupuestos_gastos.importe` se guarda en ARS (incl. presupuestos en USD). */
export function importeGastoObraArs(row: { importe: unknown }): number {
  return roundArs2(parseNum(row.importe));
}

/** Un egreso espejo de un gasto nunca vuelve a sumarse como costo de caja. */
export function sinEspejosDeGastos<T extends {id:string;tipo:string}>(movimientos:T[],gastos:{cashflow_item_id?:string|null}[]):T[]{
  const ids=new Set(gastos.map(g=>g.cashflow_item_id).filter(Boolean));
  return movimientos.filter(m=>m.tipo!=="egreso"||!ids.has(m.id));
}
