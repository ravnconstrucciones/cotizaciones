import { describe, expect, it } from "vitest";
import { compatDesglose } from "../desglose-compat";
import { rubroDeItem } from "../rubros";
import type { Desglose } from "../tipos";

/** Shape real de las cotizaciones cargadas por consola (Húsares 25/07):
 *  ítems {item, costo} y totales de venta — NO es el Desglose del motor.
 *  La mesa crasheaba con esto (normalizar(undefined) en rubroDeItem). */
const LEGACY_HUSARES = {
  items: [
    { item: "Mano de obra Fran — 2 x $700.000 (tipo A) + 2 x $900.000 (tipo B)", costo: 3200000 },
    { item: "Obra gris — 4 x $152.989", costo: 611956 },
    { item: "Pintura (la provee RAVN) — 4 x $85.000", costo: 340000 },
    { item: "Flete", costo: 75000 },
    { item: "Volquete", costo: 150000 },
    { item: "Contención en altura máxima (estimada, a confirmar con Fran)", costo: 200000 },
  ],
  metodo: "MO real de Fran + cómputo propio",
  totales: { margen: 2223044, margen_pct: "32,7% sobre venta", costo_total: 4576956, precio_cliente: 6800000 },
  forma_pago: "40/30/30",
  generado_at: "2026-07-25",
  receta_nombre: "manual — MO Fran cerrada + lista por tipo de vano",
};

function motorMinimo(): Desglose {
  return {
    receta_nombre: "r",
    receta_version: 1,
    parametros: {},
    items: [
      {
        nombre: "Klaukol impermeable",
        etapa: "colocación",
        tipo: "material",
        unidad: "bolsa",
        formula: "m2*0.3",
        cantidad_base: 3,
        desperdicio_pct: 10,
        cantidad: 4,
        precios: {},
        precio_min: 10000,
        precio_max: 12000,
        subtotal_min: 40000,
        subtotal_max: 48000,
        divergencia_pct: null,
        sin_precio: false,
      },
    ],
    extras: [],
    totales: {
      materiales_min: 40000,
      materiales_max: 48000,
      mano_de_obra_min: 0,
      mano_de_obra_max: 0,
      extras_min: 0,
      extras_max: 0,
      subtotal_min: 40000,
      subtotal_max: 48000,
      imprevistos_pct: 10,
      factor_zona_min: 1,
      factor_zona_max: 1.1,
      total_min: 44000,
      total_max: 58080,
    },
    tiempo: { dias_min: 1, dias_max: 2, cuadrilla_max: 2 },
    generado_at: "2026-07-26T00:00:00.000Z",
  };
}

describe("compatDesglose", () => {
  it("desglose del motor pasa intacto (legacy=false, misma referencia)", () => {
    const motor = motorMinimo();
    const res = compatDesglose(motor);
    expect(res).not.toBeNull();
    expect(res!.legacy).toBe(false);
    expect(res!.desglose).toBe(motor);
  });

  it("null, {}, o sin items → null (cae al DESGLOSE_VACIO de la pantalla)", () => {
    expect(compatDesglose(null)).toBeNull();
    expect(compatDesglose(undefined)).toBeNull();
    expect(compatDesglose({})).toBeNull();
    expect(compatDesglose({ metodo: "x" })).toBeNull();
    expect(compatDesglose("hola")).toBeNull();
  });

  it("shape legacy de consola → Desglose válido y legacy=true", () => {
    const res = compatDesglose(LEGACY_HUSARES);
    expect(res).not.toBeNull();
    expect(res!.legacy).toBe(true);
    const d = res!.desglose;
    expect(d.items).toHaveLength(6);
    // Todos los ítems son procesables por rubroDeItem SIN crashear (el bug original).
    for (const it of d.items) {
      expect(typeof it.nombre).toBe("string");
      expect(it.nombre.length).toBeGreaterThan(0);
      expect(() => rubroDeItem(it)).not.toThrow();
    }
    // La MO cae en la solapa de mano de obra por el nombre.
    expect(rubroDeItem(d.items[0])).toBe("mano_de_obra");
    // El costo va literal a precio y subtotal, min=max (números clavados).
    expect(d.items[0].subtotal_min).toBe(3200000);
    expect(d.items[0].subtotal_max).toBe(3200000);
    expect(d.items[1].precio_min).toBe(611956);
    expect(d.items[1].sin_precio).toBe(false);
  });

  it("legacy: totales salen de los ítems y el total es el costo_total literal", () => {
    const d = compatDesglose(LEGACY_HUSARES)!.desglose;
    expect(d.totales.mano_de_obra_min).toBe(3200000);
    expect(d.totales.materiales_min).toBe(611956 + 340000 + 75000 + 150000 + 200000);
    expect(d.totales.total_min).toBe(4576956);
    expect(d.totales.total_max).toBe(4576956);
    // Campos que la hoja lee sí o sí: no pueden faltar.
    expect(d.tiempo).toEqual({ dias_min: 0, dias_max: 0, cuadrilla_max: 0 });
    expect(d.extras).toEqual([]);
    expect(d.totales.imprevistos_pct).toBe(0);
  });

  it("legacy: ítem sin costo queda SIN PRECIO y no suma", () => {
    const res = compatDesglose({ items: [{ item: "Ajuste a definir" }] });
    expect(res!.legacy).toBe(true);
    const it = res!.desglose.items[0];
    expect(it.sin_precio).toBe(true);
    expect(it.precio_min).toBeNull();
    expect(it.subtotal_min).toBe(0);
    // Sin costo_total: el total cae a la suma de subtotales.
    expect(res!.desglose.totales.total_min).toBe(0);
  });

  it("legacy: ítem sin nombre no revienta la conversión", () => {
    const res = compatDesglose({ items: [{ costo: 1000 }] });
    expect(res).not.toBeNull();
    expect(res!.desglose.items[0].nombre.length).toBeGreaterThan(0);
  });
});
