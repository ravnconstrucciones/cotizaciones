import { describe, expect, it } from "vitest";
import {
  armarHilo,
  estadoMac,
  hayPensando,
  parcialVigente,
  parsearParcial,
  validarMensajeTerminal,
} from "@/lib/terminal-hilo";
import type { TrabajoCola } from "@/types/centro-mando";

const HILO = "7f9c2c1a-0b1e-4a7e-9f3d-2b6f8a1c4d5e";

function trabajo(over: Partial<TrabajoCola>): TrabajoCola {
  return {
    id: "t1",
    creado_at: "2026-06-12T10:00:00Z",
    actualizado_at: "2026-06-12T10:01:00Z",
    tipo: "consulta",
    origen: "tablero",
    estado: "completado",
    prompt: "hola",
    contexto: { hilo_id: HILO, mensaje: "hola" },
    resultado: { texto: "qué hacés" },
    error: null,
    ...over,
  };
}

describe("armarHilo", () => {
  it("proyecta pregunta + respuesta en orden cronológico aunque lleguen desordenados", () => {
    const t1 = trabajo({
      id: "a",
      creado_at: "2026-06-12T10:00:00Z",
      actualizado_at: "2026-06-12T10:01:00Z",
      contexto: { hilo_id: HILO, mensaje: "primero" },
      resultado: { texto: "rta primero" },
    });
    const t2 = trabajo({
      id: "b",
      creado_at: "2026-06-12T10:05:00Z",
      actualizado_at: "2026-06-12T10:06:00Z",
      contexto: { hilo_id: HILO, mensaje: "segundo" },
      resultado: { texto: "rta segundo" },
    });
    const hilo = armarHilo([t2, t1]);
    expect(hilo.map((m) => `${m.rol}:${m.texto}`)).toEqual([
      "eze:primero",
      "mac:rta primero",
      "eze:segundo",
      "mac:rta segundo",
    ]);
    expect(hilo[0].ts).toBe("2026-06-12T10:00:00Z");
    expect(hilo[1].ts).toBe("2026-06-12T10:01:00Z");
  });

  it("un trabajo pendiente/procesando muestra solo la pregunta (sin respuesta)", () => {
    for (const estado of ["pendiente", "procesando"] as const) {
      const hilo = armarHilo([trabajo({ estado, resultado: null })]);
      expect(hilo).toHaveLength(1);
      expect(hilo[0].rol).toBe("eze");
    }
  });

  it("no inventa respuesta si resultado.texto falta o está vacío", () => {
    expect(armarHilo([trabajo({ resultado: null })])).toHaveLength(1);
    expect(armarHilo([trabajo({ resultado: { texto: "  " } })])).toHaveLength(1);
  });

  it("acepta resultado.resumen como fallback (rama genérica vieja del daemon)", () => {
    const hilo = armarHilo([trabajo({ resultado: { resumen: "viejo" } })]);
    expect(hilo[1]).toMatchObject({ rol: "mac", texto: "viejo" });
  });

  it("usa contexto.mensaje y cae al prompt si falta", () => {
    const conMensaje = armarHilo([
      trabajo({ contexto: { hilo_id: HILO, mensaje: "del contexto" } }),
    ]);
    expect(conMensaje[0].texto).toBe("del contexto");
    const sinMensaje = armarHilo([
      trabajo({ contexto: { hilo_id: HILO }, prompt: "del prompt" }),
    ]);
    expect(sinMensaje[0].texto).toBe("del prompt");
  });

  it("un trabajo en error aparece como mensaje de la Mac marcado esError", () => {
    const hilo = armarHilo([
      trabajo({ estado: "error", resultado: null, error: "claude exit 1" }),
    ]);
    expect(hilo).toHaveLength(2);
    expect(hilo[1]).toMatchObject({ rol: "mac", esError: true });
    expect(hilo[1].texto).toContain("claude exit 1");
  });

  it("ids de render únicos por trabajo: -q para pregunta, -r para respuesta", () => {
    const hilo = armarHilo([trabajo({ id: "abc" })]);
    expect(hilo.map((m) => m.id)).toEqual(["abc-q", "abc-r"]);
  });
});

describe("hayPensando", () => {
  it("true si algún trabajo del hilo está pendiente o procesando", () => {
    expect(hayPensando([trabajo({ estado: "pendiente" })])).toBe(true);
    expect(hayPensando([trabajo({ estado: "procesando" })])).toBe(true);
    expect(
      hayPensando([trabajo({}), trabajo({ id: "x", estado: "procesando" })])
    ).toBe(true);
  });

  it("false si todo está completado o en error", () => {
    expect(hayPensando([trabajo({}), trabajo({ id: "x", estado: "error" })])).toBe(
      false
    );
    expect(hayPensando([])).toBe(false);
  });
});

