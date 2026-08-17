import { describe, expect, it } from "vitest";
import {
  bypassAgentePermitido,
  bypassCotizadorReadPermitido,
  bypassCotizadorWritePermitido,
  credencialCotizadorReadValida,
  credencialCotizadorWriteValida,
} from "@/middleware";

/**
 * Fix ronda final finding 3: el bypass x-ravn-agente cubría /api/* entero
 * (dinero, retiros, papelera, aprobar/emitir de cotizaciones). Estos tests
 * fijan la allowlist — lo que el prompt-sistema de Fable necesita adentro,
 * todo lo demás (incluida la propia decisión/emisión de la cotización) afuera.
 * No hay convención previa de tests de middleware en el repo; se agrega esta
 * suite puntual sobre la función exportada (sin mockear NextRequest/Response).
 */
describe("bypassAgentePermitido", () => {
  it("permite GET a la galería y al detalle de una cotización", () => {
    expect(bypassAgentePermitido("/api/cotizaciones", "GET")).toBe(true);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123", "GET")).toBe(true);
  });

  it("NO permite PATCH/DELETE al detalle de la cotización (vincular obra, borrar)", () => {
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123", "PATCH")).toBe(false);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123", "DELETE")).toBe(false);
  });

  it("permite las sub-rutas de la mesa que Fable necesita", () => {
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/mensajes", "GET")).toBe(true);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/mensajes", "POST")).toBe(true);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/desglose", "PATCH")).toBe(true);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/documento-borrador", "PATCH")).toBe(
      true
    );
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/archivos", "GET")).toBe(true);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/archivos", "POST")).toBe(true);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/archivos/foto-1", "PATCH")).toBe(true);
  });

  it("NUNCA permite aprobar, rechazar, emitir ni estado — esas son botones de Eze", () => {
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/aprobar", "POST")).toBe(false);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/rechazar", "POST")).toBe(false);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/emitir", "POST")).toBe(false);
    expect(bypassAgentePermitido("/api/cotizaciones/abc-123/estado", "POST")).toBe(false);
  });

  it("NUNCA permite el resto de /api/* (dinero, retiros, papelera…)", () => {
    expect(bypassAgentePermitido("/api/dinero/espejo", "POST")).toBe(false);
    expect(bypassAgentePermitido("/api/retiros-socio", "GET")).toBe(false);
    expect(bypassAgentePermitido("/api/papelera", "POST")).toBe(false);
  });
});

describe("bypassCotizadorReadPermitido", () => {
  it("permite únicamente los tres GET que consume el Cotizador standalone", () => {
    expect(bypassCotizadorReadPermitido("/api/cotizaciones", "GET")).toBe(true);
    expect(bypassCotizadorReadPermitido("/api/cotizaciones/abc-123", "GET")).toBe(true);
    expect(
      bypassCotizadorReadPermitido("/api/cotizaciones/abc-123/mensajes", "GET")
    ).toBe(true);
  });

  it.each([
    ["/api/cotizaciones", "POST"],
    ["/api/cotizaciones/abc-123", "PATCH"],
    ["/api/cotizaciones/abc-123", "DELETE"],
    ["/api/cotizaciones/abc-123/mensajes", "POST"],
    ["/api/cotizaciones/abc-123/desglose", "PATCH"],
    ["/api/cotizaciones/abc-123/documento-borrador", "PATCH"],
    // GET /archivos entró al contrato read-only el 17/08 (puerta de entrada):
    // el visor firma las URLs que la ola de intake baja para leer.
    ["/api/cotizaciones/abc-123/archivos", "POST"],
    ["/api/cotizaciones/abc-123/aprobar", "POST"],
    ["/api/cotizaciones/abc-123/emitir", "POST"],
    ["/api/dinero/espejo", "GET"],
  ])("rechaza %s %s fuera del contrato read-only", (pathname, method) => {
    expect(bypassCotizadorReadPermitido(pathname, method)).toBe(false);
  });
});

