import { describe, expect, it } from "vitest";
import {
  filasEspejoCashflow, filasEspejoGastoEmpresa, filasEspejoGastoObra,
  filasEspejoGastoPersonal, filasEspejoRetiro, filasEspejoTransferencia,
} from "@/lib/dinero-espejo";

const ars = { id: "c-ars", moneda: "ARS" } as const;
const usd = { id: "c-usd", moneda: "USD" } as const;
const base = { fecha: "2026-07-06", descripcion: "x" };

describe("filasEspejoGastoObra", () => {
  it("cuenta ARS: una pata -importe, dueño la obra", () => {
    const patas = filasEspejoGastoObra(
      { presupuesto_id: "p1", importe: "12800", cuenta_id: "c-ars",
        cotizacion_venta_ars_por_usd: null, ...base }, ars);
    expect(patas).toEqual([expect.objectContaining({
      cuenta_id: "c-ars", dueno_tipo: "obra", dueno_obra_id: "p1",
      monto: -12800, moneda: "ARS" })]);
  });
  it("cuenta USD con cotización: -importe/cot en USD", () => {
    const [p] = filasEspejoGastoObra(
      { presupuesto_id: "p1", importe: "150000", cuenta_id: "c-usd",
        cotizacion_venta_ars_por_usd: "1500", ...base }, usd);
    expect(p.monto).toBe(-100);
    expect(p.moneda).toBe("USD");
  });
  it("cuenta USD SIN cotización: 0 patas (regla del motor)", () => {
    expect(filasEspejoGastoObra({ presupuesto_id: "p1", importe: "1000",
      cuenta_id: "c-usd", cotizacion_venta_ars_por_usd: null, ...base }, usd)).toEqual([]);
  });
  it("sin cuenta: 0 patas", () => {
    expect(filasEspejoGastoObra({ presupuesto_id: "p1", importe: "1000",
      cuenta_id: null, ...base }, undefined)).toEqual([]);
  });
});

describe("filasEspejoCashflow", () => {
  it("cobro (ingreso) cuenta ARS: +monto_real, dueño la obra", () => {
    const [p] = filasEspejoCashflow(
      { tipo: "ingreso", monto_real: "500000", monto_usd: null,
        cuenta_id: "c-ars", deleted_at: null, ...base }, ars, "p1", false);
    expect(p).toEqual(expect.objectContaining({ monto: 500000, dueno_tipo: "obra", dueno_obra_id: "p1" }));
  });
  it("cuenta USD usa monto_usd; sin monto_usd → 0 patas", () => {
    expect(filasEspejoCashflow({ tipo: "ingreso", monto_real: "500000",
      monto_usd: null, cuenta_id: "c-usd", deleted_at: null, ...base }, usd, "p1", false)).toEqual([]);
  });
  it("espejo de gasto (dedup) o borrado o sin monto_real: 0 patas", () => {
    const m = { tipo: "egreso", monto_real: "1000", monto_usd: null,
      cuenta_id: "c-ars", deleted_at: null, ...base };
    expect(filasEspejoCashflow(m, ars, "p1", true)).toEqual([]);
    expect(filasEspejoCashflow({ ...m, deleted_at: "2026-07-06" }, ars, "p1", false)).toEqual([]);
    expect(filasEspejoCashflow({ ...m, monto_real: null }, ars, "p1", false)).toEqual([]);
  });
});

describe("empresa / personal / retiro", () => {
  it("gasto empresa cross-moneda: 0 patas (regla del motor)", () => {
    expect(filasEspejoGastoEmpresa({ monto: "20", moneda: "USD",
      cuenta_id: "c-ars", ...base }, ars)).toEqual([]);
  });
  it("gasto empresa misma moneda: -monto dueño empresa", () => {
    const [p] = filasEspejoGastoEmpresa({ monto: "20", moneda: "USD",
      cuenta_id: "c-usd", ...base }, usd);
    expect(p).toEqual(expect.objectContaining({ monto: -20, dueno_tipo: "empresa", dueno_obra_id: null }));
  });
  it("gasto personal: -monto dueño personal", () => {
    const [p] = filasEspejoGastoPersonal({ monto: "4500", cuenta_id: "c-ars", ...base }, ars);
    expect(p).toEqual(expect.objectContaining({ monto: -4500, dueno_tipo: "personal" }));
  });
  it("retiro resta / aporte suma, dueño empresa", () => {
    expect(filasEspejoRetiro({ tipo: "retiro", monto_ars: "100000", cuenta_id: "c-ars", ...base }, ars)[0].monto).toBe(-100000);
    expect(filasEspejoRetiro({ tipo: "aporte", monto_ars: "100000", cuenta_id: "c-ars", ...base }, ars)[0].monto).toBe(100000);
  });
});

describe("filasEspejoTransferencia", () => {
  it("dos patas, mismo dueño, cada una en la moneda de su cuenta", () => {
    const patas = filasEspejoTransferencia(
      { cuenta_origen_id: "c-ars", cuenta_destino_id: "c-usd",
        monto_origen: "150000", monto_destino: "100", ...base },
      ars, usd, { dueno_tipo: "obra", dueno_obra_id: "p1" });
    expect(patas).toHaveLength(2);
    expect(patas[0]).toEqual(expect.objectContaining({ cuenta_id: "c-ars", monto: -150000, moneda: "ARS", dueno_obra_id: "p1" }));
    expect(patas[1]).toEqual(expect.objectContaining({ cuenta_id: "c-usd", monto: 100, moneda: "USD", dueno_obra_id: "p1" }));
  });
});
