import { describe, it, expect } from "vitest";
import { saldosPorCuenta, type Cuenta } from "./cuentas";

/**
 * Cuentas REALES de la foto del 02/07/2026 (pasadas por Eze) para validar que
 * el saldo derivado da lo que tiene que dar.
 */

const FECHA = "2026-07-02";

const efectivo: Cuenta = {
  id: "efectivo",
  nombre: "Efectivo",
  moneda: "ARS",
  saldo_inicial: 1_500_000,
  fecha_saldo_inicial: FECHA,
  procedencia: "obra",
  activa: true,
  orden: 1,
};

const mercadoPago: Cuenta = {
  id: "mp",
  nombre: "Mercado Pago",
  moneda: "ARS",
  saldo_inicial: 135_532,
  fecha_saldo_inicial: FECHA,
  procedencia: "propia",
  activa: true,
  orden: 2,
};

const balanz: Cuenta = {
  id: "balanz",
  nombre: "Balanz",
  moneda: "ARS",
  saldo_inicial: 1_105_150,
  fecha_saldo_inicial: FECHA,
  procedencia: "propia",
  activa: true,
  orden: 3,
};

const usdBillete: Cuenta = {
  id: "usd-billete",
  nombre: "USD billete",
  moneda: "USD",
  saldo_inicial: 2_220,
  fecha_saldo_inicial: FECHA,
  procedencia: "obra",
  activa: true,
  orden: 7,
};

const CUENTAS = [efectivo, mercadoPago, balanz, usdBillete];

const VACIO = {
  gastosObra: [],
  cashflow: [],
  retiros: [],
  gastosPersonales: [],
};

