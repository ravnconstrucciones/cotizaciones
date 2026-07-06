import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import type { Moneda } from "@/lib/cuentas";

/**
 * Módulo DINERO (spec 2026-07-06) — motor de BOLSILLOS sobre el ledger
 * movimientos_plata. Un bolsillo es (cuenta × dueño): de quién es la plata
 * dentro de cada cuenta. Solo movimientos asentados suman. Durante la
 * convivencia el motor actual (cuentas.ts) sigue mandando; este calcula en
 * paralelo y el chequeo de consistencia compara.
 */

export type DuenoTipo = "obra" | "empresa" | "personal";
export type EstadoMovimiento = "borrador" | "asentado";

export type MovimientoPlataRow = {
  id: string;
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  monto: unknown; // numeric de Supabase llega como string
  moneda: Moneda;
  grupo_id: string;
  origen_tipo: string;
  estado: EstadoMovimiento;
};

export type Bolsillo = {
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  moneda: Moneda;
  saldo: number;
  movimientos: number;
};

export function claveBolsillo(
  cuentaId: string,
  duenoTipo: DuenoTipo,
  duenoObraId: string | null
): string {
  return `${cuentaId}|${duenoTipo}|${duenoObraId ?? ""}`;
}

/** Saldo por bolsillo: Σ movimientos ASENTADOS por (cuenta, dueño). */
export function saldosBolsillos(movimientos: MovimientoPlataRow[]): Bolsillo[] {
  const porClave = new Map<string, Bolsillo>();
  for (const m of movimientos) {
    if (m.estado !== "asentado") continue;
    const clave = claveBolsillo(m.cuenta_id, m.dueno_tipo, m.dueno_obra_id);
    const acc = porClave.get(clave) ?? {
      cuenta_id: m.cuenta_id,
      dueno_tipo: m.dueno_tipo,
      dueno_obra_id: m.dueno_obra_id,
      moneda: m.moneda,
      saldo: 0,
      movimientos: 0,
    };
    acc.saldo = roundArs2(acc.saldo + roundArs2(parseNum(m.monto)));
    acc.movimientos += 1;
    porClave.set(clave, acc);
  }
  return [...porClave.values()];
}

/** Saldo de cada cuenta según el ledger = Σ de sus bolsillos (invariante). */
export function saldosCuentasDesdeLedger(
  movimientos: MovimientoPlataRow[]
): Map<string, number> {
  const porCuenta = new Map<string, number>();
  for (const b of saldosBolsillos(movimientos)) {
    porCuenta.set(b.cuenta_id, roundArs2((porCuenta.get(b.cuenta_id) ?? 0) + b.saldo));
  }
  return porCuenta;
}
