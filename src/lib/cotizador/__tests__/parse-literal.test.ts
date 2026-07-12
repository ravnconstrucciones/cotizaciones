import { describe, expect, it } from "vitest";
import { parseLiteral } from "../parse-literal";

describe("parseLiteral", () => {
  it("convención argentina: coma decimal, punto de miles", () => {
    expect(parseLiteral("2,5")).toBe(2.5);
    expect(parseLiteral("1.234,56")).toBe(1234.56);
    expect(parseLiteral("2.500")).toBe(2500);
    expect(parseLiteral("1.234.567")).toBe(1234567);
    expect(parseLiteral("980")).toBe(980);
  });

  it("punto con 1-2 decimales al final y sin coma es decimal, no miles", () => {
    expect(parseLiteral("2.5")).toBe(2.5);
    expect(parseLiteral("2.50")).toBe(2.5);
    expect(parseLiteral("12.34")).toBe(12.34);
  });

  it("tres dígitos tras el punto siguen siendo miles", () => {
    expect(parseLiteral("2.500")).toBe(2500);
    expect(parseLiteral("12.345")).toBe(12345);
  });

  it("vacío, basura o no positivos → null", () => {
    expect(parseLiteral("")).toBeNull();
    expect(parseLiteral("   ")).toBeNull();
    expect(parseLiteral("abc")).toBeNull();
    expect(parseLiteral("0")).toBeNull();
    expect(parseLiteral("-3")).toBeNull();
  });
});
