import { describe, it, expect } from "vitest";
import { evaluarSanidad } from "../sanidad";
import type { ItemDesglose, TotalesDesglose } from "../tipos";

function item(parcial: Partial<ItemDesglose>): ItemDesglose {
  return {
    nombre: "x",
    etapa: "e",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: 100,
    precio_max: 100,
    subtotal_min: 100,
    subtotal_max: 100,
    divergencia_pct: null,
    sin_precio: false,
    ...parcial,
  };
}

const TOTALES: TotalesDesglose = {
  materiales_min: 0,
  materiales_max: 0,
  mano_de_obra_min: 0,
  mano_de_obra_max: 0,
  extras_min: 0,
  extras_max: 0,
  subtotal_min: 0,
  subtotal_max: 0,
  imprevistos_pct: 10,
  factor_zona_min: 1,
  factor_zona_max: 1,
  total_min: 4_000_000,
  total_max: 5_000_000,
};

const BANDA = { min: 40_000, max: 70_000, fuente: "clickie.com.ar", fecha: "2026-06-10" };

describe("evaluarSanidad — rango físico por ítem", () => {
  it("ok dentro del rango", () => {
    const r = evaluarSanidad({
      items: [
        item({
          nombre: "Latex",
          cantidad: 3,
          rango_fisico: { parametro: "superficie_m2", min: 0.02, max: 0.05 },
        }),
      ],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    const chequeo = r.find((x) => x.chequeo === "rendimiento: Latex")!;
    expect(chequeo.estado).toBe("ok");
    expect(chequeo.detalle).toContain("0.0375");
  });

  it("fuera_de_rango cuando la cantidad no cierra físicamente", () => {
    const r = evaluarSanidad({
      items: [
        item({
          nombre: "Latex",
          cantidad: 10,
          rango_fisico: { parametro: "superficie_m2", min: 0.02, max: 0.05 },
        }),
      ],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    expect(r.find((x) => x.chequeo === "rendimiento: Latex")!.estado).toBe("fuera_de_rango");
  });

  it("sin_datos si falta el parámetro del rango", () => {
    const r = evaluarSanidad({
      items: [
        item({
          nombre: "Zocalo",
          cantidad: 12,
          rango_fisico: { parametro: "ml_zocalo", min: 0.9, max: 1.2 },
        }),
      ],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    expect(r.find((x) => x.chequeo === "rendimiento: Zocalo")!.estado).toBe("sin_datos");
  });
});

describe("evaluarSanidad — precios", () => {
  it("marca los ítems sin precio", () => {
    const r = evaluarSanidad({
      items: [item({ nombre: "Volquete", sin_precio: true, precio_min: null, precio_max: null })],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: BANDA,
    });
    const chequeo = r.find((x) => x.chequeo === "precio: Volquete")!;
    expect(chequeo.estado).toBe("sin_datos");
  });
});

describe("evaluarSanidad — banda $/m²", () => {
  it("ok si el rango del total pisa la banda", () => {
    // 4M–5M / 80 m² = $50.000–$62.500/m² vs banda 40.000–70.000
    const r = evaluarSanidad({ items: [], totales: TOTALES, parametros: { superficie_m2: 80 }, banda_m2: BANDA });
    const banda = r.find((x) => x.chequeo === "precio por m2")!;
    expect(banda.estado).toBe("ok");
    expect(banda.detalle).toContain("50000");
  });

  it("fuera_de_rango si el rango del total no toca la banda", () => {
    const r = evaluarSanidad({
      items: [],
      totales: TOTALES,
      parametros: { superficie_m2: 80 },
      banda_m2: { min: 70_000, max: 90_000, fuente: "x", fecha: "2026-06-10" },
    });
    expect(r.find((x) => x.chequeo === "precio por m2")!.estado).toBe("fuera_de_rango");
  });

  it("sin_datos sin banda o sin superficie", () => {
    const sinBanda = evaluarSanidad({ items: [], totales: TOTALES, parametros: { superficie_m2: 80 } });
    expect(sinBanda.find((x) => x.chequeo === "precio por m2")!.estado).toBe("sin_datos");

    const sinSuperficie = evaluarSanidad({ items: [], totales: TOTALES, parametros: {}, banda_m2: BANDA });
    expect(sinSuperficie.find((x) => x.chequeo === "precio por m2")!.estado).toBe("sin_datos");
  });
});
