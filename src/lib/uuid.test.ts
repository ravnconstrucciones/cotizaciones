import { describe, expect, it } from "vitest";
import { esUuid } from "./uuid";

describe("esUuid", () => {
  it("acepta un uuid v4 válido", () => {
    expect(esUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
  });

  it("acepta uuid en mayúsculas (case-insensitive)", () => {
    expect(esUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("tolera espacios al borde (trim)", () => {
    expect(esUuid("  3f2504e0-4f89-41d3-9a0c-0305e82c3301  ")).toBe(true);
  });

  it("rechaza strings que no son uuid", () => {
    expect(esUuid("no-soy-uuid")).toBe(false);
    expect(esUuid("3f2504e0-4f89-41d3-9a0c")).toBe(false);
    expect(esUuid("3f2504e04f8941d39a0c0305e82c3301")).toBe(false);
    expect(esUuid("")).toBe(false);
  });

  it("rechaza valores no-string sin tirar", () => {
    expect(esUuid(null)).toBe(false);
    expect(esUuid(undefined)).toBe(false);
    expect(esUuid(123)).toBe(false);
    expect(esUuid({})).toBe(false);
    expect(esUuid(["3f2504e0-4f89-41d3-9a0c-0305e82c3301"])).toBe(false);
  });
});
