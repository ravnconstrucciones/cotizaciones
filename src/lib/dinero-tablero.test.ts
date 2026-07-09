import { describe, expect, it } from "vitest";
import {
  borradoresAgrupados,
  bolsillosPorCuenta,
  composicionPorObra,
  deudasConAntiguedad,
  deudasPorDeudor,
  divergenciasContraMotor,
  esTarjeta,
  nombreDueno,
  totalesPorDueno,
  type BolsilloVista,
  type BorradorVista,
  type FinanciamientoVista,
} from "@/lib/dinero-tablero";

const bolsillo = (b: Partial<BolsilloVista>): BolsilloVista => ({
  cuenta_id: "c-1",
  dueno_tipo: "obra",
  dueno_obra_id: "p-puey",
  moneda: "ARS",
  saldo: 0,
  movimientos: 1,
  ...b,
});

const fin = (f: Partial<FinanciamientoVista>): FinanciamientoVista => ({
  id: "f-1",
  deudor_tipo: "obra",
  deudor_obra_id: "p-glori",
  acreedor_tipo: "obra",
  acreedor_obra_id: "p-puey",
  monto_original: 450000,
  saldo_pendiente: 450000,
  moneda: "ARS",
  estado: "abierto",
  notas: "",
  created_at: "2026-07-01T12:00:00Z",
  ...f,
});

const borrador = (b: Partial<BorradorVista>): BorradorVista => ({
  id: "m-1",
  grupo_id: "g-1",
  fecha: "2026-07-07",
  cuenta_id: "c-1",
  dueno_tipo: "obra",
  dueno_obra_id: "p-puey",
  monto: -1000,
  moneda: "ARS",
  origen_tipo: "gasto_obra",
  descripcion: "ferretería",
  created_at: "2026-07-07T20:00:00Z",
  ...b,
});

describe("totalesPorDueno", () => {
  it("suma por dueño separando monedas (numeric llega como string)", () => {
    const t = totalesPorDueno([
      bolsillo({ saldo: "300000" }),
      bolsillo({ saldo: 120, moneda: "USD" }),
      bolsillo({ dueno_tipo: "empresa", dueno_obra_id: null, saldo: 777 }),
      bolsillo({ dueno_tipo: "empresa", dueno_obra_id: null, saldo: "-500.5" }),
    ]);
    expect(t.obra).toEqual({ ars: 300000, usd: 120 });
    expect(t.empresa).toEqual({ ars: 276.5, usd: 0 });
  });

  // Regla de Eze (08/07): las tarjetas son PERSONALES — control de cómo van,
  // pero su deuda jamás le resta al bolsillo RAVN. Se paga con retiro declarado.
  it("excluye los bolsillos de cuentas tarjeta cuando se le pasa el set", () => {
    const t = totalesPorDueno(
      [
        bolsillo({ cuenta_id: "c-mp", dueno_tipo: "empresa", dueno_obra_id: null, saldo: "1016243" }),
        bolsillo({ cuenta_id: "c-visa", dueno_tipo: "empresa", dueno_obra_id: null, saldo: "-1372601.87" }),
        bolsillo({ cuenta_id: "c-visa-usd", dueno_tipo: "empresa", dueno_obra_id: null, saldo: "-78.47", moneda: "USD" }),
        bolsillo({ cuenta_id: "c-efe", saldo: "1125500" }),
      ],
      new Set(["c-visa", "c-visa-usd"])
    );
    expect(t.empresa).toEqual({ ars: 1016243, usd: 0 });
    expect(t.obra).toEqual({ ars: 1125500, usd: 0 });
  });
});

describe("esTarjeta", () => {
  it("reconoce las cuentas tarjeta por nombre (mismo criterio que la pantalla)", () => {
    expect(esTarjeta("Tarjeta Visa")).toBe(true);
    expect(esTarjeta("tarjeta Master US$")).toBe(true);
    expect(esTarjeta("Mercado Pago")).toBe(false);
    expect(esTarjeta("Efectivo obra Pueyrredón")).toBe(false);
  });
});

