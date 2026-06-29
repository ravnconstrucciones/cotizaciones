import { describe, it, expect } from "vitest";
import { costoConstruccionUsdM2 } from "@/lib/inmobiliario/costo-construccion";

describe("costoConstruccionUsdM2", () => {
  it("suma mo+materiales por m² y convierte a USD", () => {
    const items = [
      { costo_mo_m2: 100000, costo_materiales_m2: 200000 },
      { costo_mo_m2: 50000, costo_materiales_m2: 100000 },
    ];
    expect(costoConstruccionUsdM2(items, 1000)).toBe(450);
  });
  it("devuelve null si la cotización es 0 o inválida", () => {
    expect(costoConstruccionUsdM2([{ costo_mo_m2: 1, costo_materiales_m2: 1 }], 0)).toBeNull();
  });
});
