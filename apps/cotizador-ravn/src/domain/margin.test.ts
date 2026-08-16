import { describe, expect, it } from "vitest";
import {
  MARGEN_PISO_PCT,
  marginBand,
  marginPct,
  openingPrice,
  priceDialRange,
  priceForMargin,
  roundUpToSellable,
} from "./margin";

/** Costo del fixture de preview: banda real persistida por el motor. */
const COSTO_MIN = 2_059_750;
const COSTO_MAX = 2_193_400;

describe("marginPct", () => {
  it("calcula el margen SOBRE VENTA, igual que el cruce de obra de App RAVN", () => {
    // (600.000 − 216.000) / 600.000 = 64%
    expect(marginPct(600_000, 216_000)).toBe(64);
  });

  it("da negativo cuando el precio no cubre el costo", () => {
    expect(marginPct(100_000, 130_000)).toBe(-30);
  });

  it("no define margen con precio cero o negativo", () => {
    expect(marginPct(0, 100)).toBeNull();
    expect(marginPct(-10, 100)).toBeNull();
  });
});

describe("priceForMargin", () => {
  it("es la inversa de marginPct", () => {
    const price = priceForMargin(30, COSTO_MAX);
    expect(price).not.toBeNull();
    expect(marginPct(price!, COSTO_MAX)).toBe(30);
  });

  it("con margen 0 el precio es el costo", () => {
    expect(priceForMargin(0, COSTO_MAX)).toBe(COSTO_MAX);
  });

  it("no hay precio que deje 100% de margen", () => {
    expect(priceForMargin(100, COSTO_MAX)).toBeNull();
  });
});

describe("roundUpToSellable", () => {
  it("redondea SIEMPRE para arriba: hacia abajo se come el margen", () => {
    expect(roundUpToSellable(3_133_428)).toBe(3_150_000);
    expect(roundUpToSellable(184_100)).toBe(190_000);
    expect(roundUpToSellable(42_300)).toBe(43_000);
  });

  it("deja quieto lo que ya cae en el escalón", () => {
    expect(roundUpToSellable(3_150_000)).toBe(3_150_000);
  });
});

describe("marginBand", () => {
  it("devuelve las dos puntas sin elegir una, y la mala es la del costo techo", () => {
    const band = marginBand({ price: 3_250_000, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(band).not.toBeNull();
    expect(band!.pctAtCostMax).toBe(32.5);
    expect(band!.pctAtCostMin).toBe(36.6);
    expect(band!.pctAtCostMax).toBeLessThan(band!.pctAtCostMin);
    expect(band!.spreadPoints).toBe(4.1);
    expect(band!.profitAtCostMax).toBe(3_250_000 - COSTO_MAX);
    expect(band!.profitAtCostMin).toBe(3_250_000 - COSTO_MIN);
  });

  it("cierra el piso salga como salga cuando la punta mala llega al piso", () => {
    const band = marginBand({ price: 3_250_000, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(band!.meetsFloorAlways).toBe(true);
    expect(band!.verdict.kind).toBe("sobre_piso");
    expect(band!.verdict.severity).toBe("ok");
  });

  it("avisa que el piso es apuesta cuando sólo lo cierra con el costo al piso", () => {
    const price = priceForMargin(MARGEN_PISO_PCT, COSTO_MIN)! + 1_000;
    const band = marginBand({ price, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(band!.pctAtCostMin).toBeGreaterThanOrEqual(MARGEN_PISO_PCT);
    expect(band!.pctAtCostMax).toBeLessThan(MARGEN_PISO_PCT);
    expect(band!.verdict.kind).toBe("piso_en_riesgo");
    expect(band!.verdict.severity).toBe("warning");
    expect(band!.meetsFloorAlways).toBe(false);
  });

  it("bloquea cuando ninguna punta llega al piso", () => {
    const band = marginBand({ price: 2_600_000, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(band!.verdict.kind).toBe("bajo_piso");
    expect(band!.verdict.severity).toBe("blocking");
  });

  it("bloquea cuando el precio no cubre el techo del costo", () => {
    const band = marginBand({ price: COSTO_MAX - 1, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(band!.verdict.kind).toBe("bajo_costo");
    expect(band!.verdict.severity).toBe("blocking");
    expect(band!.profitAtCostMax).toBeLessThan(0);
  });

  it("distingue no cubrir el techo de no cubrir ni el piso", () => {
    const band = marginBand({ price: COSTO_MIN - 1, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(band!.verdict.headline).toContain("ni el piso");
  });

  it("sin costo persistido no hay margen que medir", () => {
    expect(marginBand({ price: 3_000_000, costMin: null, costMax: null })).toBeNull();
    expect(marginBand({ price: 0, costMin: COSTO_MIN, costMax: COSTO_MAX })).toBeNull();
  });

  it("los precios de piso que expone son los que cierran el piso contra cada punta", () => {
    const band = marginBand({ price: 3_250_000, costMin: COSTO_MIN, costMax: COSTO_MAX });
    expect(marginPct(band!.priceAtFloorOverCostMax, COSTO_MAX)).toBe(MARGEN_PISO_PCT);
    expect(marginPct(band!.priceAtFloorOverCostMin, COSTO_MIN)).toBe(MARGEN_PISO_PCT);
    expect(band!.priceAtFloorOverCostMin).toBeLessThan(band!.priceAtFloorOverCostMax);
  });
});

describe("openingPrice", () => {
  it("abre en el precio persistido si Eze ya lo dejó cargado", () => {
    const opening = openingPrice({ persistedPrice: 3_400_000, costMax: COSTO_MAX });
    expect(opening).toEqual({ price: 3_400_000, basis: "precio_persistido" });
  });

  it("sin precio persistido abre en el piso sobre el costo techo, redondeado", () => {
    const opening = openingPrice({ persistedPrice: null, costMax: COSTO_MAX });
    expect(opening!.basis).toBe("piso_sobre_costo_techo");
    expect(opening!.price).toBe(3_150_000);
    expect(marginPct(opening!.price, COSTO_MAX)!).toBeGreaterThanOrEqual(MARGEN_PISO_PCT);
  });

  it("sin costo ni precio no inventa un número de arranque", () => {
    expect(openingPrice({ persistedPrice: null, costMax: null })).toBeNull();
  });
});

describe("priceDialRange", () => {
  it("arranca en el costo techo (margen cero) y llega al techo del dial", () => {
    const range = priceDialRange(COSTO_MAX);
    expect(range.min).toBe(COSTO_MAX);
    expect(marginPct(range.max, COSTO_MAX)).toBe(60);
  });
});
