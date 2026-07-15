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
};

export type ResumenAcuerdo = {
  acuerdo: AcuerdoMO;
  pagado: number;
  saldo: number;
  pagos: PagoMO[];
  ultimoPago: string | null;
  pagosSinCotizacion: number;
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
  return {
    acuerdo,
    pagado,
    saldo: Math.round((Number(acuerdo.monto_arreglado) - pagado) * 100) / 100,
    pagos: propios,
    ultimoPago: propios[0]?.fecha ?? null,
    pagosSinCotizacion,
  };
}

export function resumirAcuerdos(acuerdos: AcuerdoMO[], pagos: PagoMO[]): ResumenAcuerdo[] {
  return acuerdos.map((a) => resumirAcuerdo(a, pagos));
}
