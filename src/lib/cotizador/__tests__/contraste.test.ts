import { describe, it, expect } from "vitest";
import { contrastarObra } from "../contraste";
import type { Desglose, ItemDesglose } from "../tipos";

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

const DESGLOSE: Desglose = {
  receta_nombre: "pintura-interior",
  receta_version: 1,
  parametros: { superficie_m2: 80 },
  items: [
    item({ nombre: "Latex interior 20L", tipo: "material", subtotal_min: 270000, subtotal_max: 360000 }),
    item({ nombre: "Pintor por m2", tipo: "mano_de_obra", subtotal_min: 440000, subtotal_max: 440000 }),
  ],
  extras: [],
  totales: {
    materiales_min: 270000,
    materiales_max: 360000,
    mano_de_obra_min: 440000,
    mano_de_obra_max: 440000,
    extras_min: 0,
    extras_max: 0,
    subtotal_min: 710000,
    subtotal_max: 800000,
    imprevistos_pct: 10,
    factor_zona_min: 1,
    factor_zona_max: 1,
    total_min: 781000,
    total_max: 880000,
  },
  tiempo: { dias_min: 3, dias_max: 5, cuadrilla_max: 2 },
  generado_at: "2026-06-12T12:00:00.000Z",
};

const GASTOS = [
  { descripcion: "2 latas latex alba 20l", importe: 250000, fecha: "2026-06-20" },
  { descripcion: "pago pintor semana 1", importe: 300000, fecha: "2026-06-21" },
  { descripcion: "pago pintor semana 2", importe: 200000, fecha: "2026-06-28" },
  { descripcion: "fletes varios", importe: 40000, fecha: "2026-06-20" },
];

describe("contrastarObra", () => {
  const r = contrastarObra(DESGLOSE, GASTOS);
  const porItem = Object.fromEntries(r.ajuste.items.map((i) => [i.nombre, i]));

  it("matchea gastos a ítems por palabras clave y calcula el desvío contra el punto medio", () => {
    // latex: gastado 250.000 vs medio 315.000 → -20,6%
    expect(porItem["Latex interior 20L"].gastado).toBe(250000);
    expect(porItem["Latex interior 20L"].gastos_matcheados).toBe(1);
    expect(porItem["Latex interior 20L"].desvio_pct).toBe(-20.6);
    // pintor: gastado 500.000 vs medio 440.000 → +13,6%
    expect(porItem["Pintor por m2"].gastado).toBe(500000);
    expect(porItem["Pintor por m2"].gastos_matcheados).toBe(2);
    expect(porItem["Pintor por m2"].desvio_pct).toBe(13.6);
  });

  it("acumula lo que no matchea en gastos_sin_match", () => {
    expect(r.ajuste.gastos_sin_match).toEqual([{ descripcion: "fletes varios", importe: 40000 }]);
  });

  it("calcula el desvío total con TODOS los gastos (matcheados o no)", () => {
    // gastado 790.000 vs medio total 830.500 → -4,9%
    expect(r.ajuste.total_gastado).toBe(790000);
    expect(r.ajuste.desvio_total_pct).toBe(-4.9);
    expect(r.ajuste.total_cotizado_min).toBe(781000);
    expect(r.ajuste.total_cotizado_max).toBe(880000);
  });

  it("escribe una lección legible con receta, totales y los peores desvíos", () => {
    expect(r.leccion).toContain("pintura-interior");
    expect(r.leccion).toContain("-4.9%");
    expect(r.leccion).toContain("Latex interior 20L -20.6%");
    expect(r.leccion).toContain("1 gasto(s) sin match");
  });

  it("ítem sin gastos matcheados queda con desvío null (sin datos, no 'gastó 0')", () => {
    const sinGastos = contrastarObra(DESGLOSE, [{ descripcion: "fletes varios", importe: 40000, fecha: "2026-06-20" }]);
    const latex = sinGastos.ajuste.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.desvio_pct).toBeNull();
    expect(latex.gastado).toBe(0);
  });

  it("calibra la duración real (rango de fechas de gastos) contra los días de la receta", () => {
    // gastos del 2026-06-20 al 2026-06-28 → 9 días corridos inclusive, vs 3–5 cotizados
    expect(r.ajuste.tiempo).toEqual({
      dias_cotizados_min: 3,
      dias_cotizados_max: 5,
      dias_reales: 9,
      desvio_dias: 4, // 9 reales − 5 del máximo cotizado
    });
    expect(r.leccion).toContain("Duración real 9 día(s) vs 3–5 cotizados");
    expect(r.leccion).toContain("+4 día(s)");
  });

  it("sin fechas válidas en los gastos, el tiempo queda sin datos (null), nunca inventado", () => {
    const sinFechas = contrastarObra(DESGLOSE, [{ descripcion: "latex", importe: 1000, fecha: "" }]);
    expect(sinFechas.ajuste.tiempo.dias_reales).toBeNull();
    expect(sinFechas.ajuste.tiempo.desvio_dias).toBeNull();
    expect(sinFechas.leccion).not.toContain("Duración real");
  });
});
