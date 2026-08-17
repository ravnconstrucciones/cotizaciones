import { describe, expect, it } from "vitest";
import type { PostulanteMO } from "../taller/types";
import { hoyLocalIso, laborBoard, laborOverrideDelta, laborRubro } from "./labor";
import type { BatchItem, QuoteBatch } from "./quote-workspace";
import type { ItemOffer } from "./price-decision";

const HOY = "2026-08-16";

function offer(overrides: Partial<ItemOffer> & Pick<ItemOffer, "origin" | "value">): ItemOffer {
  return {
    source: `fuente ${overrides.origin}`,
    date: "2026-08-10",
    ageDays: 6,
    expired: false,
    deltaPct: null,
    cheapest: false,
    recommended: false,
    discarded: false,
    reference: false,
    note: null,
    ...overrides,
  };
}

function laborBatchItem(overrides: Partial<BatchItem> = {}): BatchItem {
  const cantidad = overrides.cantidad ?? 75;
  return {
    name: "MO colocación porcelanato",
    tipo: "mano_de_obra",
    unidad: "m2",
    cantidad,
    subtotalMin: 35_241 * cantidad,
    subtotalMax: 40_000 * cantidad,
    priced: true,
    origins: ["sismat", "internet"],
    corroborated: true,
    manual: false,
    offers: [
      offer({ origin: "sismat", value: 35_241 }),
      offer({ origin: "internet", value: 40_000 }),
    ],
    decision: {
      kind: "cerrado",
      severity: "ok",
      headline: "",
      criterion: "",
      spreadPct: 13.5,
    },
    ...overrides,
  };
}

const RANGO: QuoteBatch["priceRange"] = {
  min: 0,
  max: 0,
  currency: "ARS",
  basis: "persisted_item_subtotals",
};

function batch(items: BatchItem[], id = "batch:0:Colocación"): QuoteBatch {
  return {
    id,
    etapa: "Colocación de porcelanato",
    itemCount: items.length,
    itemNames: items.map((i) => i.name),
    items,
    responsibility: "",
    evidence: [],
    priceRange: RANGO,
    laborRange: RANGO,
    materialsRange: RANGO,
    sourceCoverage: { coveredItems: 0, totalItems: items.length, percent: 0, basis: "test" },
    confidence: { level: "media", reasons: [] } as unknown as QuoteBatch["confidence"],
    blockers: [],
    currentBlocker: null,
    jobState: "not_instrumented",
  };
}

function postulante(overrides: Partial<PostulanteMO> = {}): PostulanteMO {
  return {
    id: "p1",
    batchId: "batch:0:Colocación",
    itemName: "MO colocación porcelanato",
    proveedor: "Fran",
    precioUnit: 44_000,
    fecha: "2026-08-14",
    procedencia: "presupuesto por WhatsApp",
    elegido: false,
    ...overrides,
  };
}

