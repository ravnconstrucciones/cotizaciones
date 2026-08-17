import { describe, expect, it } from "vitest";
import { safeTextEqual } from "./constant-time";

describe("comparación de duración constante", () => {
  it("no devuelve true para largos ni contenidos distintos", () => {
    expect(safeTextEqual("same", "same")).toBe(true);
    expect(safeTextEqual("same", "same-longer")).toBe(false);
    expect(safeTextEqual("same", "samo")).toBe(false);
    expect(safeTextEqual("", "")).toBe(true);
    expect(safeTextEqual("", "x")).toBe(false);
  });

  it("compara por bytes UTF-8, no por unidades de código", () => {
    expect(safeTextEqual("contraseña", "contraseña")).toBe(true);
    expect(safeTextEqual("contraseña", "contrasena")).toBe(false);
  });
});
