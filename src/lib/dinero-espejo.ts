import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import type { Cuenta, Moneda } from "@/lib/cuentas";
import type { DuenoTipo } from "@/lib/dinero";

/**
 * ESPEJO del módulo Dinero (Fase 2): de una fila de detalle a sus patas del
 * ledger. REGLA DE ORO: cada función devuelve EXACTAMENTE el delta que
 * saldosPorCuenta (cuentas.ts) aplica para esa fila — si el motor suma 0,
 * acá van 0 patas. Es lo que mantiene verde el chequeo de consistencia
 * durante la convivencia. Las taras del motor (empresa cross-moneda, USD sin
 * cotización) se corrigen recién en el switch de Fase 4, no acá.
 */

export type PataEspejo = {
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  monto: number;
  moneda: Moneda;
  fecha: string;
  descripcion: string;
};

type CuentaMin = Pick<Cuenta, "id" | "moneda"> | undefined;

const pata = (
  cuenta: NonNullable<CuentaMin>, dueno_tipo: DuenoTipo,
  dueno_obra_id: string | null, monto: number, fecha: string, descripcion: string
): PataEspejo => ({
  cuenta_id: cuenta.id, dueno_tipo, dueno_obra_id,
  monto, moneda: cuenta.moneda, fecha, descripcion,
});

export function filasEspejoGastoObra(
  g: { presupuesto_id: string; importe: unknown; cuenta_id: string | null;
       cotizacion_venta_ars_por_usd?: unknown; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!g.cuenta_id || !cuenta) return [];
  const importeArs = roundArs2(parseNum(g.importe));
  if (importeArs === 0) return [];
  if (cuenta.moneda === "USD") {
    const cot = parseNum(g.cotizacion_venta_ars_por_usd);
    if (!(cot > 0)) return []; // el motor suma 0 sin cotización
    return [pata(cuenta, "obra", g.presupuesto_id, -roundArs2(importeArs / cot), g.fecha, g.descripcion)];
  }
  return [pata(cuenta, "obra", g.presupuesto_id, -importeArs, g.fecha, g.descripcion)];
}

export function filasEspejoCashflow(
  m: { tipo: string; monto_real: unknown; monto_usd?: unknown;
       cuenta_id: string | null; deleted_at?: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin, presupuestoId: string | null, esEspejoDeGasto: boolean
): PataEspejo[] {
  if (esEspejoDeGasto || m.deleted_at || !m.cuenta_id || !cuenta || !presupuestoId) return [];
  const monto = roundArs2(cuenta.moneda === "USD" ? parseNum(m.monto_usd) : parseNum(m.monto_real));
  if (monto === 0) return [];
  return [pata(cuenta, "obra", presupuestoId, m.tipo === "egreso" ? -monto : monto, m.fecha, m.descripcion)];
}

export function filasEspejoGastoEmpresa(
  g: { monto: unknown; moneda?: string | null; cuenta_id: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!g.cuenta_id || !cuenta) return [];
  const monedaGasto = g.moneda === "USD" ? "USD" : "ARS";
  if (cuenta.moneda !== monedaGasto) return []; // el motor suma 0 en el cruce
  const monto = roundArs2(parseNum(g.monto));
  if (monto === 0) return [];
  return [pata(cuenta, "empresa", null, -monto, g.fecha, g.descripcion)];
}

/** Un solo dueño: el gasto personal sale del bolsillo de RAVN (una carga,
 * dos lecturas — alcancía para el día de Eze, retiro del lado empresa). */
export function filasEspejoGastoPersonal(
  g: { monto: unknown; cuenta_id: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!g.cuenta_id || !cuenta) return [];
  const monto = roundArs2(parseNum(g.monto));
  if (monto === 0) return [];
  return [pata(cuenta, "empresa", null, -monto, g.fecha, g.descripcion)];
}

export function filasEspejoRetiro(
  r: { tipo: string; monto_ars: unknown; moneda?: string | null;
       cuenta_id: string | null; fecha: string; descripcion: string },
  cuenta: CuentaMin
): PataEspejo[] {
  if (!r.cuenta_id || !cuenta) return [];
  // El retiro va en su moneda; si no coincide con la cuenta el motor suma 0.
  if (cuenta.moneda !== (r.moneda === "USD" ? "USD" : "ARS")) return [];
  const monto = roundArs2(parseNum(r.monto_ars));
  if (monto === 0) return [];
  return [pata(cuenta, "empresa", null, r.tipo === "aporte" ? monto : -monto, r.fecha, r.descripcion)];
}

export function filasEspejoTransferencia(
  t: { cuenta_origen_id: string | null; cuenta_destino_id: string | null;
       monto_origen: unknown; monto_destino: unknown; fecha: string; descripcion: string },
  cuentaOrigen: CuentaMin, cuentaDestino: CuentaMin,
  dueno: { dueno_tipo: DuenoTipo; dueno_obra_id: string | null }
): PataEspejo[] {
  const patas: PataEspejo[] = [];
  const mo = roundArs2(parseNum(t.monto_origen));
  const md = roundArs2(parseNum(t.monto_destino));
  if (t.cuenta_origen_id && cuentaOrigen && mo !== 0)
    patas.push(pata(cuentaOrigen, dueno.dueno_tipo, dueno.dueno_obra_id, -mo, t.fecha, t.descripcion));
  if (t.cuenta_destino_id && cuentaDestino && md !== 0)
    patas.push(pata(cuentaDestino, dueno.dueno_tipo, dueno.dueno_obra_id, md, t.fecha, t.descripcion));
  return patas;
}
