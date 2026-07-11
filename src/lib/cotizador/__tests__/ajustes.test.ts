import { describe, it, expect } from "vitest";
import { cotizar } from "../cotizar";
import { rubroDeItem } from "../rubros";
import type { PrecioItem, Receta } from "../tipos";

/**
 * Tests de la hoja viva (Tramo B): ajustes de la mesa aplicados por el motor.
 * Misma receta fixture que cotizar.test.ts para que los números sean chequeables
 * a mano: latex 3u × (90k–120k), MO 80 m² × 5.500 = 440k. Sin extras ni zona
 * acá para que las cuentas queden redondas (imprevistos 10%).
 */
const RECETA: Receta = {
  nombre: "pintura-interior",
  titulo: "Pintura interior completa",
  estado: "confiable",
  version: 1,
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
  ],
  checklist: [],
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

const entrada = () => ({
  receta: RECETA,
  parametros: { superficie_m2: 80 },
  precios: PRECIOS,
  imprevistos_pct: 10,
  hoy: "2026-06-12",
});

const PRECIO_EZE = { valor: 100000, fuente: "Eze — mesa de revisión", fecha: "2026-07-11" };

describe("ajustes de la mesa (hoja viva)", () => {
  it("precio Eze PISA el rango (min = max) y deja las fuentes de referencia", () => {
    const r = cotizar({
      ...entrada(),
      ajustes: { items: [{ nombre: "Latex interior 20L", precio_eze: PRECIO_EZE }] },
    });
    const latex = r.desglose.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.precio_min).toBe(100000);
    expect(latex.precio_max).toBe(100000);
    expect(latex.precios.eze).toEqual(PRECIO_EZE);
    expect(latex.precios.sismat?.valor).toBe(90000); // la referencia no se borra
    // 3u × 100k = 300k + MO 440k = 740k × 1.10 = 814k en ambas puntas
    expect(r.total_min).toBe(814000);
    expect(r.total_max).toBe(814000);
  });

  it("precio Eze da precio a un ítem SIN PRECIO (deja de ser hueco)", () => {
    const r = cotizar({
      ...entrada(),
      precios: { "Pintor por m2": PRECIOS["Pintor por m2"] }, // latex sin fila
      ajustes: { items: [{ nombre: "Latex interior 20L", precio_eze: PRECIO_EZE }] },
    });
    const latex = r.desglose.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.sin_precio).toBe(false);
    expect(latex.subtotal_min).toBe(300000);
  });

  it("cantidad editada pisa la fórmula y recalcula subtotales, con marca de edición", () => {
    const r = cotizar({
      ...entrada(),
      ajustes: { items: [{ nombre: "Latex interior 20L", cantidad: 5 }] },
    });
    const latex = r.desglose.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.cantidad).toBe(5);
    expect(latex.cantidad_editada).toBe(true);
    expect(latex.formula).toBe("ceil(superficie_m2 * 2 / 80)"); // la traza queda
    expect(latex.subtotal_min).toBe(450000); // 5 × 90k
    expect(latex.subtotal_max).toBe(600000); // 5 × 120k
  });

  it("ítem apagado (activo: false) queda visible pero NO suma al total", () => {
    const base = cotizar(entrada());
    const r = cotizar({
      ...entrada(),
      ajustes: { items: [{ nombre: "Latex interior 20L", activo: false }] },
    });
    const latex = r.desglose.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.activo).toBe(false);
    expect(r.desglose.items).toHaveLength(2); // sigue en el desglose
    // Solo queda la MO: 440k × 1.10 = 484k
    expect(r.total_min).toBe(484000);
    expect(r.total_max).toBe(484000);
    expect(r.total_min).toBeLessThan(base.total_min);
  });

  it("ítem manual entra al desglose y al total; sin precio queda como hueco", () => {
    const r = cotizar({
      ...entrada(),
      ajustes: {
        manuales: [
          {
            nombre: "Mampara vidrio templado a medida",
            rubro: "sanitarios",
            tipo: "material",
            unidad: "u",
            cantidad: 1,
            precio: { valor: 500000, fuente: "Eze — mesa de revisión", fecha: "2026-07-11" },
          },
          {
            nombre: "Cortina roller",
            rubro: "mobiliario",
            tipo: "material",
            unidad: "u",
            cantidad: 1, // sin precio: hueco visible, no inventa
          },
        ],
      },
    });
    const mampara = r.desglose.items.find((i) => i.nombre === "Mampara vidrio templado a medida")!;
    expect(mampara.manual).toBe(true);
    expect(mampara.subtotal_min).toBe(500000);
    const roller = r.desglose.items.find((i) => i.nombre === "Cortina roller")!;
    expect(roller.sin_precio).toBe(true);
    expect(roller.subtotal_max).toBe(0);
    // base 710k–800k (latex 270k–360k + MO 440k) + mampara 500k, × 1.10
    expect(r.total_min).toBe(1331000);
    expect(r.total_max).toBe(1430000);
  });

  it("los ajustes se persisten en desglose.ajustes para re-aplicarse en re-corridas", () => {
    const ajustes = { items: [{ nombre: "Latex interior 20L", precio_eze: PRECIO_EZE }] };
    const r = cotizar({ ...entrada(), ajustes });
    expect(r.desglose.ajustes).toEqual(ajustes);
    // Re-corrida con otro parámetro: el precio Eze sobrevive.
    const r2 = cotizar({
      ...entrada(),
      parametros: { superficie_m2: 120 },
      ajustes: r.desglose.ajustes,
    });
    const latex = r2.desglose.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.precios.eze).toEqual(PRECIO_EZE);
    expect(latex.cantidad).toBe(4); // ceil(120×2/80 × 1.10) — la fórmula sigue viva
  });

  it("un ajuste a un ítem que ya no existe en la receta se ignora sin romper", () => {
    const r = cotizar({
      ...entrada(),
      ajustes: { items: [{ nombre: "Ítem fantasma", precio_eze: PRECIO_EZE }] },
    });
    expect(r.desglose.items).toHaveLength(2);
    expect(r.total_min).toBe(781000); // (270k + 440k) × 1.10 — nada cambió
  });

  it("precio eze que viene del CACHE (precios_items) también pisa en instanciación", () => {
    const r = cotizar({
      ...entrada(),
      precios: {
        ...PRECIOS,
        "Latex interior 20L": { ...PRECIOS["Latex interior 20L"], eze: PRECIO_EZE },
      },
    });
    const latex = r.desglose.items.find((i) => i.nombre === "Latex interior 20L")!;
    expect(latex.precio_min).toBe(100000);
    expect(latex.precio_max).toBe(100000);
  });
});

