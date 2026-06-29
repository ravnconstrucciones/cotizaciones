import { describe, it, expect } from "vitest";
import { calcularVeredicto } from "@/lib/inmobiliario/veredicto";

describe("calcularVeredicto", () => {
  it("construir: brecha alta y precios subiendo", () => { expect(calcularVeredicto(2500, 700, 0.02)).toBe("construir"); });
  it("comprar: brecha media", () => { expect(calcularVeredicto(1750, 700, 0.01)).toBe("comprar"); });
  it("esperar: brecha baja", () => { expect(calcularVeredicto(1300, 700, 0.0)).toBe("esperar"); });
  it("esperar: aunque brecha alta, precios cayendo fuerte", () => { expect(calcularVeredicto(2500, 700, -0.03)).toBe("esperar"); });
  it("esperar: sin datos suficientes", () => {
    expect(calcularVeredicto(null, 700, 0.02)).toBe("esperar");
    expect(calcularVeredicto(2500, null, 0.02)).toBe("esperar");
  });
});