describe("credencialCotizadorReadValida", () => {
  it("acepta una credencial de lectura configurada con un valor independiente", () => {
    expect(credencialCotizadorReadValida("read-only", "read-only", "legacy-write")).toBe(true);
  });

  it("falla cerrado si lectura y puente legacy reutilizan el mismo secreto", () => {
    expect(credencialCotizadorReadValida("shared", "shared", "shared")).toBe(false);
  });

  it("falla cerrado ante valores ausentes o una credencial presentada incorrecta", () => {
    expect(credencialCotizadorReadValida(null, "read-only", "legacy-write")).toBe(false);
    expect(credencialCotizadorReadValida("wrong", "read-only", "legacy-write")).toBe(false);
    expect(credencialCotizadorReadValida("read-only", undefined, "legacy-write")).toBe(false);
  });
});

/**
 * El pase del expediente (16/08): el Cotizador standalone deja el extracto y el
 * número en App RAVN. Su credencial de ESCRITURA existe para exactamente una
 * ruta — la frontera taller / oficina sostenida por permisos.
 */
describe("bypassCotizadorWritePermitido", () => {
  it("permite POST al pase", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/pase", "POST")).toBe(true);
  });

  it("NUNCA permite aprobar, emitir ni crear obra — eso es de la oficina", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/aprobar", "POST")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/emitir", "POST")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/estado", "POST")).toBe(false);
  });

  it("NO abre las otras escrituras de la mesa ni /api/* entero", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/desglose", "PATCH")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123", "PATCH")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/dinero/espejo", "POST")).toBe(false);
  });

  it("conversación operativa (17/08): la write credential deja mensajes de charla y nada más del hilo", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/mensajes", "POST")).toBe(true);
    // Leer el hilo sigue siendo de la credencial de lectura.
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/mensajes", "GET")).toBe(false);
  });

  it("no acepta otros métodos sobre la misma ruta", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/pase", "GET")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc-123/pase", "DELETE")).toBe(false);
  });
});

describe("credencialCotizadorWriteValida", () => {
  const ESCRITURA = "secreto-de-escritura";
  const LECTURA = "secreto-de-lectura";
  const LEGACY = "secreto-legacy";

  it("acepta la credencial correcta", () => {
    expect(credencialCotizadorWriteValida(ESCRITURA, ESCRITURA, LECTURA, LEGACY)).toBe(true);
  });

  it("rechaza la credencial de lectura sobre la puerta de escritura", () => {
    expect(credencialCotizadorWriteValida(LECTURA, ESCRITURA, LECTURA, LEGACY)).toBe(false);
  });

  it("falla cerrada si el secreto de escritura no está provisionado", () => {
    expect(credencialCotizadorWriteValida(ESCRITURA, undefined, LECTURA, LEGACY)).toBe(false);
    expect(credencialCotizadorWriteValida(null, ESCRITURA, LECTURA, LEGACY)).toBe(false);
  });

  it("falla cerrada si lo provisionaron igual que la lectura o que el legacy", () => {
    expect(credencialCotizadorWriteValida(LECTURA, LECTURA, LECTURA, LEGACY)).toBe(false);
    expect(credencialCotizadorWriteValida(LEGACY, LEGACY, LECTURA, LEGACY)).toBe(false);
  });
});

describe("puerta de entrada (17/08): allowlists nuevas", () => {
  it("la write credential puede crear el borrador de la puerta", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/intake", "POST")).toBe(true);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/intake", "GET")).toBe(false);
  });

  it("la write credential puede adjuntar por las tres puertas de subida", () => {
    for (const p of [
      "/api/cotizaciones/abc/archivos",
      "/api/cotizaciones/abc/archivos/firmar",
      "/api/cotizaciones/abc/archivos/confirmar",
    ]) {
      expect(bypassCotizadorWritePermitido(p, "POST")).toBe(true);
    }
  });

  it("la write credential NO lee archivos ni toca otras subrutas", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/archivos", "GET")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/archivos/xyz", "PATCH")).toBe(false);
  });

  it("la write credential puede confirmar el reconocimiento y nada más", () => {
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/confirmar-reconocimiento", "POST")).toBe(true);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/aprobar", "POST")).toBe(false);
    expect(bypassCotizadorWritePermitido("/api/cotizaciones/abc/emitir", "POST")).toBe(false);
  });

  it("la read credential lee los archivos (URLs firmadas para la ola) y no escribe", () => {
    expect(bypassCotizadorReadPermitido("/api/cotizaciones/abc/archivos", "GET")).toBe(true);
    expect(bypassCotizadorReadPermitido("/api/cotizaciones/abc/archivos", "POST")).toBe(false);
  });
});