describe("laborRubro", () => {
  it("ignora los rubros que no tienen ítem de mano de obra", () => {
    const soloMaterial = laborBatchItem({ tipo: "material", name: "Porcelanato" });
    expect(laborRubro(batch([soloMaterial]), [], HOY)).toBeNull();
  });

  it("arma la investigación desde los precios persistidos, en total del rubro", () => {
    const rubro = laborRubro(batch([laborBatchItem()]), [], HOY);
    expect(rubro?.contenders.map((c) => [c.label, c.total])).toEqual([
      ["SISMAT", 35_241 * 75],
      ["internet", 40_000 * 75],
    ]);
    expect(rubro?.costBasis).toBe("investigacion");
  });

  it("sin postulantes le pide a Eze que cargue uno", () => {
    const rubro = laborRubro(batch([laborBatchItem()]), [], HOY);
    expect(rubro?.readout.headline).toContain("Nadie pasó precio");
    expect(rubro?.readout.lines.join(" ")).toContain("13,5%");
  });

  it("con un postulante sin marcar, el costo sigue siendo la investigación", () => {
    const rubro = laborRubro(batch([laborBatchItem()]), [postulante()], HOY);
    expect(rubro?.costBasis).toBe("investigacion");
    expect(rubro?.chosen).toBeNull();
    expect(rubro?.readout.headline).toContain("Fran");
    expect(rubro?.readout.severity).toBe("warning");
  });

  it("el elegido pisa el costo y lo colapsa a un número", () => {
    const rubro = laborRubro(batch([laborBatchItem()]), [postulante({ elegido: true })], HOY);
    expect(rubro?.costBasis).toBe("postulante");
    expect(rubro?.costMin).toBe(44_000 * 75);
    expect(rubro?.costMax).toBe(44_000 * 75);
    expect(rubro?.engineMin).toBe(35_241 * 75);
  });

  it("recita el desvío del elegido contra cada investigación, en %", () => {
    const rubro = laborRubro(batch([laborBatchItem()]), [postulante({ elegido: true })], HOY);
    const texto = rubro?.readout.lines.join(" ") ?? "";
    // 35.241 contra 44.000 = 24,9% abajo · 40.000 contra 44.000 = 10% abajo
    expect(texto).toContain("SISMAT está 24,9% abajo de lo que te cobra Fran");
    expect(texto).toContain("internet está 10% abajo de lo que te cobra Fran");
  });

  it("marca warning cuando el elegido se va arriba del umbral del motor (25%)", () => {
    const rubro = laborRubro(
      batch([laborBatchItem()]),
      [postulante({ elegido: true, precioUnit: 50_000 })],
      HOY
    );
    // 50.000 contra SISMAT 35.241 = 41,9%
    expect(rubro?.readout.severity).toBe("warning");
    expect(rubro?.readout.headline).toContain("41,9% arriba de la referencia");
  });

  it("marca blocking cuando el elegido duplica la investigación (100%)", () => {
    const rubro = laborRubro(
      batch([laborBatchItem()]),
      [postulante({ elegido: true, precioUnit: 90_000 })],
      HOY
    );
    expect(rubro?.readout.severity).toBe("blocking");
    expect(rubro?.readout.headline).toContain("más del doble");
  });

  it("avisa cuando el presupuesto del elegido pasó los 30 días de la MO", () => {
    const rubro = laborRubro(
      batch([laborBatchItem()]),
      [postulante({ elegido: true, precioUnit: 36_000, fecha: "2026-06-01" })],
      HOY
    );
    expect(rubro?.readout.severity).toBe("warning");
    expect(rubro?.readout.lines.join(" ")).toContain("pedile que lo confirme");
  });

  it("compara los postulantes entre sí cuando hay más de uno", () => {
    const rubro = laborRubro(
      batch([laborBatchItem()]),
      [postulante(), postulante({ id: "p2", proveedor: "Pacheco", precioUnit: 38_000 })],
      HOY
    );
    const texto = rubro?.readout.lines.join(" ") ?? "";
    expect(texto).toContain("Pacheco es el más barato");
    expect(rubro?.readout.headline).toContain("2 presupuestos");
  });

  it("un rubro sin ningún precio no suma y lo dice", () => {
    const rubro = laborRubro(
      batch([laborBatchItem({ offers: [], priced: false, subtotalMin: 0, subtotalMax: 0 })]),
      [],
      HOY
    );
    expect(rubro?.costBasis).toBe("sin_precio");
    expect(rubro?.readout.severity).toBe("blocking");
  });

  /**
   * El caso que se leía mal en preview: la MO ya cerrada por Eze en la mesa de
   * App RAVN. El rubro tiene plata y no se puede leer como "sin precio".
   */
  it("un número propio ya cerrado se muestra como contendiente y sostiene el costo", () => {
    const item = laborBatchItem({
      offers: [offer({ origin: "eze", value: 12_000, source: "Eze · cuadrilla acordada" })],
      cantidad: 20,
      subtotalMin: 240_000,
      subtotalMax: 240_000,
    });
    const rubro = laborRubro(batch([item]), [], HOY);

    expect(rubro?.costBasis).toBe("propio");
    expect(rubro?.costMin).toBe(240_000);
    expect(rubro?.readout.severity).toBe("ok");
    expect(rubro?.readout.headline).toContain("Cerrado con tu número");
    expect(rubro?.contenders.map((c) => c.kind)).toEqual(["propio"]);
  });

  it("un postulante se mide también contra el número propio ya cerrado", () => {
    const item = laborBatchItem({
      offers: [
        offer({ origin: "eze", value: 12_000 }),
        offer({ origin: "sismat", value: 10_000 }),
      ],
      cantidad: 20,
      subtotalMin: 240_000,
      subtotalMax: 240_000,
    });
    const rubro = laborRubro(
      batch([item]),
      [postulante({ precioUnit: 15_000, elegido: true })],
      HOY
    );

    const texto = rubro?.readout.lines.join(" ") ?? "";
    expect(texto).toContain("tu número está 25% abajo de lo que te cobra Fran");
    // 10.000 contra 15.000 = 50% ⇒ arriba del umbral de 25 del motor
    expect(rubro?.readout.severity).toBe("warning");
  });

  it("el más barato del abanico lleva el desvío en 0 y los demás contra él", () => {
    const rubro = laborRubro(batch([laborBatchItem()]), [postulante()], HOY);
    const barato = rubro?.contenders.find((c) => c.cheapest);
    expect(barato?.label).toBe("SISMAT");
    expect(barato?.deltaPct).toBe(0);
    expect(rubro?.contenders.find((c) => c.label === "Fran")?.deltaPct).toBe(24.9);
  });

  it("no mezcla postulantes de otro rubro ni de otro ítem", () => {
    const rubro = laborRubro(
      batch([laborBatchItem()]),
      [
        postulante({ id: "otro-rubro", batchId: "batch:1:Zócalos" }),
        postulante({ id: "otro-item", itemName: "MO zócalo porcelanato" }),
      ],
      HOY
    );
    expect(rubro?.contenders.filter((c) => c.kind === "postulante")).toHaveLength(0);
  });
});

