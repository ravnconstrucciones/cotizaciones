import { describe, expect, it } from "vitest";
import { formatObservedDate } from "./format-observed-date";

describe("formatObservedDate", () => {
  it("preserves a persisted calendar date without shifting it through UTC", () => {
    expect(formatObservedDate("2026-08-14")).toBe("14 AGO 2026");
  });

  it("keeps timestamps distinguishable from date-only source evidence", () => {
    expect(formatObservedDate("2026-08-15T11:30:00-03:00")).toContain("11:30");
  });

  it("does not invent a date for absent or invalid values", () => {
    expect(formatObservedDate(null)).toBe("SIN FECHA");
    expect(formatObservedDate("not-a-date")).toBe("not-a-date");
  });
});
