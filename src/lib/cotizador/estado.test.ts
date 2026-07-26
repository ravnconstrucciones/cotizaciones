import { describe, expect, it } from "vitest";
import { aprobar, rechazar, TransicionInvalida } from "./estado";

describe("mesa en borrador (spec 2026-07-25)", () => {
  it("aprobar desde borrador funciona", () => {
    const r = aprobar("borrador", null, 1000);
    expect(r.estado).toBe("aprobada");
    expect(r.revision.aprobacion?.importe_final).toBe(1000);
  });
  it("rechazar desde borrador funciona", () => {
    expect(rechazar("borrador", "no va").estado).toBe("rechazada");
  });
  it("aprobar desde aprobada sigue prohibido", () => {
    expect(() => aprobar("aprobada", null)).toThrow(TransicionInvalida);
  });
});
