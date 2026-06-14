import { describe, it, expect } from "vitest";
import { cotizar, FaltanParametrosError } from "../cotizar";
import type { ExtraDesglose, PrecioItem, Receta } from "../tipos";

const RECETA: Receta = {
  nombre: "pintura-interior",
  titulo: "Pintura interior completa",
  estado: "confiable",
  version: 1,
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
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

const EXTRAS: ExtraDesglose[] = [
  { nombre: "Flete corralón", monto_min: 30000, monto_max: 50000, fuente: "internet", fecha: "2026-06-11" },
];

const entrada = (hoy: string) => ({
  receta: RECETA,
  parametros: { superficie_m2: 80 },
  precios: PRECIOS,
  extras: EXTRAS,
  imprevistos_pct: 10,
  zona: "Nordelta",
  banda_m2: { min: 8000, max: 16000, fuente: "clickie.com.ar", fecha: "2026-06-10" },
  dudas: ["¿el techo también se pinta?"],
  hoy,
});

describe("cotizar (orquestador)", () => {
  const resultado = cotizar(entrada("2026-06-12"));

  it("arma el desglose completo con los totales del motor", () => {
    // latex: 3u × (90k–120k) = 270k–360k; MO: 80×5500 = 440k; flete 30k–50k
    // subtotal 740k–850k × 1.10 imprevistos × 1.15–1.20 zona = 936.100–1.122.000
    expect(resultado.total_min).toBe(936100);
    expect(resultado.total_max).toBe(1122000);
    expect(resultado.desglose.receta_nombre).toBe("pintura-interior");
    expect(resultado.desglose.receta_version).toBe(1);
    expect(resultado.desglose.items).toHaveLength(2);
    expect(resultado.desglose.tiempo).toEqual({ dias_min: 3, dias_max: 5, cuadrilla_max: 2 });
  });

  it("marca las divergencias >25% para la mesa (nivel + fuentes)", () => {
    expect(resultado.revision.divergencias).toEqual([
      {
        item: "Latex interior 20L",
        sismat: 90000,
        internet: 120000,
        divergencia_pct: 33.3,
        nivel: "marca",
        fuente_sismat: "SISMAT",
        fuente_internet: "easy.com.ar",
      },
    ]);
  });

  it("marca CRÍTICA cuando una fuente es ≥2x la otra (caso pileta)", () => {
    // SISMAT 62.043 vs internet 25.000 → 148% → crítica (ítem equivocado).
    const r = cotizar({
      ...entrada("2026-06-12"),
      precios: {
        "Latex interior 20L": {
          sismat: { valor: 62043, fuente: "Excavación sótano a máquina", fecha: "2026-06-08" },
          internet: { valor: 25000, fuente: "easy.com.ar", fecha: "2026-06-11" },
        },
        "Pintor por m2": { sismat: { valor: 5500, fuente: "SISMAT", fecha: "2026-06-08" } },
      },
    });
    const d = r.revision.divergencias.find((x) => x.item === "Latex interior 20L")!;
    expect(d.nivel).toBe("critica");
    expect(d.divergencia_pct).toBeGreaterThanOrEqual(100);
    expect(d.fuente_sismat).toBe("Excavación sótano a máquina");
  });

  it("ML desempata la divergencia: marca a quién le da la razón el mercado", () => {
    const r = cotizar({
      ...entrada("2026-06-12"),
      precios: {
        "Latex interior 20L": {
          sismat: { valor: 62043, fuente: "Excavación sótano a máquina", fecha: "2026-06-08" },
          internet: { valor: 25000, fuente: "easy.com.ar", fecha: "2026-06-11" },
          mercadolibre: { valor: 27000, fuente: "MercadoLibre (ref. retail)", fecha: "2026-06-12" },
        },
        "Pintor por m2": { sismat: { valor: 5500, fuente: "SISMAT", fecha: "2026-06-08" } },
      },
    });
    const d = r.revision.divergencias.find((x) => x.item === "Latex interior 20L")!;
    expect(d.mercadolibre).toBe(27000);
    expect(d.fuente_mercadolibre).toBe("MercadoLibre (ref. retail)");
    expect(d.ml_respalda).toBe("internet"); // 27k está mucho más cerca de 25k que de 62k
  });

  it("ML es referencia: NO entra en el total ni en los subtotales", () => {
    const base = cotizar(entrada("2026-06-12"));
    const conMl = cotizar({
      ...entrada("2026-06-12"),
      precios: {
        ...PRECIOS,
        "Latex interior 20L": {
          ...PRECIOS["Latex interior 20L"],
          // Un ML absurdo no debe mover el total (es solo referencia de mesa).
          mercadolibre: { valor: 999999, fuente: "MercadoLibre (ref. retail)", fecha: "2026-06-12" },
        },
      },
    });
    expect(conMl.total_min).toBe(base.total_min);
    expect(conMl.total_max).toBe(base.total_max);
  });

  it("corre checklist y sanidad y pasa las dudas", () => {
    const flete = resultado.revision.checklist.find((c) => c.item === "flete")!;
    expect(flete.estado).toBe("cubierto");
    const banda = resultado.revision.sanidad.find((s) => s.chequeo === "precio por m2")!;
    expect(banda.estado).toBe("ok"); // 936.100–1.122.000 / 80 = $11.701–$14.025/m²
    expect(resultado.revision.dudas).toEqual(["¿el techo también se pinta?"]);
  });

  it("sin precios vencidos al día de la cotización; vencen al pasar los días", () => {
    expect(resultado.revision.precios_vencidos).toHaveLength(0);
    const tarde = cotizar(entrada("2026-06-30"));
    // latex sismat (22d > 15) + latex internet (19d > 15) + flete (19d > 15); MO 22d < 30 no
    expect(tarde.revision.precios_vencidos).toHaveLength(3);
  });

  it("tira FaltanParametrosError con la lista de lo que falta", () => {
    expect(() => cotizar({ receta: RECETA, parametros: {}, precios: PRECIOS })).toThrow(
      FaltanParametrosError
    );
    try {
      cotizar({ receta: RECETA, parametros: {}, precios: PRECIOS });
    } catch (e) {
      expect((e as FaltanParametrosError).faltan).toEqual(["superficie_m2"]);
    }
  });
});