describe("saldosPorCuenta", () => {
  it("sin movimientos asignados, cada cuenta queda en su foto inicial", () => {
    const r = saldosPorCuenta({ cuentas: CUENTAS, ...VACIO });
    expect(r.cuentas.map((c) => c.saldo)).toEqual([
      1_500_000, 135_532, 1_105_150, 2_220,
    ]);
    expect(r.arsPropia).toBe(1_240_682); // MP + Balanz
    expect(r.arsObra).toBe(1_500_000); // efectivo = adelanto Pueyrredón
    expect(r.usdObra).toBe(2_220);
    expect(r.usdPropia).toBe(0);
    expect(r.sinAsignar).toBe(0);
  });

  it("un gasto de obra pagado en efectivo resta del efectivo", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      gastosObra: [{ cuenta_id: "efectivo", importe: 224_000 }],
    });
    expect(r.cuentas[0].saldo).toBe(1_276_000);
    expect(r.cuentas[0].movimientos).toBe(1);
  });

  it("gasto espejado en libreta NO resta dos veces (cuenta en el gasto, espejo ignorado)", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      gastosObra: [
        { cuenta_id: "efectivo", importe: 100_000, cashflow_item_id: "cf-1" },
      ],
      cashflow: [
        // el espejo del gasto — aunque alguien le asigne cuenta, se ignora
        {
          id: "cf-1",
          cuenta_id: "efectivo",
          tipo: "egreso",
          monto_real: 100_000,
        },
      ],
    });
    expect(r.cuentas[0].saldo).toBe(1_400_000);
  });

  it("cobro en la libreta suma; egreso resta; anulados no cuentan", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      cashflow: [
        { id: "a", cuenta_id: "mp", tipo: "ingreso", monto_real: 50_000 },
        { id: "b", cuenta_id: "mp", tipo: "egreso", monto_real: 20_000 },
        {
          id: "c",
          cuenta_id: "mp",
          tipo: "egreso",
          monto_real: 999_999,
          deleted_at: "2026-07-02T10:00:00Z",
        },
      ],
    });
    expect(r.cuentas[1].saldo).toBe(165_532);
    expect(r.cuentas[1].movimientos).toBe(2);
  });

  it("cobro en USD suma monto_usd a la cuenta USD (nunca el monto en pesos)", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      cashflow: [
        {
          id: "u1",
          cuenta_id: "usd-billete",
          tipo: "ingreso",
          monto_real: 1_520_000,
          moneda: "USD",
          monto_usd: 1_000,
        },
      ],
    });
    expect(r.cuentas[3].saldo).toBe(3_220);
  });

  it("gasto de obra desde cuenta USD se pasa a dólares con la cotización de la fila", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      gastosObra: [
        {
          cuenta_id: "usd-billete",
          importe: 152_000,
          cotizacion_venta_ars_por_usd: 1_520,
        },
        // sin cotización no se inventa: no ajusta
        { cuenta_id: "usd-billete", importe: 50_000 },
      ],
    });
    expect(r.cuentas[3].saldo).toBe(2_120);
  });

  it("retiro resta y aporte suma en la cuenta; gasto personal resta", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      retiros: [
        { cuenta_id: "efectivo", tipo: "retiro", monto_ars: 1_500_000 },
        { cuenta_id: "mp", tipo: "aporte", monto_ars: 10_000 },
      ],
      gastosPersonales: [{ cuenta_id: "mp", monto: 5_532 }],
    });
    expect(r.cuentas[0].saldo).toBe(0);
    expect(r.cuentas[1].saldo).toBe(140_000);
  });

  it("movimientos sin cuenta quedan sin asignar y no tocan saldos", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      gastosObra: [{ cuenta_id: null, importe: 224_000 }],
      cashflow: [{ id: "x", cuenta_id: null, tipo: "ingreso", monto_real: 1 }],
      retiros: [{ cuenta_id: null, tipo: "retiro", monto_ars: 99 }],
      gastosPersonales: [{ cuenta_id: null, monto: 7 }],
    });
    expect(r.cuentas.map((c) => c.saldo)).toEqual([
      1_500_000, 135_532, 1_105_150, 2_220,
    ]);
    expect(r.sinAsignar).toBe(4);
  });

  it("pago de tarjeta repartido: cada pata resta de su origen y la deuda de la tarjeta sube hacia 0", () => {
    const visa: Cuenta = {
      id: "visa",
      nombre: "Tarjeta Visa",
      moneda: "ARS",
      saldo_inicial: 0,
      fecha_saldo_inicial: FECHA,
      procedencia: "propia",
      activa: true,
      orden: 9,
    };
    const r = saldosPorCuenta({
      cuentas: [...CUENTAS, visa],
      ...VACIO,
      // El resumen se armó con gastos personales pagados con la Visa...
      gastosPersonales: [{ cuenta_id: "visa", monto: 500_000 }],
      // ...y Eze lo paga repartido: 300 de efectivo + 200 de Balanz.
      transferencias: [
        {
          cuenta_origen_id: "efectivo",
          cuenta_destino_id: "visa",
          monto_origen: 300_000,
          monto_destino: 300_000,
        },
        {
          cuenta_origen_id: "balanz",
          cuenta_destino_id: "visa",
          monto_origen: 200_000,
          monto_destino: 200_000,
        },
      ],
    });
    expect(r.cuentas.find((c) => c.id === "visa")?.saldo).toBe(0);
    expect(r.cuentas.find((c) => c.id === "efectivo")?.saldo).toBe(1_200_000);
    expect(r.cuentas.find((c) => c.id === "balanz")?.saldo).toBe(905_150);
  });

  it("transferencia cross-currency: cada pata en la moneda de su cuenta", () => {
    const r = saldosPorCuenta({
      cuentas: CUENTAS,
      ...VACIO,
      // Cambió US$100 a $150.000 (billete → efectivo).
      transferencias: [
        {
          cuenta_origen_id: "usd-billete",
          cuenta_destino_id: "efectivo",
          monto_origen: 100,
          monto_destino: 150_000,
        },
      ],
    });
    expect(r.cuentas.find((c) => c.id === "usd-billete")?.saldo).toBe(2_120);
    expect(r.cuentas.find((c) => c.id === "efectivo")?.saldo).toBe(1_650_000);
  });

  it("gasto de empresa resta en la moneda del gasto; si no coincide con la cuenta, no ajusta", () => {
    const visaUsd: Cuenta = {
      id: "visa-usd",
      nombre: "Tarjeta Visa US$",
      moneda: "USD",
      saldo_inicial: -98.47,
      fecha_saldo_inicial: FECHA,
      procedencia: "propia",
      activa: true,
      orden: 10,
    };
    const r = saldosPorCuenta({
      cuentas: [...CUENTAS, visaUsd],
      ...VACIO,
      gastosEmpresa: [
        // Rendair en dólares → acumula deuda en la Visa US$
        { cuenta_id: "visa-usd", monto: 19, moneda: "USD" },
        // sin moneda = ARS → resta de MP
        { cuenta_id: "mp", monto: 10_000 },
        // moneda cruzada: no inventa cotización, no ajusta
        { cuenta_id: "mp", monto: 20, moneda: "USD" },
        // sin cuenta → sin asignar
        { cuenta_id: null, monto: 5_000 },
      ],
    });
    expect(r.cuentas.find((c) => c.id === "visa-usd")?.saldo).toBe(-117.47);
    expect(r.cuentas.find((c) => c.id === "mp")?.saldo).toBe(125_532);
    expect(r.sinAsignar).toBe(1);
  });

  it("cuenta inactiva conserva saldo pero no entra en los agregados", () => {
    const r = saldosPorCuenta({
      cuentas: [
        ...CUENTAS.slice(1),
        { ...efectivo, activa: false },
      ],
      ...VACIO,
    });
    expect(r.arsObra).toBe(0);
    const ef = r.cuentas.find((c) => c.id === "efectivo");
    expect(ef?.saldo).toBe(1_500_000);
  });
});
