import { describe, expect, it } from "vitest";
import type { ItemDesglose } from "../../../../src/lib/cotizador/tipos";
import { itemPricing } from "./price-decision";

const HOY = "2026-08-16";

function item(overrides: Partial<ItemDesglose>): ItemDesglose {
  return {
    nombre: "Ítem",
    etapa: "Etapa",
    tipo: "material",
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
    ...overrides,
  };
}

const precio = (valor: number, fecha = "2026-08-15") => ({
  valor,
  fuente: `fuente ${valor}`,
  fecha,
});

describe("itemPricing", () => {
  it("marca sin precio cuando no hay ninguna fuente persistida", () => {
    const { offers, decision } = itemPricing(item({}), HOY);
    expect(offers).toHaveLength(0);
    expect(decision.kind).toBe("sin_precio");
    expect(decision.severity).toBe("blocking");
  });

  it("toma la más barata cuando las dos fuentes coinciden debajo del umbral", () => {
    const { offers, decision } = itemPricing(
      item({
        sin_precio: false,
        precios: { sismat: precio(28_000), internet: precio(31_500) },
        divergencia_pct: 12.5,
      }),
      HOY
    );

    expect(decision.kind).toBe("cerrado");
    expect(offers.find((offer) => offer.recommended)?.origin).toBe("sismat");
    expect(offers.find((offer) => offer.cheapest)?.origin).toBe("sismat");
    expect(offers.find((offer) => offer.origin === "internet")?.deltaPct).toBe(12.5);
  });

  it("desempata con retail cuando la divergencia supera el umbral del motor", () => {
    const { offers, decision } = itemPricing(
      item({
        sin_precio: false,
        precios: {
          sismat: precio(20_500),
          internet: precio(27_000),
          retail: precio(26_000),
        },
        divergencia_pct: 31.7,
      }),
      HOY
    );

    expect(decision.kind).toBe("divergencia");
    expect(offers.find((offer) => offer.recommended)?.origin).toBe("internet");
    expect(offers.find((offer) => offer.origin === "sismat")?.discarded).toBe(true);
    expect(offers.find((offer) => offer.origin === "retail")?.reference).toBe(true);
  });

  it("no recomienda ninguna sin retail que desempate", () => {
    const { offers, decision } = itemPricing(
      item({
        sin_precio: false,
        precios: { sismat: precio(20_500), internet: precio(27_000) },
        divergencia_pct: 31.7,
      }),
      HOY
    );

    expect(decision.kind).toBe("divergencia");
    expect(offers.some((offer) => offer.recommended)).toBe(false);
  });

  it("frena la divergencia crítica en vez de elegir", () => {
    const { offers, decision } = itemPricing(
      item({
        sin_precio: false,
        precios: { sismat: precio(62_000), internet: precio(25_000) },
        divergencia_pct: 148,
      }),
      HOY
    );

    expect(decision.kind).toBe("divergencia_critica");
    expect(decision.severity).toBe("blocking");
    expect(offers.some((offer) => offer.recommended)).toBe(false);
  });

  it("el número de Eze pisa el rango", () => {
    const { offers, decision } = itemPricing(
      item({
        sin_precio: false,
        precios: { sismat: precio(28_000), eze: precio(24_000) },
      }),
      HOY
    );

    expect(decision.kind).toBe("cerrado");
    expect(offers.find((offer) => offer.recommended)?.origin).toBe("eze");
  });

  it("avisa el vencimiento con el límite del motor según el tipo de ítem", () => {
    const { offers, decision } = itemPricing(
      item({
        sin_precio: false,
        tipo: "material",
        precios: { sismat: precio(28_000, "2026-07-01") },
      }),
      HOY
    );

    expect(decision.kind).toBe("precio_vencido");
    expect(offers[0].expired).toBe(true);
    expect(offers[0].ageDays).toBe(46);
  });

  it("marca la fuente única como sin contraste", () => {
    const { decision } = itemPricing(
      item({ sin_precio: false, precios: { internet: precio(18_000) } }),
      HOY
    );

    expect(decision.kind).toBe("sin_contraste");
    expect(decision.severity).toBe("warning");
  });
});