describe("rubros de la hoja viva (mapeo etapa/nombre → botonera)", () => {
  const item = (nombre: string, etapa: string, tipo: "material" | "mano_de_obra" = "material") =>
    ({
      nombre,
      etapa,
      tipo,
      unidad: "u",
      formula: "1",
      cantidad_base: 1,
      desperdicio_pct: 0,
      cantidad: 1,
      precios: {},
      precio_min: null,
      precio_max: null,
      subtotal_min: 0,
      subtotal_max: 0,
      divergencia_pct: null,
      sin_precio: true,
    }) as const;

  it("mapea el desglose real del test del ojo (reforma-bano-completo v2)", () => {
    const casos: Array<[string, string, string]> = [
      ["Materiales plomería termofusión (PPR agua F/C + PVC desagües, 1 baño)", "Plomería nueva (termofusión) y obra húmeda", "plomeria"],
      ["Materiales albañilería húmeda (cemento, arena, hidrófugo, malla, ladrillos nicho, carpeta ducha)", "Plomería nueva (termofusión) y obra húmeda", "humedad"],
      ["Porcelanato piso beige claro mate 60×60", "Revestimientos", "revestimientos"],
      ["Pastina Klaukol Alta Performance porcelanato 5kg", "Revestimientos", "revestimientos"],
      ["Inodoro con mochila blanco línea moderna (Ferrum Bari c/mochila descarga dual)", "Artefactos, grifería y mampara", "sanitarios"],
      ["Kit grifería ducha negra: monocomando empotrado + lluvia brazo de pared + duchador", "Artefactos, grifería y mampara", "griferias"],
      ["Mampara de ducha corrediza vidrio templado, herrajes negros (frente s/parámetro)", "Artefactos, grifería y mampara", "sanitarios"],
      ["Mueble vanitory colgante laqueado ~1,10 m (a medida, color)", "Mueble y mesada", "mobiliario"],
      ["Espejo redondo marco negro Ø70-80", "Iluminación, eléctrica y accesorios", "mobiliario"],
      ["Kit LED: 3 spots embutidos + tira LED nicho + fuente", "Iluminación, eléctrica y accesorios", "electricidad"],
      ["Accesorios de baño negros (portarrollo, toallero, percha)", "Iluminación, eléctrica y accesorios", "mobiliario"],
      ["Látex antihongos Alba 4L", "Pintura (cielorraso + paredes no revestidas)", "obra"],
    ];
    for (const [nombre, etapa, esperado] of casos) {
      expect(rubroDeItem(item(nombre, etapa)), nombre).toBe(esperado);
    }
  });

  it("mano de obra va SIEMPRE a su pestaña, sin importar la etapa", () => {
    expect(rubroDeItem(item("Mano de obra reforma completa (cerrada)", "Mano de obra (cerrada con cuadrilla)", "mano_de_obra"))).toBe("mano_de_obra");
  });

  it("la llave de paso es plomería, no electricidad (trampa de keyword)", () => {
    expect(rubroDeItem(item("Llave de paso esférica 3/4", "Plomería"))).toBe("plomeria");
  });

  it("el rubro fijado a mano (ítem manual) manda sobre el mapeo", () => {
    expect(rubroDeItem({ ...item("Porcelanato símil madera", "Agregado en mesa"), rubro: "extras" })).toBe("extras");
  });

  it("lo que no matchea nada cae en obra (nunca desaparece de la botonera)", () => {
    expect(rubroDeItem(item("Cosa rara sin clasificar", "Etapa inventada"))).toBe("obra");
  });
});
