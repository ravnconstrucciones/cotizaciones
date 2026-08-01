import { describe, expect, it } from "vitest";
import {
  bloqueContextoPrompt,
  parseContexto,
  validarSeleccion,
  type ContextoExtraccion,
} from "../extract-contexto";

// Contexto de /gasto para la extracción por audio: la pantalla manda obras y
// rubros, el modelo elige de lista cerrada y acá se valida que ningún id
// inventado pase al cliente.

const CTX: ContextoExtraccion = {
  obras: [
    { id: "p-1", nombre: "Baño Pueyrredón" },
    { id: "p-2", nombre: "Húsares 2255" },
  ],
  rubros: [
    { id: "r-1", nombre: "Pintura" },
    { id: "r-2", nombre: "Plomería" },
  ],
};

describe("parseContexto", () => {
  it("acepta el JSON de la pantalla y limpia nombres", () => {
    const raw = JSON.stringify({
      obras: [{ id: " p-1 ", nombre: "  Baño Pueyrredón  " }],
      rubros: [{ id: "r-1", nombre: "Pintura" }],
    });
    expect(parseContexto(raw)).toEqual({
      obras: [{ id: "p-1", nombre: "Baño Pueyrredón" }],
      rubros: [{ id: "r-1", nombre: "Pintura" }],
    });
  });

  it("rechaza basura: no-string, JSON roto, listas vacías, items inválidos", () => {
    expect(parseContexto(undefined)).toBeNull();
    expect(parseContexto(123 as unknown)).toBeNull();
    expect(parseContexto("{no es json")).toBeNull();
    expect(parseContexto("null")).toBeNull();
    expect(parseContexto(JSON.stringify({ obras: [], rubros: [] }))).toBeNull();
    expect(
      parseContexto(
        JSON.stringify({ obras: [{ id: 7, nombre: "x" }, { id: "", nombre: "y" }], rubros: [] })
      )
    ).toBeNull();
  });

  it("capea a 60 items y 80 caracteres de nombre", () => {
    const obras = Array.from({ length: 100 }, (_, i) => ({
      id: `p-${i}`,
      nombre: "N".repeat(200),
    }));
    const ctx = parseContexto(JSON.stringify({ obras, rubros: [] }));
    expect(ctx?.obras).toHaveLength(60);
    expect(ctx?.obras[0].nombre).toHaveLength(80);
  });
});

describe("validarSeleccion", () => {
  it("acepta ids que están en la lista", () => {
    expect(
      validarSeleccion({ obra_id: "p-1", rubro_id: "r-2", tipo_gasto: "obra" }, CTX)
    ).toEqual({ obra_id: "p-1", rubro_id: "r-2", tipo_gasto: "obra" });
  });

  it("descarta ids inventados por el modelo", () => {
    expect(
      validarSeleccion({ obra_id: "p-999", rubro_id: "cualquiera", tipo_gasto: "gaseoso" }, CTX)
    ).toEqual({ obra_id: null, rubro_id: null, tipo_gasto: null });
  });

  it("si eligió obra válida pero no dijo tipo, deduce tipo_gasto=obra", () => {
    expect(validarSeleccion({ obra_id: "p-2" }, CTX)).toEqual({
      obra_id: "p-2",
      rubro_id: null,
      tipo_gasto: "obra",
    });
  });

  it("tipo_gasto personal/empresa pasan sin obra", () => {
    expect(validarSeleccion({ tipo_gasto: "personal" }, CTX).tipo_gasto).toBe("personal");
    expect(validarSeleccion({ tipo_gasto: "empresa" }, CTX).tipo_gasto).toBe("empresa");
  });
});

describe("bloqueContextoPrompt", () => {
  it("incluye las listas y las tres claves nuevas", () => {
    const b = bloqueContextoPrompt(CTX);
    expect(b).toContain('"obra_id"');
    expect(b).toContain('"rubro_id"');
    expect(b).toContain('"tipo_gasto"');
    expect(b).toContain("Baño Pueyrredón");
    expect(b).toContain("Plomería");
  });

  it("omite la clave de una lista vacía", () => {
    const b = bloqueContextoPrompt({ obras: CTX.obras, rubros: [] });
    expect(b).toContain('"obra_id"');
    expect(b).not.toContain('"rubro_id"');
  });
});
