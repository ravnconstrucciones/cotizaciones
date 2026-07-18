import { describe, expect, it } from "vitest";
import {
  armarInformeMO,
  resumirAcuerdo,
  resumirAcuerdos,
  type AcuerdoMO,
  type PagoMO,
} from "./mano-obra";

const acuerdo = (over: Partial<AcuerdoMO> = {}): AcuerdoMO => ({
  id: "a1",
  presupuesto_id: "p1",
  persona: "Juan",
  trabajo: "Filtración",
  monto_arreglado: 700000,
  moneda: "ARS",
  estado: "abierto",
  notas: null,
  created_at: "2026-07-14T00:00:00Z",
  ...over,
});
const pago = (over: Partial<PagoMO> = {}): PagoMO => ({
  id: "g1",
  mo_acuerdo_id: "a1",
  importe: 100000,
  fecha: "2026-07-10",
  descripcion: null,
  cotizacion_venta_ars_por_usd: null,
  ...over,
});

describe("resumirAcuerdo", () => {
  it("saldo = arreglado − pagos, ultimoPago = fecha más nueva", () => {
    const r = resumirAcuerdo(acuerdo(), [pago(), pago({ id: "g2", importe: 200000, fecha: "2026-07-12" })]);
    expect(r.pagado).toBe(300000);
    expect(r.saldo).toBe(400000);
    expect(r.ultimoPago).toBe("2026-07-12");
    expect(r.pagos[0].id).toBe("g2"); // nuevo → viejo
  });
  it("sin pagos: pagado 0, saldo completo, ultimoPago null", () => {
    const r = resumirAcuerdo(acuerdo(), []);
    expect(r.pagado).toBe(0);
    expect(r.saldo).toBe(700000);
    expect(r.ultimoPago).toBeNull();
  });
  it("pago que supera el saldo se permite: saldo negativo", () => {
    const r = resumirAcuerdo(acuerdo({ monto_arreglado: 100000 }), [pago({ importe: 150000 })]);
    expect(r.saldo).toBe(-50000);
  });
  it("acuerdo USD: pagado convierte por cotización; sin cotización NO suma y se cuenta", () => {
    const r = resumirAcuerdo(acuerdo({ moneda: "USD", monto_arreglado: 1000 }), [
      pago({ importe: 148000, cotizacion_venta_ars_por_usd: 1480 }), // = US$100
      pago({ id: "g2", importe: 50000 }), // sin cotización → no suma
    ]);
    expect(r.pagado).toBe(100);
    expect(r.saldo).toBe(900);
    expect(r.pagosSinCotizacion).toBe(1);
  });
});

describe("resumirAcuerdos", () => {
  it("reparte pagos por mo_acuerdo_id e ignora los no vinculados", () => {
    const rs = resumirAcuerdos(
      [acuerdo(), acuerdo({ id: "a2", trabajo: "Cielorraso", monto_arreglado: 300000 })],
      [pago(), pago({ id: "g2", mo_acuerdo_id: "a2", importe: 300000 }), pago({ id: "g3", mo_acuerdo_id: null })],
    );
    expect(rs[0].pagado).toBe(100000);
    expect(rs[1].saldo).toBe(0);
  });
});

describe("armarInformeMO", () => {
  const base = [
    acuerdo(), // a1 Juan, p1, arreglado 700k
    acuerdo({ id: "a2", trabajo: "Cielorraso", monto_arreglado: 300000, presupuesto_id: "p2" }),
    acuerdo({ id: "a3", persona: "Saivin", trabajo: "Siding", monto_arreglado: 1250000 }),
    acuerdo({ id: "a4", persona: null, trabajo: "Plomería" }),
  ];
  const pagos = [
    pago(), // a1 100k 10/07
    pago({ id: "g2", importe: 200000, fecha: "2026-07-12" }), // a1
    pago({ id: "g3", mo_acuerdo_id: "a2", importe: 300000, fecha: "2026-06-16" }),
    pago({ id: "g4", mo_acuerdo_id: "a3", importe: 450000, fecha: "2026-07-03" }),
  ];

  it("filtra por persona, agrupa por presupuesto y suma totales", () => {
    const inf = armarInformeMO(base, pagos, { persona: "Juan" });
    expect(inf.grupos.map((g) => g.presupuestoId)).toEqual(["p1", "p2"]);
    expect(inf.totalPagadoPeriodo).toBe(600000);
    expect(inf.totalSaldo).toBe(400000); // a1 falta 400k, a2 saldado
    expect(inf.cantidadPagos).toBe(3);
    // pagos en orden cronológico viejo → nuevo
    expect(inf.grupos[0].acuerdos[0].pagosPeriodo.map((p) => p.id)).toEqual(["g1", "g2"]);
  });

  it("con rango de fechas: solo pagos del período y omite acuerdos sin pagos en él", () => {
    const inf = armarInformeMO(base, pagos, { persona: "Juan", desde: "2026-07-01", hasta: "2026-07-11" });
    expect(inf.grupos).toHaveLength(1); // a2 (pago 16/06) queda afuera
    expect(inf.grupos[0].acuerdos[0].pagosPeriodo.map((p) => p.id)).toEqual(["g1"]);
    expect(inf.totalPagadoPeriodo).toBe(100000);
    // el saldo del acuerdo sigue siendo el real (histórico completo)
    expect(inf.grupos[0].acuerdos[0].saldo).toBe(400000);
  });

  it("sin filtro de fechas un acuerdo sin pagos entra igual (muestra el saldo)", () => {
    const inf = armarInformeMO(base, [], { persona: "Juan" });
    expect(inf.grupos.flatMap((g) => g.acuerdos)).toHaveLength(2);
    expect(inf.totalSaldo).toBe(1000000);
    expect(inf.cantidadPagos).toBe(0);
  });

  it("persona null nunca matchea", () => {
    const inf = armarInformeMO(base, pagos, { persona: "" });
    expect(inf.grupos).toHaveLength(0);
  });
});
