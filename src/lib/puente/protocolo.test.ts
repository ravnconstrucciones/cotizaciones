import { describe, expect, it } from "vitest";
import { parsearDirectiva } from "./protocolo";

describe("parsearDirectiva", () => {
  it("JSON limpio", () => {
    expect(parsearDirectiva('{"mensaje":"hola","busqueda":null}')).toEqual({
      mensaje: "hola",
      busqueda: null,
    });
  });
  it("JSON con fences y texto alrededor", () => {
    const s = 'Va la directiva:\n```json\n{"mensaje":"cargué albañilería","busqueda":"precio microcemento m2 aplicado CABA"}\n```';
    expect(parsearDirectiva(s)).toEqual({
      mensaje: "cargué albañilería",
      busqueda: "precio microcemento m2 aplicado CABA",
    });
  });
  it("busqueda vacía o ausente normaliza a null", () => {
    expect(parsearDirectiva('{"mensaje":"ok","busqueda":"  "}').busqueda).toBeNull();
    expect(parsearDirectiva('{"mensaje":"ok"}').busqueda).toBeNull();
  });
  it("salida no-JSON cae a mensaje plano (nunca se pierde la respuesta)", () => {
    expect(parsearDirectiva("respuesta suelta sin json")).toEqual({
      mensaje: "respuesta suelta sin json",
      busqueda: null,
    });
  });
  it("JSON roto cae a mensaje plano", () => {
    expect(parsearDirectiva('{"mensaje": "sin cerrar').mensaje).toContain("sin cerrar");
  });
});