describe("hoyLocalIso", () => {
  it("usa el día de la máquina, no el de UTC — a la noche en Buenos Aires no salta al día siguiente", () => {
    // 16/08 21:00 en Buenos Aires (UTC−3) es 17/08 00:00 en UTC.
    const nocheEnBuenosAires = new Date("2026-08-17T00:00:00.000Z");
    const offsetMin = nocheEnBuenosAires.getTimezoneOffset();
    const esperado = new Date(nocheEnBuenosAires.getTime() - offsetMin * 60_000)
      .toISOString()
      .slice(0, 10);
    expect(hoyLocalIso(nocheEnBuenosAires)).toBe(esperado);
  });
});

describe("laborBoard", () => {
  const zocalos = batch(
    [
      laborBatchItem({
        name: "MO zócalo porcelanato",
        unidad: "ml",
        cantidad: 35,
        subtotalMin: 12_926 * 35,
        subtotalMax: 12_926 * 35,
        offers: [offer({ origin: "sismat", value: 12_926 })],
      }),
    ],
    "batch:1:Zócalos"
  );

  it("suma sólo los rubros con precio y cuenta los que tienen presupuesto", () => {
    const board = laborBoard(
      [batch([laborBatchItem()]), zocalos],
      [postulante({ elegido: true })],
      HOY
    );
    expect(board.rubros).toHaveLength(2);
    expect(board.withCandidates).toBe(1);
    expect(board.withChosen).toBe(1);
    expect(board.totalMin).toBe(44_000 * 75 + 12_926 * 35);
  });

  it("el delta del override es lo que el elegido le mueve al costo del motor", () => {
    const board = laborBoard([batch([laborBatchItem()]), zocalos], [postulante({ elegido: true })], HOY);
    expect(laborOverrideDelta(board)).toEqual({
      min: 44_000 * 75 - 35_241 * 75,
      max: 44_000 * 75 - 40_000 * 75,
    });
  });

  it("sin elegidos el costo no se mueve", () => {
    const board = laborBoard([batch([laborBatchItem()]), zocalos], [postulante()], HOY);
    expect(laborOverrideDelta(board)).toEqual({ min: 0, max: 0 });
  });
});
