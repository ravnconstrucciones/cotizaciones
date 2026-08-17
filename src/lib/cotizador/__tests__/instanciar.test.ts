import { describe, it, expect } from "vitest";
import { instanciarItems, parametrosNumericos, validarParametros } from "../instanciar";
import type { Receta, PrecioItem } from "../tipos";

const RECETA: Receta = {
  nombre: "pintura-interior",
  titulo: "Pintura interior completa",
  estado: "confiable",
  version: 1,
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
    { nombre: "calidad", etiqueta: "Calidad", tipo: "opcion", requerido: false, opciones: ["estandar", "premium"] },
  ],
  checklist: ["enduido en paredes con imperfecciones"],
  fuentes: [{ titulo: "Seia — pintura interior", tipo: "seia", fecha: "2026-06-01" }],
  etapas: [
    {
      nombre: "Pintura",
      orden: 1,
      dias_min: 3,
      dias_max: 5,
      cuadrilla: 2,
      items: [
        {
          nombre: "Latex interior 20L",
          tipo: "material",
          unidad: "u",
          formula: "ceil(superficie_m2 * 2 / 80)",
          desperdicio_pct: 10,
        },
        {
          nombre: "Pintor por m2",
          tipo: "mano_de_obra",
          unidad: "m2",
          formula: "superficie_m2",
        },
      ],
    },
  ],
};

const PRECIOS: Record<string, PrecioItem> = {
  "Latex interior 20L": {
    sismat: { valor: 90000, fuente: "SISMAT", fecha: "2026-06-08" },
    internet: { valor: 120000, fuente: "easy.com.ar", fecha: "2026-06-11" },
  },
  "Pintor por m2": {
    sismat: { valor: 5500, fuente: "SISMAT", fecha: "2026-06-08" },
  },
};

describe("parametrosNumericos", () => {
  it("filtra solo los numéricos", () => {
    expect(parametrosNumericos({ superficie_m2: 80, calidad: "premium" })).toEqual({
      superficie_m2: 80,
    });
  });
});

describe("validarParametros", () => {
  it("reclama los requeridos que faltan", () => {
    expect(validarParametros(RECETA, {})).toEqual(["superficie_m2"]);
    expect(validarParametros(RECETA, { superficie_m2: 80 })).toEqual([]);
  });
});

describe("instanciarItems", () => {
  const items = instanciarItems(RECETA, { superficie_m2: 80 }, PRECIOS);

  it("calcula cantidad con desperdicio y redondeo arriba para material", () => {
    const latex = items.find((i) => i.nombre === "Latex interior 20L")!;
    // ceil(80*2/80)=2 → +10% desperdicio = 2.2 → redondeo arriba = 3
    expect(latex.cantidad_base).toBe(2);
    expect(latex.cantidad).toBe(3);
    expect(latex.subtotal_min).toBe(270000); // 3 × 90.000
    expect(latex.subtotal_max).toBe(360000); // 3 × 120.000
    expect(latex.divergencia_pct).toBeCloseTo(33.3, 1); // (120000-90000)/90000
  });

  it("MO sin redondeo arriba y con un solo precio", () => {
    const mo = items.find((i) => i.nombre === "Pintor por m2")!;
    expect(mo.cantidad).toBe(80);
    expect(mo.precio_min).toBe(5500);
    expect(mo.precio_max).toBe(5500);
    expect(mo.subtotal_min).toBe(440000);
    expect(mo.divergencia_pct).toBeNull();
  });

  it("ítem sin precio queda marcado, no rompe", () => {
    const sinPrecio = instanciarItems(RECETA, { superficie_m2: 80 }, {});
    const latex = sinPrecio.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.sin_precio).toBe(true);
    expect(latex.precio_min).toBeNull();
    expect(latex.subtotal_min).toBe(0);
  });
});

describe("maquinaria (puerta de entrada, 17/08)", () => {
  const recetaCon = (items: Receta["etapas"][0]["items"]): Receta => ({
    ...RECETA,
    etapas: [{ nombre: "Etapa", orden: 1, items }],
  });

  it("maquinaria propia se lista sin precio ni subtotal, y no pide decisión", () => {
    const [it_] = instanciarItems(
      recetaCon([
        {
          nombre: "Sierra de sable",
          tipo: "maquinaria",
          modalidad: "propia",
          unidad: "u",
          formula: "1",
          origen: { fuente: "t", confianza: "estimado" },
        },
      ]),
      { superficie_m2: 10 },
      {}
    );
    expect(it_.modalidad).toBe("propia");
    expect(it_.sin_precio).toBe(false);
    expect(it_.precio_min).toBeNull();
    expect(it_.subtotal_min).toBe(0);
    expect(it_.subtotal_max).toBe(0);
  });

  it("maquinaria alquiler se precia como un material y propaga la marca artefacto", () => {
    const items = instanciarItems(
      recetaCon([
        {
          nombre: "Andamio",
          tipo: "maquinaria",
          modalidad: "alquiler",
          unidad: "dia",
          formula: "3",
          redondeo: "ninguno",
          origen: { fuente: "t", confianza: "estimado" },
        },
        {
          nombre: "Grifería FV",
          tipo: "material",
          artefacto: true,
          unidad: "u",
          formula: "1",
          origen: { fuente: "t", confianza: "verificado" },
        },
      ]),
      { superficie_m2: 10 },
      { Andamio: { internet: { valor: 20000, fuente: "alquilerandamios.com.ar", fecha: "2026-08-17" } } }
    );
    expect(items[0].sin_precio).toBe(false);
    expect(items[0].subtotal_min).toBe(60000);
    expect(items[0].modalidad).toBe("alquiler");
    expect(items[1].artefacto).toBe(true);
  });
});
