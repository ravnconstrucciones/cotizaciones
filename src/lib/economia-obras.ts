import { roundArs2, parseFormattedNumber } from "./format-currency";
import { parseNum } from "./cashflow-compute";
import { sinEspejosDeGastos } from "./cashflow-gastos-obra";
import { parsePropuestaPrefJsonDesdeMismaFila, importeArsParaPropuesta } from "./ravn-propuesta-pref";
import { parseRentabilidadInputsJson } from "./ravn-rentabilidad-inputs";

export type PresEconomico = {
  id: string; nombre_obra?: string | null; nombre_cliente?: string | null;
  presupuesto_aprobado?: boolean | null; created_at: string;
  propuesta_comercial_pref?: unknown; rentabilidad_inputs?: unknown; moneda?: string | null;
  cant_items?: number;
};
export type ObraEconomica = {
  id: string; presupuesto_id: string; monto_total_a_cobrar_ars?: unknown;
  monto_total_a_cobrar_usd?: unknown; finalizada_at?: string | null;
  cobranza_cerrada_at?: string | null; foto_portada_path?: string | null;
};
export type GastoEconomico = {
  id: string; presupuesto_id: string; importe: unknown; fecha: string;
  descripcion?: string | null; rubro_id?: string | null; plan_item_id?: string | null;
  mo_acuerdo_id?: string | null; operario_id?: string | null; cashflow_item_id?: string | null; cuenta_id?: string | null;
};
export type MovimientoObra = {
  id: string; obra_id: string; tipo: string; monto_real?: unknown; monto_proyectado?: unknown;
  fecha_real?: string | null; estado?: string; deleted_at?: string | null;
  moneda?: string | null; monto_usd?: unknown; categoria?: string | null;
};
export type AcuerdoEconomico = {
  id: string; presupuesto_id: string; moneda: string; monto_arreglado: unknown; estado: string;
};
export type PlanEconomico = {
  id: string; nombre: string; tipo: string; unidad: string | null; cantidad: unknown;
  incluido: boolean; precio_unitario?: unknown;
};
export type MedicionRubro = { rubroId: string; cantidad: number; unidad: string; fecha: string };

const suma = (ns: number[]) => roundArs2(ns.reduce((a, b) => a + Math.round(b * 100), 0) / 100);
export const esGastoManoObra = (g: GastoEconomico) => Boolean(g.mo_acuerdo_id) || g.descripcion?.trim().toLocaleLowerCase("es") === "mano de obra";
export const esMovimientoReal = (m: MovimientoObra) => !m.deleted_at && !["anulado", "cancelado"].includes(m.estado ?? "") && m.monto_real != null && Boolean(m.fecha_real);

