import { describe, expect, it } from "vitest";
import { formatObservedDate, formatObservedTime } from "./format-observed-date";

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

describe("formatObservedTime", () => {
  it("lee la hora en Buenos Aires y no en la zona de la máquina", () => {
    // 01:30 UTC del 17 es las 22:30 del 16 en Buenos Aires (UTC−3). El
    // esperado va a mano: derivarlo con la misma cuenta que la función haría
    // pasar el test incluso en UTC, que es como se coló este bug en labor.ts.
    expect(formatObservedTime("2026-08-17T01:30:00Z")).toBe("22:30");
  });

  it("respeta el desplazamiento que trae el propio timestamp", () => {
    expect(formatObservedTime("2026-08-16T09:05:00-03:00")).toBe("09:05");
  });

  it("no inventa una hora para un valor ilegible", () => {
    expect(formatObservedTime("not-a-date")).toBe("—");
  });
});
