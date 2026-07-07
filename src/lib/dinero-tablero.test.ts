import { describe, expect, it } from "vitest";
import {
  borradoresAgrupados,
  bolsillosPorCuenta,
  composicionPorObra,
  deudasConAntiguedad,
  divergenciasContraMotor,
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
      bolsillo({ dueno_tipo: "personal", dueno_obra_id: null, saldo: "-500.5" }),
    ]);
    expect(t.obra).toEqual({ ars: 300000, usd: 120 });
    expect(t.empresa).toEqual({ ars: 777, usd: 0 });
    expect(t.personal).toEqual({ ars: -500.5, usd: 0 });
  });
});

describe("bolsillosPorCuenta", () => {
  it("agrupa por cuenta y ordena por saldo descendente", () => {
    const m = bolsillosPorCuenta([
      bolsillo({ cuenta_id: "c-1", saldo: 100 }),
      bolsillo({ cuenta_id: "c-1", dueno_tipo: "personal", dueno_obra_id: null, saldo: "900" }),
      bolsillo({ cuenta_id: "c-2", saldo: 5 }),
    ]);
    expect([...m.keys()].sort()).toEqual(["c-1", "c-2"]);
    expect(m.get("c-1")!.map((b) => b.dueno_tipo)).toEqual(["personal", "obra"]);
  });
});

describe("divergenciasContraMotor", () => {
  it("detecta cuentas donde ledger ≠ motor y saltea las que el ledger no conoce", () => {
    const divs = divergenciasContraMotor(
      [bolsillo({ cuenta_id: "c-1", saldo: "300000" }), bolsillo({ cuenta_id: "c-1", dueno_tipo: "personal", dueno_obra_id: null, saldo: 100 })],
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
  it("empresa=RAVN, personal=Eze, obra por mapa con fallback", () => {
    const obras = { "p-puey": "Baño Pueyrredón" };
    expect(nombreDueno("empresa", null, obras)).toBe("RAVN");
    expect(nombreDueno("personal", null, obras)).toBe("Eze");
    expect(nombreDueno("obra", "p-puey", obras)).toBe("Baño Pueyrredón");
    expect(nombreDueno("obra", "p-x", obras)).toBe("Obra sin nombre");
  });
});
