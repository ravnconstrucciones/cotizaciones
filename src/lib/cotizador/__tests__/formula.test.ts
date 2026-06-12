import { describe, it, expect } from "vitest";
import { evaluarFormula, FormulaError } from "../formula";

describe("evaluarFormula", () => {
  it("opera con precedencia y paréntesis", () => {
    expect(evaluarFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluarFormula("(2 + 3) * 4", {})).toBe(20);
    expect(evaluarFormula("10 / 4", {})).toBe(2.5);
    expect(evaluarFormula("-3 + 5", {})).toBe(2);
  });

  it("resuelve variables (parámetros de la receta)", () => {
    expect(evaluarFormula("superficie_m2 * 1.05", { superficie_m2: 80 })).toBeCloseTo(84);
    expect(evaluarFormula("ml_zocalo + 2", { ml_zocalo: 10 })).toBe(12);
  });

  it("soporta funciones ceil, floor, redondear, max, min", () => {
    expect(evaluarFormula("ceil(superficie_m2 / 10)", { superficie_m2: 81 })).toBe(9);
    expect(evaluarFormula("floor(7.9)", {})).toBe(7);
    expect(evaluarFormula("redondear(7.5)", {})).toBe(8);
    expect(evaluarFormula("max(2, superficie_m2 / 100)", { superficie_m2: 80 })).toBe(2);
    expect(evaluarFormula("min(5, 3)", {})).toBe(3);
  });

  it("tira FormulaError ante variable desconocida", () => {
    expect(() => evaluarFormula("superficie_m2 * 2", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("superficie_m2 * 2", {})).toThrow(/superficie_m2/);
  });

  it("tira FormulaError ante sintaxis inválida o división por cero", () => {
    expect(() => evaluarFormula("2 +", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("2 ** 3", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("rm(-rf)", {})).toThrow(FormulaError);
    expect(() => evaluarFormula("1 / 0", {})).toThrow(FormulaError);
  });
});
