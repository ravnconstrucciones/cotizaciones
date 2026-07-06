import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import type { Cuenta, Moneda } from "@/lib/cuentas";

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

/** Invariantes de un grupo ANTES de asentarlo (spec §Verificación): mismo
 * grupo_id, estado homogéneo, moneda = moneda de la cuenta, monto ≠ 0, dueño
 * obra ⟺ dueno_obra_id. Devuelve la lista de errores; [] = válido. */
export function validarGrupo(
  filas: MovimientoPlataRow[],
  cuentas: Pick<Cuenta, "id" | "moneda">[]
): string[] {
  const errores: string[] = [];
  if (!filas.length) return ["grupo vacío"];
  const monedaDe = new Map(cuentas.map((c) => [c.id, c.moneda]));
  const grupo = filas[0].grupo_id;
  const estado = filas[0].estado;
  for (const f of filas) {
    if (f.grupo_id !== grupo) errores.push(`fila ${f.id}: grupo_id distinto (${f.grupo_id} ≠ ${grupo})`);
    if (f.estado !== estado) errores.push(`fila ${f.id}: estado mixto en el grupo`);
    const monedaCuenta = monedaDe.get(f.cuenta_id);
    if (monedaCuenta && f.moneda !== monedaCuenta)
      errores.push(`fila ${f.id}: moneda ${f.moneda} pero la cuenta es ${monedaCuenta}`);
    if (roundArs2(parseNum(f.monto)) === 0) errores.push(`fila ${f.id}: monto cero`);
    if ((f.dueno_tipo === "obra") !== (f.dueno_obra_id !== null))
      errores.push(`fila ${f.id}: dueño obra sin obra_id (o al revés)`);
  }
  return errores;
}

export type Divergencia = {
  cuenta_id: string;
  saldoLedger: number;
  saldoMotor: number;
  delta: number;
};

/** Convivencia (spec): el saldo por ledger debe igualar el del motor actual
 * en toda cuenta que el ledger conozca. Devuelve las que divergen. */
export function chequeoConsistencia(
  movimientos: MovimientoPlataRow[],
  saldosMotor: Map<string, number>
): Divergencia[] {
  const divergencias: Divergencia[] = [];
  for (const [cuentaId, saldoLedger] of saldosCuentasDesdeLedger(movimientos)) {
    const saldoMotor = saldosMotor.get(cuentaId);
    if (saldoMotor === undefined) continue;
    const delta = roundArs2(saldoLedger - saldoMotor);
    if (delta !== 0) {
      divergencias.push({ cuenta_id: cuentaId, saldoLedger, saldoMotor, delta });
    }
  }
  return divergencias;
}
