import { describe, it, expect } from "vitest";
import { zonaASlug } from "@/lib/inmobiliario/fuentes/zona-slug";
describe("zonaASlug", () => {
  it("normaliza acentos y espacios", () => {
    expect(zonaASlug("Vicente López")).toBe("vicente-lopez");
    expect(zonaASlug("Núñez")).toBe("nunez");
    expect(zonaASlug("Palermo")).toBe("palermo");
    expect(zonaASlug("Puerto Madero")).toBe("puerto-madero");
  });
});
