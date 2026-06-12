import { describe, it, expect } from "vitest";
import { calcularTotales, calcularTiempo, esZonaPremium, FACTOR_ZONA_PREMIUM } from "../totales";
import type { ExtraDesglose, ItemDesglose, Receta } from "../tipos";

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

const ITEMS: ItemDesglose[] = [
  item({ tipo: "material", subtotal_min: 100000, subtotal_max: 120000 }),
  item({ tipo: "mano_de_obra", subtotal_min: 400000, subtotal_max: 400000 }),
];
const EXTRAS: ExtraDesglose[] = [
  { nombre: "Flete", monto_min: 30000, monto_max: 50000, fuente: "internet", fecha: "2026-06-11" },
];

describe("esZonaPremium", () => {
  it("detecta countries y barrios privados", () => {
    expect(esZonaPremium("Nordelta")).toBe(true);
    expect(esZonaPremium("country Abril, Berazategui")).toBe(true);
    expect(esZonaPremium("Barrio privado Santa Bárbara")).toBe(true);
    expect(esZonaPremium("Palermo")).toBe(false);
    expect(esZonaPremium(undefined)).toBe(false);
  });
});

describe("calcularTotales", () => {
  it("suma por tipo, aplica imprevistos y sin factor zona", () => {
    const t = calcularTotales(ITEMS, EXTRAS, { imprevistos_pct: 10, zona: "Palermo" });
    expect(t.materiales_min).toBe(100000);
    expect(t.mano_de_obra_min).toBe(400000);
    expect(t.extras_max).toBe(50000);
    expect(t.subtotal_min).toBe(530000);
    expect(t.subtotal_max).toBe(570000);
    expect(t.factor_zona_min).toBe(1);
    // 530.000 × 1.10 = 583.000 ; 570.000 × 1.10 = 627.000
    expect(t.total_min).toBe(583000);
    expect(t.total_max).toBe(627000);
  });

  it("aplica factor zona premium 1.15–1.20", () => {
    const t = calcularTotales(ITEMS, [], { imprevistos_pct: 0, zona: "Nordelta" });
    expect(t.factor_zona_min).toBe(FACTOR_ZONA_PREMIUM.min);
    expect(t.factor_zona_max).toBe(FACTOR_ZONA_PREMIUM.max);
    // 500.000×1.15=575.000 ; 520.000×1.20=624.000
    expect(t.total_min).toBe(575000);
    expect(t.total_max).toBe(624000);
  });
});

describe("calcularTiempo", () => {
  it("suma días por etapa y toma la cuadrilla máxima", () => {
    const receta = {
      etapas: [
        { nombre: "a", orden: 1, items: [], dias_min: 2, dias_max: 3, cuadrilla: 2 },
        { nombre: "b", orden: 2, items: [], dias_min: 1, dias_max: 2, cuadrilla: 3 },
      ],
    } as unknown as Receta;
    expect(calcularTiempo(receta)).toEqual({ dias_min: 3, dias_max: 5, cuadrilla_max: 3 });
  });
});