describe("bolsillosPorCuenta", () => {
  it("agrupa por cuenta y ordena por saldo descendente", () => {
    const m = bolsillosPorCuenta([
      bolsillo({ cuenta_id: "c-1", saldo: 100 }),
      bolsillo({ cuenta_id: "c-1", dueno_tipo: "empresa", dueno_obra_id: null, saldo: "900" }),
      bolsillo({ cuenta_id: "c-2", saldo: 5 }),
    ]);
    expect([...m.keys()].sort()).toEqual(["c-1", "c-2"]);
    expect(m.get("c-1")!.map((b) => b.dueno_tipo)).toEqual(["empresa", "obra"]);
  });
});

describe("divergenciasContraMotor", () => {
  it("detecta cuentas donde ledger ≠ motor y saltea las que el ledger no conoce", () => {
    const divs = divergenciasContraMotor(
      [bolsillo({ cuenta_id: "c-1", saldo: "300000" }), bolsillo({ cuenta_id: "c-1", dueno_tipo: "empresa", dueno_obra_id: null, saldo: 100 })],
      [
        { id: "c-1", saldo: 300000 },
        { id: "c-nueva", saldo: 50 },
      ]
    );
    expect(divs).toEqual([
      { cuenta_id: "c-1", saldoLedger: 300100, saldoMotor: 300000, delta: 100 },
    ]);
  });

  it("sin diferencias → vacío", () => {
    expect(
      divergenciasContraMotor([bolsillo({ saldo: 42 })], [{ id: "c-1", saldo: 42 }])
    ).toEqual([]);
  });
});

describe("deudasConAntiguedad", () => {
  const ahora = Date.parse("2026-07-07T12:00:00Z");
  it("calcula días y ordena: abiertas primero, la más vieja arriba", () => {
    const deudas = deudasConAntiguedad(
      [
        fin({ id: "f-nueva", created_at: "2026-07-06T12:00:00Z" }),
        fin({ id: "f-vieja", created_at: "2026-06-27T12:00:00Z" }),
        fin({ id: "f-devuelta", estado: "devuelto", created_at: "2026-05-01T00:00:00Z" }),
      ],
      ahora
    );
    expect(deudas.map((d) => d.id)).toEqual(["f-vieja", "f-nueva", "f-devuelta"]);
    expect(deudas[0].dias).toBe(10);
    expect(deudas[1].dias).toBe(1);
  });

  it("created_at futuro no da días negativos", () => {
    const [d] = deudasConAntiguedad([fin({ created_at: "2026-07-08T00:00:00Z" })], ahora);
    expect(d.dias).toBe(0);
  });
});

describe("deudasPorDeudor", () => {
  const ahora = Date.parse("2026-07-07T12:00:00Z");
  it("agrupa por deudor con totales por acreedor y por moneda, mayor deuda primero", () => {
    const grupos = deudasPorDeudor(
      deudasConAntiguedad(
        [
          fin({ id: "f-1", deudor_obra_id: "p-glori", acreedor_obra_id: "p-puey", saldo_pendiente: 800 }),
          fin({ id: "f-2", deudor_obra_id: "p-glori", acreedor_obra_id: "p-puey", saldo_pendiente: 1200, created_at: "2026-06-20T12:00:00Z" }),
          fin({ id: "f-3", deudor_obra_id: "p-glori", acreedor_tipo: "empresa", acreedor_obra_id: null, saldo_pendiente: 5000 }),
          fin({ id: "f-4", deudor_tipo: "empresa", deudor_obra_id: null, acreedor_tipo: "obra", acreedor_obra_id: "p-puey", saldo_pendiente: 100, moneda: "USD" }),
          fin({ id: "f-cerrada", estado: "devuelto", saldo_pendiente: 0 }),
        ],
        ahora
      )
    );
    expect(grupos).toHaveLength(2);
    const [glori, ravn] = grupos;
    expect(glori).toMatchObject({ deudor_obra_id: "p-glori", totalArs: 7000, totalUsd: 0 });
    // Acreedores del más grande al más chico; el detalle adentro, la deuda más vieja primero.
    expect(glori.acreedores.map((a) => [a.acreedor_tipo, a.totalArs])).toEqual([
      ["empresa", 5000],
      ["obra", 2000],
    ]);
    expect(glori.acreedores[1].deudas.map((d) => d.id)).toEqual(["f-2", "f-1"]);
    expect(ravn).toMatchObject({ deudor_tipo: "empresa", totalArs: 0, totalUsd: 100 });
  });

  it("ARS y USD del mismo par nunca se suman entre sí", () => {
    const [g] = deudasPorDeudor(
      deudasConAntiguedad(
        [
          fin({ id: "f-a", saldo_pendiente: 1000 }),
          fin({ id: "f-b", saldo_pendiente: 200, moneda: "USD" }),
        ],
        ahora
      )
    );
    expect(g.acreedores).toHaveLength(1);
    expect(g.acreedores[0]).toMatchObject({ totalArs: 1000, totalUsd: 200 });
  });

  it("sin deudas abiertas → vacío", () => {
    expect(
      deudasPorDeudor(deudasConAntiguedad([fin({ estado: "devuelto" })], ahora))
    ).toEqual([]);
  });
});

