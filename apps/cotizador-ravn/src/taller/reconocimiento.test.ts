import { describe, expect, it } from "vitest";
import { validarRecetaCandidata } from "../../../../src/lib/cotizador/candidata";
import { propuestaOk } from "../bridge/intake-contract.test";
import { recetaDesdePropuesta } from "./reconocimiento";

const ID = "3718c02c-4c36-452c-bae9-48b972935289";

describe("recetaDesdePropuesta", () => {
  it("traduce rubros a etapas con cantidades literales como fórmula", () => {
    const { receta } = recetaDesdePropuesta(propuestaOk, ID, null);
    expect(receta.estado).toBe("candidata");
    expect(receta.nombre).toBe(`puerta-vanos-en-husares-${ID.slice(0, 8)}`);
    expect(receta.etapas[0].nombre).toBe("Demolición");
    expect(receta.etapas[0].orden).toBe(1);
    expect(receta.etapas[0].items[0].formula).toBe("2");
    expect(receta.etapas[0].items[1].tipo).toBe("maquinaria");
    expect(receta.etapas[0].items[1].modalidad).toBe("propia");
    expect(receta.preguntas_abiertas).toEqual(["¿El muro es portante?"]);
  });

  it("una unidad que el motor no conoce cae a 'u' y deja nota de traza", () => {
    const p = structuredClone(propuestaOk);
    p.rubros[0].items[0].unidad = "jornada";
    const { receta } = recetaDesdePropuesta(p, ID, null);
    expect(receta.etapas[0].items[0].unidad).toBe("u");
    expect(receta.etapas[0].items[0].notas).toMatch(/jornada/);
  });

  it("junta los precios de referencia y los parámetros numéricos", () => {
    const p = structuredClone(propuestaOk);
    p.rubros[0].items[0].precio_referencia = {
      valor: 45000,
      fuente: "homesolution.net",
      fecha: "2026-08-17",
      origen: "internet",
    };
    const payload = recetaDesdePropuesta(p, ID, "Nordelta");
    expect(payload.precios_referencia).toEqual([
      {
        nombre: "Demolición de vano",
        valor: 45000,
        fuente: "homesolution.net",
        fecha: "2026-08-17",
        origen: "internet",
      },
    ]);
    expect(payload.parametros).toEqual({ cantidad_vanos: 2 });
    expect(payload.zona).toBe("Nordelta");
  });

  it("lo que sale de la traducción pasa validarRecetaCandidata", () => {
    const { receta } = recetaDesdePropuesta(propuestaOk, ID, null);
    const res = validarRecetaCandidata(receta);
    expect(res).toEqual({ ok: true, receta });
  });
});
