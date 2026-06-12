import { describe, it, expect } from "vitest";
import { aprobar, emitir, rechazar, TransicionInvalida } from "../estado";
import type { DatosDocumento, Revision } from "../tipos";

const REVISION: Revision = {
  checklist: [{ item: "flete", estado: "cubierto", detalle: "x" }],
  sanidad: [],
  precios_vencidos: [],
  divergencias: [],
  dudas: [],
};

const DOC: DatosDocumento = {
  cliente: "Lucila Lagomarsino",
  lugar: "Correa 3750",
  forma_pago: ["40% adelanto", "60% contra entrega"],
  plazo: ["5 días hábiles"],
  notas: ["VALIDEZ DE OFERTA: 10 DÍAS CORRIDOS"],
};

describe("aprobar", () => {
  it("solo desde en_revision; estampa fecha de aprobación", () => {
    const r = aprobar("en_revision", REVISION);
    expect(r.estado).toBe("aprobada");
    expect(r.revision.aprobacion!.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.revision.checklist).toEqual(REVISION.checklist); // no pisa la revisión
  });

  it("guarda el importe final si Eze lo fija", () => {
    const r = aprobar("en_revision", REVISION, 1500000);
    expect(r.revision.aprobacion!.importe_final).toBe(1500000);
  });

  it("rechaza la transición desde cualquier otro estado", () => {
    expect(() => aprobar("borrador", REVISION)).toThrow(TransicionInvalida);
    expect(() => aprobar("aprobada", REVISION)).toThrow(TransicionInvalida);
    expect(() => aprobar("rechazada", REVISION)).toThrow(TransicionInvalida);
  });

  it("tolera revision null (cotización insertada a mano)", () => {
    const r = aprobar("en_revision", null);
    expect(r.revision.aprobacion!.fecha).toBeTruthy();
  });
});

describe("rechazar", () => {
  it("solo desde en_revision y SIEMPRE con motivo (alimenta lecciones)", () => {
    expect(rechazar("en_revision", "MO de pintura muy cara para Pilar")).toEqual({
      estado: "rechazada",
      motivo_rechazo: "MO de pintura muy cara para Pilar",
    });
    expect(() => rechazar("en_revision", "   ")).toThrow(/motivo/);
    expect(() => rechazar("aprobada", "x")).toThrow(TransicionInvalida);
  });
});

describe("emitir", () => {
  it("solo desde aprobada; guarda los datos del documento en la revisión", () => {
    const r = emitir("aprobada", REVISION, DOC);
    expect(r.estado).toBe("documento_emitido");
    expect(r.revision.documento).toEqual(DOC);
  });

  it("exige cliente y lugar", () => {
    expect(() => emitir("aprobada", REVISION, { ...DOC, cliente: " " })).toThrow(/cliente/);
    expect(() => emitir("en_revision", REVISION, DOC)).toThrow(TransicionInvalida);
  });
});
