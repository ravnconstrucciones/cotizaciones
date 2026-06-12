import { describe, it, expect } from "vitest";
import { evaluarChecklist, CHECKLIST_GLOBAL } from "../checklist";
import type { ExtraDesglose, ItemDesglose } from "../tipos";

function item(nombre: string): ItemDesglose {
  return {
    nombre,
    etapa: "e",
    tipo: "material",
    unidad: "u",
    formula: "1",
    cantidad_base: 1,
    desperdicio_pct: 0,
    cantidad: 1,
    precios: {},
    precio_min: 1,
    precio_max: 1,
    subtotal_min: 1,
    subtotal_max: 1,
    divergencia_pct: null,
    sin_precio: false,
  };
}

const EXTRAS: ExtraDesglose[] = [
  { nombre: "Flete corralón", monto_min: 1, monto_max: 2, fuente: "x", fecha: "2026-06-11" },
];

describe("evaluarChecklist", () => {
  const resultados = evaluarChecklist({
    items: [item("Volquete 5m3"), item("Latex interior")],
    extras: EXTRAS,
    checklist_receta: ["enduido", "cinta de papel"],
    imprevistos_pct: 10,
    zona: "Nordelta",
  });
  const porItem = Object.fromEntries(resultados.map((r) => [r.item, r]));

  it("evalúa todos los globales + los de la receta", () => {
    expect(resultados).toHaveLength(CHECKLIST_GLOBAL.length + 2);
  });

  it("marca cubierto lo que aparece en items o extras", () => {
    expect(porItem["flete"].estado).toBe("cubierto");
    expect(porItem["flete"].detalle).toContain("Flete corralón");
    expect(porItem["volquete"].estado).toBe("cubierto");
  });

  it("marca faltante lo que no aparece", () => {
    expect(porItem["andamios"].estado).toBe("faltante");
    expect(porItem["enduido"].estado).toBe("faltante");
    expect(porItem["cinta de papel"].estado).toBe("faltante");
  });

  it("imprevistos y factor zona se evalúan por configuración, no por texto", () => {
    expect(porItem["imprevistos"].estado).toBe("cubierto");
    expect(porItem["factor zona"].estado).toBe("cubierto");
  });

  it("factor zona no aplica fuera de zonas premium; imprevistos 0 = faltante", () => {
    const r = evaluarChecklist({
      items: [],
      extras: [],
      checklist_receta: [],
      imprevistos_pct: 0,
      zona: "Palermo",
    });
    const por = Object.fromEntries(r.map((x) => [x.item, x]));
    expect(por["factor zona"].estado).toBe("no_aplica");
    expect(por["imprevistos"].estado).toBe("faltante");
  });
});