describe("borradoresAgrupados", () => {
  it("agrupa patas por grupo con magnitud por moneda, último grupo primero", () => {
    const grupos = borradoresAgrupados([
      borrador({ id: "m-1", grupo_id: "g-1", monto: -22950, created_at: "2026-07-07T19:00:00Z" }),
      borrador({ id: "m-2", grupo_id: "g-2", monto: -50, moneda: "USD", descripcion: "comisión", created_at: "2026-07-07T21:00:00Z" }),
      borrador({ id: "m-3", grupo_id: "g-2", monto: "75750", descripcion: "", created_at: "2026-07-07T21:00:01Z" }),
    ]);
    expect(grupos.map((g) => g.grupo_id)).toEqual(["g-2", "g-1"]);
    expect(grupos[0]).toMatchObject({ patas: 2, totalUsd: 50, totalArs: 75750, descripcion: "comisión" });
    expect(grupos[1]).toMatchObject({ patas: 1, totalArs: 22950, totalUsd: 0 });
  });
});

describe("composicionPorObra", () => {
  it("arma % propio vs financiado por acreedor, solo ARS, acumulando repetidos", () => {
    const [c] = composicionPorObra(
      [
        fin({ monto_original: 450000 }),
        fin({ id: "f-2", acreedor_tipo: "empresa", acreedor_obra_id: null, monto_original: "224000" }),
        fin({ id: "f-3", acreedor_tipo: "empresa", acreedor_obra_id: null, monto_original: 26000 }),
        fin({ id: "f-usd", moneda: "USD", monto_original: 2050 }),
      ],
      { "p-glori": 1000000 }
    );
    expect(c.obra_id).toBe("p-glori");
    expect(c.financiadoTotal).toBe(700000);
    expect(c.pctPropio).toBe(0.3);
    expect(c.financiado).toEqual([
      { acreedor_tipo: "obra", acreedor_obra_id: "p-puey", monto: 450000 },
      { acreedor_tipo: "empresa", acreedor_obra_id: null, monto: 250000 },
    ]);
  });

  it("obra sin costo cargado → pctPropio 0 (no hay base para el %)", () => {
    const [c] = composicionPorObra([fin({})], {});
    expect(c.costo).toBe(0);
    expect(c.pctPropio).toBe(0);
  });
});

describe("nombreDueno", () => {
  it("empresa=RAVN, obra por mapa con fallback", () => {
    const obras = { "p-puey": "Baño Pueyrredón" };
    expect(nombreDueno("empresa", null, obras)).toBe("RAVN");
    expect(nombreDueno("obra", "p-puey", obras)).toBe("Baño Pueyrredón");
    expect(nombreDueno("obra", "p-x", obras)).toBe("Obra sin nombre");
  });
});
