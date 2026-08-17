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

  it("rechaza nombre que no sea string (coerción de tipos)", () => {
    const r = { ...base(), nombre: 123 };
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/nombre/);
  });

  it("rechaza titulo que no sea string (coerción de tipos)", () => {
    const r = { ...base(), titulo: 456 };
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/titulo/);
  });

  it("rechaza origen.fuente que no sea string", () => {
    const r = base();
    (r.etapas[0].items[0].origen as unknown as { fuente: unknown }).fuente = 123;
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/origen/);
  });

  it("rechaza origen.fuente vacío o solo espacios", () => {
    const r = base();
    r.etapas[0].items[0].origen.fuente = "   ";
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/origen/);
  });

  it("rechaza fuentes malformadas ([{}]): sin titulo, tipo ni fecha", () => {
    const r = { ...base(), fuentes: [{}] };
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      const msg = out.violaciones.join(" ");
      expect(msg).toMatch(/fuente 1/);
      expect(msg).toMatch(/titulo/);
      expect(msg).toMatch(/tipo/);
      expect(msg).toMatch(/fecha/);
    }
  });

  it("rechaza fuente con tipo fuera del enum permitido", () => {
    const r = { ...base(), fuentes: [{ titulo: "Algo", tipo: "wikipedia", fecha: "2026-07-09" }] };
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/tipo inválido/);
  });

  it("rechaza fuente con fecha en formato inválido", () => {
    const r = { ...base(), fuentes: [{ titulo: "Algo", tipo: "internet", fecha: "09/07/2026" }] };
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/fecha/);
  });

  it("rechaza unidad inválida en un ítem", () => {
    const r = base();
    (r.etapas[0].items[0] as Record<string, unknown>).unidad = "toneladas";
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/unidad inválida/);
  });

  it("rechaza tipo de ítem inválido", () => {
    const r = base();
    (r.etapas[0].items[0] as Record<string, unknown>).tipo = "servicio";
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/tipo inválido/);
  });

  it("rechaza confianza inválida (ej. 'capaz')", () => {
    const r = base();
    (r.etapas[0].items[0].origen as unknown as { confianza: unknown }).confianza = "capaz";
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/origen/);
  });

  it("rechaza parametros que no sea un array", () => {
    const r = { ...base(), parametros: "no-es-lista" };
    const out = validarRecetaCandidata(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/parametros/);
  });
});

describe("maquinaria y artefacto (puerta de entrada, 17/08)", () => {
  const conItem = (sobre: Record<string, unknown>) => {
    const r = base();
    r.etapas[0].items.push({
      nombre: "Ítem de prueba",
      tipo: "material",
      unidad: "u",
      formula: "1",
      origen: { fuente: "test", confianza: "estimado" },
      ...sobre,
    } as (typeof r.etapas)[0]["items"][0]);
    return r;
  };

  it("acepta maquinaria con modalidad alquiler", () => {
    const r = conItem({ nombre: "Andamio", tipo: "maquinaria", modalidad: "alquiler", unidad: "dia" });
    expect(validarRecetaCandidata(r).ok).toBe(true);
  });

  it("acepta maquinaria propia", () => {
    const r = conItem({ nombre: "Sierra de sable", tipo: "maquinaria", modalidad: "propia" });
    expect(validarRecetaCandidata(r).ok).toBe(true);
  });

  it("rebota maquinaria sin modalidad", () => {
    const out = validarRecetaCandidata(conItem({ nombre: "Andamio", tipo: "maquinaria" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.violaciones.join(" ")).toMatch(/modalidad/);
  });

  it("rebota modalidad en un ítem que no es maquinaria", () => {
    expect(validarRecetaCandidata(conItem({ nombre: "Látex", modalidad: "alquiler" })).ok).toBe(false);
  });

  it("acepta artefacto en material y lo rebota en MO", () => {
    expect(validarRecetaCandidata(conItem({ nombre: "Grifería", artefacto: true })).ok).toBe(true);
    expect(
      validarRecetaCandidata(conItem({ nombre: "Colocación", tipo: "mano_de_obra", artefacto: true })).ok
    ).toBe(false);
  });
});
