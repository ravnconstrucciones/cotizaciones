import { describe, expect, it } from "vitest";
import { PREVIEW_DATA, createPreviewData } from "./preview-data";

describe("local preview fixture", () => {
  it("is structurally and visibly synthetic without fake running work or logs", () => {
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
    expect(preview.snapshot.events.every((event) => event.type !== "message")).toBe(true);
  });
});
