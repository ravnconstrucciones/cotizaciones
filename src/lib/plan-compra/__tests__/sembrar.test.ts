import { describe, expect, it } from "vitest";
import { sembrarPlanDesdeDesglose } from "../sembrar";
import type { Desglose } from "@/lib/cotizador/tipos";

const desglose: Desglose = {
  receta_nombre: "pintura-interior",
  receta_version: 1,
  parametros: { superficie_m2: 40 },
  items: [
    {
      nombre: "Látex interior 20L",
      etapa: "Pintura",
      tipo: "material",
      unidad: "u",
      formula: "ceil(superficie_m2 / 20)",
      cantidad_base: 2,
      desperdicio_pct: 0,
      cantidad: 2,
      precios: {
        internet: { valor: 90000, fuente: "easy.com.ar", fecha: "2026-07-01" },
        sismat: { valor: 110000, fuente: "SISMAT", fecha: "2026-06-15" },
      },
      precio_min: 90000,
      precio_max: 110000,
      subtotal_min: 180000,
      subtotal_max: 220000,
      divergencia_pct: 22.2,
      sin_precio: false,
    },
    {
      nombre: "Pintor oficial",
      etapa: "Pintura",
      tipo: "mano_de_obra",
      unidad: "dia",
      formula: "3",
      cantidad_base: 3,
      desperdicio_pct: 0,
      cantidad: 3,
      precios: { sismat: { valor: 80000, fuente: "SISMAT", fecha: "2026-06-15" } },
      precio_min: 80000,
      precio_max: 80000,
      subtotal_min: 240000,
      subtotal_max: 240000,
      divergencia_pct: null,
      sin_precio: false,
    },
  ],
  extras: [
    { nombre: "Flete", monto_min: 30000, monto_max: 40000, fuente: "estimado", fecha: "2026-07-01" },
  ],
  totales: {
    materiales_min: 180000,
    materiales_max: 220000,
    mano_de_obra_min: 240000,
    mano_de_obra_max: 240000,
    extras_min: 30000,
    extras_max: 40000,
    subtotal_min: 450000,
    subtotal_max: 500000,
    imprevistos_pct: 0,
    factor_zona_min: 1,
    factor_zona_max: 1,
    total_min: 450000,
    total_max: 500000,
  },
  tiempo: { dias_min: 3, dias_max: 4, cuadrilla_max: 2 },
  generado_at: "2026-07-01T12:00:00Z",
};

describe("sembrarPlanDesdeDesglose", () => {
  it("convierte cada ítem del desglose en fila del plan con snapshot congelado", () => {
    const filas = sembrarPlanDesdeDesglose(desglose, "pres-1", "cot-1");
    expect(filas).toHaveLength(3); // 2 items + 1 extra

    const latex = filas[0];
    expect(latex).toMatchObject({
      presupuesto_id: "pres-1",
      cotizacion_id: "cot-1",
      origen: "cotizacion",
      tipo: "material",
      nombre: "Látex interior 20L",
      etapa: "Pintura",
      unidad: "u",
      cantidad: 2,
      precio_unitario: 100000, // punto medio de 90k/110k
      incluido: true,
    });
    expect(latex.cotizado).toEqual({
      cantidad: 2,
      unidad: "u",
      precio_min: 90000,
      precio_max: 110000,
      subtotal_min: 180000,
      subtotal_max: 220000,
      fuente: "easy.com.ar",
      fecha: "2026-07-01",
    });
  });

  it("los extras entran como tipo extra, cantidad 1, precio = punto medio", () => {
    const filas = sembrarPlanDesdeDesglose(desglose, "pres-1", "cot-1");
    const flete = filas[2];
    expect(flete).toMatchObject({
      tipo: "extra",
      nombre: "Flete",
      etapa: "Extras",
      cantidad: 1,
      precio_unitario: 35000,
    });
    expect(flete.cotizado).toMatchObject({
      subtotal_min: 30000,
      subtotal_max: 40000,
      fuente: "estimado",
    });
  });

  it("ítem sin precio: precio_unitario null, snapshot con subtotales 0", () => {
    const sinPrecio: Desglose = {
      ...desglose,
      items: [
        {
          ...desglose.items[0],
          precios: {},
          precio_min: null,
          precio_max: null,
          subtotal_min: 0,
          subtotal_max: 0,
          sin_precio: true,
        },
      ],
      extras: [],
    };
    const filas = sembrarPlanDesdeDesglose(sinPrecio, "p", "c");
    expect(filas[0].precio_unitario).toBeNull();
    expect(filas[0].cotizado).toMatchObject({ precio_min: null, subtotal_min: 0 });
  });
});

describe("sembrarPlanDesdeDesglose + hoja viva (Tramo B)", () => {
  it("un ítem apagado en la mesa (activo: false) NO se siembra en el plan", () => {
    const conApagado: Desglose = {
      ...desglose,
      items: [{ ...desglose.items[0], activo: false }, desglose.items[1]],
    };
    const filas = sembrarPlanDesdeDesglose(conApagado, "pres-1", "cot-1");
    expect(filas).toHaveLength(2); // 1 item + 1 extra — el apagado no resucita
    expect(filas.some((f) => f.nombre === "Látex interior 20L")).toBe(false);
  });
});
