import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_EMPRESA,
  armarMesEmpresa,
  normalizarCategoriaEmpresa,
  type GastoEmpresaRow,
} from "../gastos-empresa";

// Motor del calendario de gastos de EMPRESA (no de obras): agrupa la tabla
// gastos_empresa por día del mes y por categoría canónica
// (Fijo/Variable/Herramientas/Indumentaria) para /empresa.

function fila(parcial: Partial<GastoEmpresaRow>): GastoEmpresaRow {
  return {
    id: "g-1",
    fecha: "2026-07-04",
    concepto: "algo",
    monto: 1000,
    moneda: "ARS",
    categoria: "Variable",
    ...parcial,
  };
}

describe("normalizarCategoriaEmpresa", () => {
  it("respeta las 4 canónicas tal cual", () => {
    for (const c of CATEGORIAS_EMPRESA) expect(normalizarCategoriaEmpresa(c)).toBe(c);
  });

  it("mapea las categorías viejas del bot a los 4 buckets", () => {
    expect(normalizarCategoriaEmpresa("Software")).toBe("Fijo");
    expect(normalizarCategoriaEmpresa("Impuestos")).toBe("Fijo");
    expect(normalizarCategoriaEmpresa("Publicidad")).toBe("Variable");
    expect(normalizarCategoriaEmpresa("Combustible")).toBe("Variable");
    expect(normalizarCategoriaEmpresa("Oficina")).toBe("Variable");
    expect(normalizarCategoriaEmpresa("Varios")).toBe("Variable");
  });

  it("entiende variantes en crudo (minúsculas, tildes, plural)", () => {
    expect(normalizarCategoriaEmpresa("herramienta")).toBe("Herramientas");
    expect(normalizarCategoriaEmpresa("indumentaria de obra")).toBe("Indumentaria");
    expect(normalizarCategoriaEmpresa("ropa")).toBe("Indumentaria");
    expect(normalizarCategoriaEmpresa("suscripción")).toBe("Fijo");
    expect(normalizarCategoriaEmpresa("costo fijo")).toBe("Fijo");
    expect(normalizarCategoriaEmpresa(null)).toBe("Variable");
    expect(normalizarCategoriaEmpresa("")).toBe("Variable");
  });
});

describe("armarMesEmpresa", () => {
  it("genera todos los días del mes, incluso sin gastos", () => {
    const m = armarMesEmpresa("2026-07", []);
    expect(m.dias).toHaveLength(31);
    expect(m.dias[0]!.fecha).toBe("2026-07-01");
    expect(m.dias[30]!.fecha).toBe("2026-07-31");
    expect(armarMesEmpresa("2028-02", []).dias).toHaveLength(29); // bisiesto
    expect(m.total_ars).toBe(0);
    expect(m.cantidad).toBe(0);
  });

  it("agrupa por día y suma el total ARS del mes", () => {
    const m = armarMesEmpresa("2026-07", [
      fila({ id: "a", fecha: "2026-07-04", monto: 1000 }),
      fila({ id: "b", fecha: "2026-07-04", monto: 500 }),
      fila({ id: "c", fecha: "2026-07-10", monto: 2000 }),
    ]);
    const dia4 = m.dias.find((d) => d.fecha === "2026-07-04")!;
    expect(dia4.total_ars).toBe(1500);
    expect(dia4.gastos).toHaveLength(2);
    expect(m.total_ars).toBe(3500);
    expect(m.cantidad).toBe(3);
  });

  it("el USD va aparte y no ensucia el total en pesos", () => {
    const m = armarMesEmpresa("2026-07", [
      fila({ id: "a", monto: 1000, moneda: "ARS" }),
      fila({ id: "b", monto: 20, moneda: "USD" }),
    ]);
    expect(m.total_ars).toBe(1000);
    expect(m.total_usd).toBe(20);
    const dia = m.dias.find((d) => d.fecha === "2026-07-04")!;
    expect(dia.total_ars).toBe(1000);
    expect(dia.total_usd).toBe(20);
  });

  it("por_categoria trae SIEMPRE las 4 canónicas en orden, normalizando las viejas", () => {
    const m = armarMesEmpresa("2026-07", [
      fila({ id: "a", categoria: "Software", monto: 100 }),
      fila({ id: "b", categoria: "herramienta", monto: 200 }),
      fila({ id: "c", categoria: "Varios", monto: 50 }),
    ]);
    expect(m.por_categoria.map((c) => c.categoria)).toEqual([
      "Fijo",
      "Variable",
      "Herramientas",
      "Indumentaria",
    ]);
    expect(m.por_categoria[0]!.total_ars).toBe(100);
    expect(m.por_categoria[1]!.total_ars).toBe(50);
    expect(m.por_categoria[2]!.total_ars).toBe(200);
    expect(m.por_categoria[3]!.total_ars).toBe(0);
  });

  it("ignora filas de otro mes y tolera monto como string (numeric de Postgres)", () => {
    const m = armarMesEmpresa("2026-07", [
      fila({ id: "a", fecha: "2026-06-30", monto: 999 }),
      fila({ id: "b", fecha: "2026-07-01", monto: "1500.50" }),
    ]);
    expect(m.total_ars).toBe(1500.5);
    expect(m.cantidad).toBe(1);
  });
});
