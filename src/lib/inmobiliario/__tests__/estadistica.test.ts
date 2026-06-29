import { describe, it, expect } from "vitest";
import { mediana, percentil, filtrarOutliers } from "@/lib/inmobiliario/estadistica";

describe("mediana", () => {
  it("devuelve el valor medio en lista impar", () => { expect(mediana([3, 1, 2])).toBe(2); });
  it("promedia los dos centrales en lista par", () => { expect(mediana([1, 2, 3, 4])).toBe(2.5); });
  it("devuelve null en lista vacía", () => { expect(mediana([])).toBeNull(); });
});
describe("percentil", () => {
  it("p50 equivale a la mediana", () => { expect(percentil([1, 2, 3, 4, 5], 50)).toBe(3); });
});
describe("filtrarOutliers", () => {
  it("descarta extremos por debajo de P5 y por encima de P95", () => {
    const datos = [1, ...Array(98).fill(100), 9999];
    const limpio = filtrarOutliers(datos, 5, 95);
    expect(limpio).not.toContain(1);
    expect(limpio).not.toContain(9999);
    expect(limpio.every((x) => x === 100)).toBe(true);
  });
  it("no rompe con lista vacía", () => { expect(filtrarOutliers([], 5, 95)).toEqual([]); });
});