/** El gasto y su espejo de cashflow son un único costo. No se mezclan monedas. */
export function calcularEconomiaObra(p: PresEconomico, o: ObraEconomica | null, gastos: GastoEconomico[], movimientos: MovimientoObra[], acuerdos: AcuerdoEconomico[]) {
  const propios = gastos.filter(g => g.presupuesto_id === p.id);
  const reales = movimientos.filter(m => m.obra_id === o?.id && esMovimientoReal(m));
  const egresos = sinEspejosDeGastos(reales, propios).filter(m => m.tipo === "egreso");
  const egresosArs = egresos.filter(m => m.moneda !== "USD");
  const sinValuarUsd = suma(egresos.filter(m => m.moneda === "USD").map(m => parseNum(m.monto_usd ?? m.monto_real)));
  const gastadoArs = suma([...propios.map(g => parseNum(g.importe)), ...egresosArs.map(m => parseNum(m.monto_real))]);
  const moPagadaArs = suma(propios.filter(esGastoManoObra).map(g => parseNum(g.importe)));
  const pagosPersonalSinAcuerdoArs = suma(propios.filter(g => g.operario_id && !esGastoManoObra(g)).map(g => parseNum(g.importe)));
  const propiosAcuerdos = acuerdos.filter(a => a.presupuesto_id === p.id);
  const moPendienteArs = suma(propiosAcuerdos.filter(a => a.moneda === "ARS" && a.estado === "abierto").map(a => Math.max(0, parseNum(a.monto_arreglado) - suma(propios.filter(g => g.mo_acuerdo_id === a.id).map(g => parseNum(g.importe))))));
  const pref = parsePropuestaPrefJsonDesdeMismaFila(p.propuesta_comercial_pref, p.id);
  const ri = parseRentabilidadInputsJson(p.rentabilidad_inputs, p.id);
  const contratoUsd = parseNum(o?.monto_total_a_cobrar_usd) || null;
  const cotizacion = parseFormattedNumber(ri?.cotizacionManualStr ?? "") || pref?.cotizacionVentaArsPorUsd || null;
  const esUsd = Boolean(contratoUsd || pref?.moneda === "USD" || p.moneda === "USD");
  const snapshot = parseNum(o?.monto_total_a_cobrar_ars);
  const contratoArs = esUsd
    ? (contratoUsd && cotizacion ? roundArs2(contratoUsd * cotizacion) : pref ? importeArsParaPropuesta(pref) : null)
    : snapshot > 0 ? snapshot : pref ? importeArsParaPropuesta(pref) : null;
  const cobradoArs = suma(reales.filter(m => m.tipo === "ingreso" && m.moneda !== "USD").map(m => parseNum(m.monto_real)));
  const cobradoUsd = suma(reales.filter(m => m.tipo === "ingreso" && m.moneda === "USD").map(m => parseNum(m.monto_usd ?? m.monto_real)));
  const costoPrevisto = ri ? suma([ri.costoMaterialStr, ri.costoMoStr, ri.costosInternosStr, ri.cargosAdicionalesStr].map(parseFormattedNumber)) : 0;
  const costoCierreArs = roundArs2(Math.max(gastadoArs + moPendienteArs, costoPrevisto));
  const resultadoArs = contratoArs != null && !sinValuarUsd && (propios.length > 0 || egresos.length > 0) ? roundArs2(contratoArs - gastadoArs) : null;
  const margenPct = resultadoArs != null && contratoArs && contratoArs > 0 ? roundArs2(resultadoArs / contratoArs * 100) : null;
  return {
    id: p.id, obraId: o?.id ?? null, nombre: p.nombre_obra?.trim() || p.nombre_cliente?.trim() || "Sin nombre",
    cliente: p.nombre_cliente ?? null, aprobado: Boolean(p.presupuesto_aprobado), createdAt: p.created_at,
    finalizada: Boolean(o?.finalizada_at), cobranzaCerrada: Boolean(o?.cobranza_cerrada_at),
    fotoUrl: null as string | null, fotoPath: o?.foto_portada_path ?? null,
    contratoArs, contratoUsd, esUsd, cotizacion, gastadoArs, moPagadaArs, pagosPersonalSinAcuerdoArs, moPendienteArs,
    moPendienteUsd: propiosAcuerdos.some(a => a.moneda === "USD" && a.estado === "abierto"),
    cobradoArs, cobradoUsd, resultadoArs, margenPct, costoCierreArs,
    resultadoProyectadoArs: contratoArs != null && !sinValuarUsd ? roundArs2(contratoArs - costoCierreArs) : null,
    tienePrevision: costoPrevisto > 0 || moPendienteArs > 0,
    egresosSinRubroArs: suma(egresosArs.map(m => parseNum(m.monto_real))),
    sinValuarUsd, gastosSinCuenta: propios.filter(g => !g.cuenta_id).length,
    cantGastos: propios.length, cantItems: p.cant_items ?? 0,
  };
}
export type EconomiaObra = ReturnType<typeof calcularEconomiaObra>;

export function calcularRubros(gastos: GastoEconomico[], plan: PlanEconomico[], nombres: { id: string; nombre: string }[], mediciones: MedicionRubro[] = []) {
  const etiquetas = new Map(nombres.map(r => [String(r.id), r.nombre.replace(/^\d+\s*[-–]\s*/, "")]));
  const grupos = new Map<string, { id: string; nombre: string; gastadoArs: number; moArs: number; cantidadGastos: number }>();
  for (const g of gastos) {
    const id = g.rubro_id ? String(g.rubro_id) : "sin-rubro";
    const r = grupos.get(id) ?? { id, nombre: etiquetas.get(id) ?? "Sin rubro asignado", gastadoArs: 0, moArs: 0, cantidadGastos: 0 };
    r.gastadoArs = suma([r.gastadoArs, parseNum(g.importe)]);
    if (esGastoManoObra(g)) r.moArs = suma([r.moArs, parseNum(g.importe)]);
    r.cantidadGastos++;
    grupos.set(id, r);
  }
  const rubros = [...grupos.values()].sort((a, b) => b.gastadoArs - a.gastadoArs).map(r => {
    const medicion = mediciones.find(m => m.rubroId === r.id);
    return { ...r, medicion: medicion ?? null, costoUnitario: medicion && medicion.cantidad > 0 ? Math.round(r.gastadoArs / medicion.cantidad * 100 + 1e-8) / 100 : null };
  });
  const trabajos = plan.filter(p => p.incluido).map(p => {
    const propios = gastos.filter(g => g.plan_item_id === p.id);
    const gastadoArs = suma(propios.map(g => parseNum(g.importe)));
    const cantidad = parseNum(p.cantidad);
    return { id: p.id, nombre: p.nombre, unidad: p.unidad, cantidad, gastadoArs, cantidadGastos: propios.length,
      costoUnitario: propios.length > 0 && cantidad > 0 && p.unidad ? Math.round(gastadoArs / cantidad * 100 + 1e-8) / 100 : null };
  });
  const planIds = new Set(plan.map(p => p.id));
  return { rubros, trabajos, sinAsignarArs: suma(gastos.filter(g => !g.plan_item_id || !planIds.has(g.plan_item_id)).map(g => parseNum(g.importe))) };
}
