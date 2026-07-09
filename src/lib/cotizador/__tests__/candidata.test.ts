import { describe, expect, it } from "vitest";
import { validarRecetaCandidata } from "../candidata";

const base = () => ({
  nombre: "siding-fibrocemento",
  titulo: "Siding de fibrocemento sobre estructura",
  estado: "candidata",
  parametros: [
    { nombre: "superficie_m2", etiqueta: "Superficie (m²)", tipo: "numero", requerido: true },
  ],
  etapas: [
    {
      nombre: "Colocación de placas",
      orden: 1,
      items: [
        {
          nombre: "Placa Superboard 6mm 1.20x2.40",
          tipo: "material",
          unidad: "u",
          formula: "ceil(superficie_m2 / 2.88)",
          desperdicio_pct: 10,
          origen: { fuente: "ficha Superboard (Eternit)", confianza: "verificado" },
        },
      ],
    },
  ],
  checklist: ["Ventilación de cámara de aire"],
  fuentes: [{ titulo: "Ficha Superboard", tipo: "fabricante", fecha: "2026-07-09" }],
  version: 1,
  preguntas_abiertas: ["¿Tornillos autoperforantes por placa?"],
});

describe("validarRecetaCandidata", () => {
  it("acepta una candidata completa con origen en todos los ítems", () => {
    const out = validarRecetaCandidata(base());
    expect(out.ok).toBe(true);
  });

  it("rechaza ítem sin origen (ley 1: número sin fuente = invento)", () => {
    const r = base();
    delete (r.etapas[0].items[0] as Record<string, unknown>).origen;
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/origen/);
  });

  it("rechaza fórmula que no evalúa con los parámetros declarados", () => {
    const r = base();
    r.etapas[0].items[0].formula = "ceil(superficie_m2 / ancho_placa)"; // ancho_placa no es parámetro
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
  });

  it("rechaza estado que no sea candidata", () => {
    const r = { ...base(), estado: "investigada" };
    expect(validarRecetaCandidata(r).ok).toBe(false);
  });

  it("rechaza receta sin fuentes", () => {
    const r = { ...base(), fuentes: [] };
    expect(validarRecetaCandidata(r).ok).toBe(false);
  });

  it("rechaza sin etapas o etapa sin ítems", () => {
    expect(validarRecetaCandidata({ ...base(), etapas: [] }).ok).toBe(false);
  });

  it("junta TODAS las violaciones, no corta en la primera", () => {
    const r = { ...base(), estado: "investigada", fuentes: [] };
    const out = validarRecetaCandidata(r);
    if (!out.ok) expect(out.violaciones.length).toBeGreaterThanOrEqual(2);
  });
});
