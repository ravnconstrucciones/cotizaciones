import { describe, expect, it } from "vitest";
import {
  mensajesDeTabla,
  mezclarHilos,
  type MensajeHilo,
  type MensajeNuevoRow,
} from "./conversacion";

function fila(sobre: Partial<MensajeNuevoRow>): MensajeNuevoRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    autor: "eze",
    texto: "hola",
    adjuntos: [],
    meta: {},
    creado_at: "2026-07-25T10:00:00Z",
    ...sobre,
  };
}

describe("mensajesDeTabla", () => {
  it("mapea autor, texto y etiqueta por meta.tipo", () => {
    const [m] = mensajesDeTabla([
      fila({ autor: "codex", texto: "micro $19-22k", meta: { tipo: "busqueda" } }),
    ]);
    expect(m.autor).toBe("codex");
    expect(m.texto).toBe("micro $19-22k");
    expect(m.etiqueta).toBe("busqueda");
    expect(m.id).toBe("m-11111111-1111-1111-1111-111111111111");
  });

  it("autor desconocido cae a sistema y sin meta.tipo etiqueta charla", () => {
    const [m] = mensajesDeTabla([fila({ autor: "marciano", meta: {} })]);
    expect(m.autor).toBe("sistema");
    expect(m.etiqueta).toBe("charla");
  });

  it("mensaje sin texto pero con adjuntos describe las fotos", () => {
    const [m] = mensajesDeTabla([
      fila({ texto: "", adjuntos: [{ archivo_id: "a" }, { archivo_id: "b" }] }),
    ]);
    expect(m.texto).toBe("2 fotos del proyecto");
  });

  it("descarta filas sin texto ni adjuntos", () => {
    expect(mensajesDeTabla([fila({ texto: "  ", adjuntos: [] })])).toHaveLength(0);
  });
});

describe("mezclarHilos", () => {
  it("mezcla y ordena por fecha", () => {
    const a: MensajeHilo[] = [
      { id: "1", fecha: "2026-07-25T12:00:00Z", autor: "eze", texto: "b", etiqueta: "x" },
    ];
    const b: MensajeHilo[] = [
      { id: "2", fecha: "2026-07-25T11:00:00Z", autor: "fable", texto: "a", etiqueta: "y" },
    ];
    expect(mezclarHilos(a, b).map((m) => m.id)).toEqual(["2", "1"]);
  });
});