describe("validarMensajeTerminal", () => {
  it("acepta hilo_id uuid + mensaje y normaliza", () => {
    const v = validarMensajeTerminal({
      hilo_id: HILO.toUpperCase(),
      mensaje: "  hola Mac  ",
    });
    expect(v).toEqual({
      ok: true,
      data: { hilo_id: HILO, mensaje: "hola Mac" },
    });
  });

  it("rechaza body no-objeto, hilo_id no-uuid y mensaje vacío", () => {
    expect(validarMensajeTerminal(null).ok).toBe(false);
    expect(validarMensajeTerminal([]).ok).toBe(false);
    expect(
      validarMensajeTerminal({ hilo_id: "no-es-uuid", mensaje: "hola" }).ok
    ).toBe(false);
    expect(validarMensajeTerminal({ hilo_id: HILO, mensaje: "   " }).ok).toBe(
      false
    );
    expect(validarMensajeTerminal({ mensaje: "hola" }).ok).toBe(false);
  });

  it("rechaza mensajes de más de 4000 caracteres", () => {
    const v = validarMensajeTerminal({
      hilo_id: HILO,
      mensaje: "x".repeat(4001),
    });
    expect(v.ok).toBe(false);
  });
});

describe("parsearParcial", () => {
  it("acepta el payload del broadcast del daemon {texto, trabajo_id}", () => {
    expect(
      parsearParcial({ texto: "escribien", trabajo_id: "t1" })
    ).toEqual({ trabajoId: "t1", texto: "escribien" });
  });

  it("rechaza payloads malformados, vacíos o con tipos incorrectos", () => {
    expect(parsearParcial(null)).toBeNull();
    expect(parsearParcial("texto")).toBeNull();
    expect(parsearParcial({})).toBeNull();
    expect(parsearParcial({ texto: "   ", trabajo_id: "t1" })).toBeNull();
    expect(parsearParcial({ texto: "hola" })).toBeNull();
    expect(parsearParcial({ texto: 42, trabajo_id: "t1" })).toBeNull();
    expect(parsearParcial({ texto: "hola", trabajo_id: 7 })).toBeNull();
  });
});

describe("parcialVigente", () => {
  const parcial = { trabajoId: "t1", texto: "escribiendo..." };

  it("vigente mientras SU trabajo siga pendiente o procesando", () => {
    expect(parcialVigente(parcial, [trabajo({ estado: "pendiente" })])).toBe(
      true
    );
    expect(parcialVigente(parcial, [trabajo({ estado: "procesando" })])).toBe(
      true
    );
  });

  it("muere cuando la tabla fija la respuesta final o el error", () => {
    expect(parcialVigente(parcial, [trabajo({ estado: "completado" })])).toBe(
      false
    );
    expect(
      parcialVigente(parcial, [trabajo({ estado: "error", resultado: null })])
    ).toBe(false);
  });

  it("no se muestra sin parcial o si el trabajo no está en el hilo cargado", () => {
    expect(parcialVigente(null, [trabajo({})])).toBe(false);
    expect(
      parcialVigente({ trabajoId: "otro", texto: "x" }, [
        trabajo({ estado: "procesando" }),
      ])
    ).toBe(false);
    expect(parcialVigente(parcial, [])).toBe(false);
  });

  it("mira el estado del trabajo del parcial, no el de otros del hilo", () => {
    const trabajos = [
      trabajo({ id: "t1", estado: "procesando" }),
      trabajo({ id: "t2", estado: "completado" }),
    ];
    expect(parcialVigente(parcial, trabajos)).toBe(true);
    expect(parcialVigente({ trabajoId: "t2", texto: "x" }, trabajos)).toBe(
      false
    );
  });
});

describe("estadoMac", () => {
  const ahora = new Date("2026-06-12T12:00:00Z");

  it("en_linea con latido de hace menos de 3 minutos", () => {
    expect(estadoMac("2026-06-12T11:58:30Z", ahora)).toBe("en_linea");
    expect(estadoMac("2026-06-12T11:57:01Z", ahora)).toBe("en_linea");
  });

  it("dormida con latido viejo, nulo o malformado", () => {
    expect(estadoMac("2026-06-12T11:57:00Z", ahora)).toBe("dormida");
    expect(estadoMac("2026-06-12T08:00:00Z", ahora)).toBe("dormida");
    expect(estadoMac(null, ahora)).toBe("dormida");
    expect(estadoMac(undefined, ahora)).toBe("dormida");
    expect(estadoMac("no-es-fecha", ahora)).toBe("dormida");
  });
});
