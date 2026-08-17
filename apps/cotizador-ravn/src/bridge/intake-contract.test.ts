import { describe, expect, it } from "vitest";
import { extraerJson, validarPropuesta, type PropuestaReconocimiento } from "./intake-contract";

export const propuestaOk: PropuestaReconocimiento = {
  titulo: "Vanos en Húsares",
  resumen: "Apertura de dos vanos con dintel",
  parametros: [{ nombre: "cantidad_vanos", etiqueta: "Vanos", valor: 2 }],
  rubros: [
    {
      nombre: "Demolición",
      dias_min: 1,
      dias_max: 2,
      cuadrilla: 2,
      items: [
        {
          nombre: "Demolición de vano",
          tipo: "mano_de_obra",
          unidad: "u",
          cantidad: 2,
          origen: { fuente: "lo dice la OT, p.1", confianza: "verificado" },
        },
        {
          nombre: "Sierra de sable",
          tipo: "maquinaria",
          modalidad: "propia",
          unidad: "u",
          cantidad: 1,
          origen: { fuente: "deducido del alcance", confianza: "estimado" },
        },
      ],
    },
  ],
  preguntas_abiertas: ["¿El muro es portante?"],
  fuentes: [{ titulo: "OT adjunta", tipo: "obra", fecha: "2026-08-17" }],
};

describe("validarPropuesta", () => {
  it("acepta la propuesta completa", () => {
    expect(validarPropuesta(propuestaOk)).toEqual({ ok: true, propuesta: propuestaOk });
  });

  it("rebota cantidad no positiva", () => {
    const p = structuredClone(propuestaOk);
    p.rubros[0].items[0].cantidad = 0;
    expect(validarPropuesta(p).ok).toBe(false);
  });

  it("rebota ítem sin origen", () => {
    const p = structuredClone(propuestaOk) as unknown as {
      rubros: { items: { origen?: unknown }[] }[];
    };
    delete p.rubros[0].items[0].origen;
    expect(validarPropuesta(p).ok).toBe(false);
  });

  it("rebota maquinaria sin modalidad", () => {
    const p = structuredClone(propuestaOk);
    delete p.rubros[0].items[1].modalidad;
    const res = validarPropuesta(p);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.motivo).toMatch(/modalidad/);
  });

  it("rebota precio_referencia sin fecha ISO", () => {
    const p = structuredClone(propuestaOk);
    p.rubros[0].items[0].precio_referencia = {
      valor: 100,
      fuente: "easy",
      fecha: "hoy",
      origen: "internet",
    };
    expect(validarPropuesta(p).ok).toBe(false);
  });

  it("rebota artefacto fuera de material", () => {
    const conArtefactoMalo = structuredClone(propuestaOk);
    conArtefactoMalo.rubros[0].items[0].artefacto = true; // es mano_de_obra
    expect(validarPropuesta(conArtefactoMalo).ok).toBe(false);
  });

  it("una fuente con tipo fuera del enum se normaliza a obra en vez de tirar la ola", () => {
    // Pasó en la primera ola real (17/08): "Texto de Eze" con tipo inventado.
    const conFuenteRara = structuredClone(propuestaOk) as unknown as {
      fuentes: { tipo: string }[];
    };
    conFuenteRara.fuentes[0].tipo = "memoria";
    const res = validarPropuesta(conFuenteRara);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.propuesta.fuentes[0].tipo).toBe("obra");
  });
});

describe("extraerJson", () => {
  it("saca el bloque cercado o el json pelado, y devuelve null si no hay", () => {
    expect(extraerJson('bla\n```json\n{"a":1}\n```\nchau')).toEqual({ a: 1 });
    expect(extraerJson('{"a":1}')).toEqual({ a: 1 });
    expect(extraerJson("no hay json acá")).toBeNull();
  });
});
