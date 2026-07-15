import { describe, expect, it } from "vitest";
import { resumirAcuerdo, resumirAcuerdos, type AcuerdoMO, type PagoMO } from "./mano-obra";

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
