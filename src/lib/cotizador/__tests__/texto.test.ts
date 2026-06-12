import { describe, it, expect } from "vitest";
import { normalizar } from "../texto";

describe("normalizar", () => {
  it("baja a minúsculas y saca acentos", () => {
    expect(normalizar("Látex Interior ALBA")).toBe("latex interior alba");
    expect(normalizar("Albañilería")).toBe("albanileria");
  });
  it("colapsa espacios", () => {
    expect(normalizar("  flete   y  descarga ")).toBe("flete y descarga");
  });
});
