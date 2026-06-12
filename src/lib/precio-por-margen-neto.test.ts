import { describe, expect, it } from "vitest";
import {
  aplicarBonificacionSobrePrecio,
  margenSobreVentaPct,
  precioObjetivoPorMargenNeto,
  precioObjetivoPorRemarqueSobreCosto,
} from "@/lib/precio-por-margen-neto";

describe("precioObjetivoPorRemarqueSobreCosto", () => {
  it("aplica el remarque sobre el costo", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(100, 40)).toBe(140);
  });

  it("con remarque 0 devuelve el costo", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(100, 0)).toBe(100);
  });

  it("clampa remarques negativos a 0", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(100, -20)).toBe(100);
  });

  it("devuelve 0 si el costo es 0 o negativo", () => {
    expect(precioObjetivoPorRemarqueSobreCosto(0, 50)).toBe(0);
    expect(precioObjetivoPorRemarqueSobreCosto(-5, 50)).toBe(0);
  });

  it("redondea a centavos", () => {
    // 99.99 × 1.355 = 135.48645 → 135.49
    expect(precioObjetivoPorRemarqueSobreCosto(99.99, 35.5)).toBe(135.49);
  });
});

describe("margenSobreVentaPct", () => {
  it("calcula el margen neto sobre la venta", () => {
    // remarque 40% sobre costo equivale a ≈28,57% sobre venta
    expect(margenSobreVentaPct(100, 140)).toBe(28.57);
  });

  it("margen 0 cuando precio = costo", () => {
    expect(margenSobreVentaPct(100, 100)).toBe(0);
  });

  it("margen negativo cuando se vende abajo del costo", () => {
    expect(margenSobreVentaPct(140, 100)).toBe(-40);
  });

  it("devuelve 0 si el precio es 0 o negativo", () => {
    expect(margenSobreVentaPct(100, 0)).toBe(0);
  });

  it("costo 0 da 100% de margen", () => {
    expect(margenSobreVentaPct(0, 200)).toBe(100);
  });
});

describe("precioObjetivoPorMargenNeto", () => {
  it("calcula el precio que deja el margen pedido sobre la venta", () => {
    expect(precioObjetivoPorMargenNeto(100, 50)).toBe(200);
  });

  it("margen 0 devuelve el costo", () => {
    expect(precioObjetivoPorMargenNeto(100, 0)).toBe(100);
  });

  it("es la inversa del remarque: 28,57% sobre venta ≈ remarque 40%", () => {
    expect(precioObjetivoPorMargenNeto(100, 28.57)).toBe(140);
  });

  it("devuelve 0 si el costo es 0 o negativo", () => {
    expect(precioObjetivoPorMargenNeto(0, 30)).toBe(0);
  });

  it("clampa el margen a 99,99% (no divide por cero)", () => {
    expect(precioObjetivoPorMargenNeto(100, 150)).toBe(1_000_000);
  });

  it("clampa márgenes negativos a 0", () => {
    expect(precioObjetivoPorMargenNeto(100, -10)).toBe(100);
  });
});

describe("aplicarBonificacionSobrePrecio", () => {
  it("descuenta el porcentaje sobre el precio", () => {
    expect(aplicarBonificacionSobrePrecio(200, 10)).toBe(180);
  });

  it("bonificación 0 no cambia el precio", () => {
    expect(aplicarBonificacionSobrePrecio(200, 0)).toBe(200);
  });

  it("clampa la bonificación a 100 (precio queda en 0)", () => {
    expect(aplicarBonificacionSobrePrecio(200, 150)).toBe(0);
  });

  it("precio 0 o negativo devuelve 0", () => {
    expect(aplicarBonificacionSobrePrecio(0, 10)).toBe(0);
  });

  it("redondea a centavos", () => {
    // 199.99 × 0.875 = 174.99125 → 174.99
    expect(aplicarBonificacionSobrePrecio(199.99, 12.5)).toBe(174.99);
  });
});
