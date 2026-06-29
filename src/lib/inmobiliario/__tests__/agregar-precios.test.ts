import { describe, it, expect } from "vitest";
import { agregarZona } from "@/lib/inmobiliario/agregar-precios";
import type { AvisoNormalizado } from "@/lib/inmobiliario/tipos";

function aviso(tipoDato: AvisoNormalizado["tipoDato"], usdPorM2: number): AvisoNormalizado {
  return {
    fuente: "test", tipoDato, fuenteId: Math.random().toString(),
    zonaMatch: "Palermo", operacion: "venta", tipoProp: "departamento",
    precioUsd: usdPorM2 * 50, m2: 50, usdPorM2, ambientes: 2, antiguedad: 10,
    capturadoEn: new Date().toISOString(),
  };
}
describe("agregarZona", () => {
  it("calcula factor de ajuste real cuando hay escrituras", () => {
    const avisos = [
      ...Array(10).fill(0).map(() => aviso("publicacion", 2000)),
      ...Array(10).fill(0).map(() => aviso("cierre", 1800)),
    ];
    const r = agregarZona(avisos);
    expect(r.medianaPublicacionUsdM2).toBe(2000);
    expect(r.medianaCierreUsdM2).toBe(1800);
    expect(r.factorAjuste).toBeCloseTo(0.9, 2);
    expect(r.confianza).toBe("alta");
  });
  it("usa factor por defecto y confianza 'estimada' cuando no hay escrituras", () => {
    const avisos = Array(10).fill(0).map(() => aviso("publicacion", 2000));
    const r = agregarZona(avisos);
    expect(r.medianaPublicacionUsdM2).toBe(2000);
    expect(r.medianaCierreUsdM2).toBe(1800);
    expect(r.confianza).toBe("estimada");
    expect(r.nEscrituras).toBe(0);
  });
  it("no rompe sin avisos de publicación", () => {
    const r = agregarZona([]);
    expect(r.medianaPublicacionUsdM2).toBeNull();
    expect(r.medianaCierreUsdM2).toBeNull();
    expect(r.nAvisos).toBe(0);
  });
});
