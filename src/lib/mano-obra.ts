/**
 * Lógica PURA del módulo Mano de Obra — testeable sin DB.
 * Un "pago" es una fila de presupuestos_gastos con mo_acuerdo_id (una sola
 * fila de plata). El saldo NUNCA se persiste: siempre sale de acá.
 * Acuerdo USD: el importe del gasto viaja en ARS (convención), así que el
 * pagado se reconstruye con la cotización del gasto; sin cotización el pago
 * NO suma y se cuenta en pagosSinCotizacion (la pantalla lo marca — nunca
 * en silencio).
 */

export type AcuerdoMO = {
  id: string;
  presupuesto_id: string;
  persona: string | null;
  trabajo: string;
  monto_arreglado: number;
  moneda: "ARS" | "USD";
  estado: "abierto" | "saldado";
  notas: string | null;
  created_at: string;
};

export type PagoMO = {
  id: string;
  mo_acuerdo_id: string | null;
  importe: number;
  fecha: string;
  descripcion: string | null;
  cotizacion_venta_ars_por_usd: number | null;
  /** Caja de la que salió = medio de pago (join a cuentas en la pantalla). */
  cuenta_id?: string | null;
};

export type ResumenAcuerdo = {
  acuerdo: AcuerdoMO;
  pagado: number;
  saldo: number;
  pagos: PagoMO[];
  ultimoPago: string | null;
  pagosSinCotizacion: number;
  /** % del arreglado ya pagado (0–100+; >100 = se pagó de más). */
  porcentajePagado: number;
};

export function resumirAcuerdo(acuerdo: AcuerdoMO, pagos: PagoMO[]): ResumenAcuerdo {
  const propios = pagos
    .filter((p) => p.mo_acuerdo_id === acuerdo.id)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  let pagado = 0;
  let pagosSinCotizacion = 0;
  for (const p of propios) {
    const importe = Number(p.importe) || 0;
    if (acuerdo.moneda === "USD") {
      const cot = Number(p.cotizacion_venta_ars_por_usd);
      if (cot > 0) pagado += importe / cot;
      else pagosSinCotizacion += 1;
    } else {
      pagado += importe;
    }
  }
  pagado = Math.round(pagado * 100) / 100;
  const monto = Number(acuerdo.monto_arreglado);
  return {
    acuerdo,
    pagado,
    saldo: Math.round((monto - pagado) * 100) / 100,
    pagos: propios,
    ultimoPago: propios[0]?.fecha ?? null,
    pagosSinCotizacion,
    porcentajePagado: monto > 0 ? Math.round((pagado / monto) * 100) : 0,
  };
}

export function resumirAcuerdos(acuerdos: AcuerdoMO[], pagos: PagoMO[]): ResumenAcuerdo[] {
  return acuerdos.map((a) => resumirAcuerdo(a, pagos));
}

export type FiltroInformeMO = {
  persona: string;
  /** "YYYY-MM-DD" inclusive; null/undefined = sin tope. */
  desde?: string | null;
  hasta?: string | null;
};

export type AcuerdoInforme = {
  acuerdo: AcuerdoMO;
  /** Pagos dentro del período, viejo → nuevo (orden cronológico de estado de cuenta). */
  pagosPeriodo: PagoMO[];
  /** Suma de importes del período tal como viajan en la fila (ARS por convención). */
  pagadoPeriodo: number;
  pagadoTotal: number;
  saldo: number;
  porcentajePagado: number;
};

export type InformeMO = {
  persona: string;
  desde: string | null;
  hasta: string | null;
  grupos: { presupuestoId: string; acuerdos: AcuerdoInforme[] }[];
  totalPagadoPeriodo: number;
  /** Saldo pendiente ARS de los acuerdos incluidos (mismo criterio que la pantalla). */
  totalSaldo: number;
  cantidadPagos: number;
};

/**
 * Informe de pagos por empleado: acuerdos de la persona con sus pagos dentro
 * del período. Con filtro de fechas, un acuerdo sin pagos en el período se
 * omite (es un informe de PAGOS); sin filtro entran todos los de la persona,
 * para que el saldo pendiente también quede a la vista.
 */
export function armarInformeMO(
  acuerdos: AcuerdoMO[],
  pagos: PagoMO[],
  filtro: FiltroInformeMO,
): InformeMO {
  const desde = filtro.desde?.trim() || null;
  const hasta = filtro.hasta?.trim() || null;
  const enPeriodo = (fecha: string) =>
    (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

  const grupos: InformeMO["grupos"] = [];
  let totalPagadoPeriodo = 0;
  let totalSaldo = 0;
  let cantidadPagos = 0;

  for (const acuerdo of acuerdos) {
    if (!acuerdo.persona || acuerdo.persona !== filtro.persona) continue;
    const resumen = resumirAcuerdo(acuerdo, pagos);
    const pagosPeriodo = [...resumen.pagos].reverse().filter((p) => enPeriodo(p.fecha));
    if (pagosPeriodo.length === 0 && (desde || hasta)) continue;

    const pagadoPeriodo = pagosPeriodo.reduce((a, p) => a + (Number(p.importe) || 0), 0);
    totalPagadoPeriodo += pagadoPeriodo;
    if (acuerdo.moneda === "ARS") totalSaldo += resumen.saldo;
    cantidadPagos += pagosPeriodo.length;

    const item: AcuerdoInforme = {
      acuerdo,
      pagosPeriodo,
      pagadoPeriodo,
      pagadoTotal: resumen.pagado,
      saldo: resumen.saldo,
      porcentajePagado: resumen.porcentajePagado,
    };
    const grupo = grupos.find((g) => g.presupuestoId === acuerdo.presupuesto_id);
    if (grupo) grupo.acuerdos.push(item);
    else grupos.push({ presupuestoId: acuerdo.presupuesto_id, acuerdos: [item] });
  }

  return {
    persona: filtro.persona,
    desde,
    hasta,
    grupos,
    totalPagadoPeriodo,
    totalSaldo,
    cantidadPagos,
  };
}
