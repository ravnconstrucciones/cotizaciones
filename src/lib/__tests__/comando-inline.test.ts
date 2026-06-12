import { describe, expect, it } from "vitest";
import { parseComandoInline } from "../comando-inline";

describe("parseComandoInline", () => {
  it("'anotá X' (con acento) resuelve inline como tarea", () => {
    expect(parseComandoInline("anotá llamar a Oribe")).toEqual({
      inline: true,
      accion: "tarea",
      texto: "llamar a Oribe",
    });
  });

  it("'anota X' (sin acento) también", () => {
    expect(parseComandoInline("anota comprar arena")).toEqual({
      inline: true,
      accion: "tarea",
      texto: "comprar arena",
    });
  });

  it("es insensible a mayúsculas y espacios alrededor", () => {
    expect(parseComandoInline("  Anotá pasar por el corralón  ")).toEqual({
      inline: true,
      accion: "tarea",
      texto: "pasar por el corralón",
    });
  });

  it("'anotá' pelado (sin texto) NO es inline: va a la cola", () => {
    expect(parseComandoInline("anotá")).toEqual({ inline: false });
    expect(parseComandoInline("anota   ")).toEqual({ inline: false });
  });

  it("cualquier otra orden NO es inline", () => {
    expect(parseComandoInline("cotizame baño completo en Pilar")).toEqual({
      inline: false,
    });
    expect(parseComandoInline("qué gasté hoy")).toEqual({ inline: false });
    expect(parseComandoInline("anotador de obra")).toEqual({ inline: false });
  });
});
