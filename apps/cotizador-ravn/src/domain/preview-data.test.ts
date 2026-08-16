import { describe, expect, it } from "vitest";
import { PREVIEW_DATA, createPreviewData } from "./preview-data";

describe("local preview fixture", () => {
  it("is structurally synthetic without fake runtime state", () => {
    const preview = createPreviewData();

    expect(PREVIEW_DATA.synthetic).toBe(true);
    expect(preview).toMatchObject({
      synthetic: true,
      source: "local_fixture",
      snapshot: { provenance: "synthetic_preview" },
    });
    expect(preview.disclaimer.toLowerCase()).toContain("sintétic");
    expect(preview.snapshot.budget.running).toBeNull();
    expect(preview.snapshot.budget.queued).toBeNull();
    expect(
      preview.snapshot.batches.every((batch) => batch.jobState === "not_instrumented")
    ).toBe(true);
  });

  it("projects four coherent rubros and isolates the legitimate missing price", () => {
    const preview = createPreviewData();
    const blockedBatches = preview.snapshot.batches.filter(
      (batch) => batch.currentBlocker != null
    );

    expect(preview.snapshot.batches.map((batch) => batch.etapa)).toEqual([
      "Demolición y preparación",
      "Impermeabilización",
      "Pisos y revestimientos",
      "Artefactos y griferías",
    ]);
    expect(preview.snapshot.core.sourceCoverage).toMatchObject({
      coveredItems: 7,
      totalItems: 8,
      percent: 88,
    });
    expect(preview.snapshot.core.costRange).toMatchObject({
      min: 2_059_750,
      max: 2_193_400,
    });
    expect(
      new Set(
        preview.snapshot.batches.flatMap((batch) =>
          batch.evidence.map((entry) => entry.origin)
        )
      )
    ).toEqual(new Set(["sismat", "internet", "retail", "eze"]));
    expect(blockedBatches).toHaveLength(1);
    expect(blockedBatches[0]).toMatchObject({
      etapa: "Artefactos y griferías",
      sourceCoverage: { coveredItems: 1, totalItems: 2, percent: 50 },
    });
    expect(blockedBatches[0].blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("sin precio persistido"),
        expect.stringContaining("checklist"),
        expect.stringContaining("sanidad"),
      ])
    );
    expect(preview.snapshot.decision.questions).toContain(
      "¿Qué marca, línea y terminación de grifería querés presupuestar?"
    );
  });

  it("keeps deterministic item arithmetic consistent with the persisted totals", () => {
    const preview = createPreviewData();
    const batchTotals = preview.snapshot.batches.reduce(
      (totals, batch) => ({
        min: totals.min + (batch.priceRange.min ?? 0),
        max: totals.max + (batch.priceRange.max ?? 0),
      }),
      { min: 0, max: 0 }
    );

    expect(batchTotals).toEqual({ min: 1_872_500, max: 1_994_000 });
    expect(Math.round(batchTotals.min * 1.1)).toBe(preview.snapshot.core.costRange.min);
    expect(Math.round(batchTotals.max * 1.1)).toBe(preview.snapshot.core.costRange.max);
  });

  it("contains a bounded synthetic thread only inside the synthetic preview projection", () => {
    const preview = createPreviewData();
    const messages = preview.snapshot.events.filter((event) => event.type === "message");

    expect(preview.snapshot.provenance).toBe("synthetic_preview");
    expect(messages).toHaveLength(6);
    expect(messages.map((event) => event.message.autor)).toEqual([
      "eze",
      "sistema",
      "codex",
      "fable",
      "fable",
      "codex",
    ]);
    expect(messages.map((event) => event.message.etiqueta)).toEqual([
      "Solicitud",
      "Pregunta abierta",
      "Pisos y revestimientos",
      "Pisos y revestimientos",
      "Impermeabilización",
      "Impermeabilización",
    ]);
    expect(messages.every((event) => event.message.id.startsWith("synthetic-message-"))).toBe(
      true
    );
    expect(messages.every((event) => event.persisted)).toBe(true);

    const repeatedPreviewCopy = [
      preview.snapshot.quote.title,
      ...messages.flatMap((event) => [event.message.texto, event.message.etiqueta]),
      ...preview.snapshot.batches.flatMap((batch) =>
        batch.evidence.map((entry) => entry.source)
      ),
      ...preview.snapshot.decision.questions,
    ].join(" ");
    expect(repeatedPreviewCopy).not.toMatch(/ficticio|preview|sintético/i);
  });
});
