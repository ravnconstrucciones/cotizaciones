import { describe, expect, it } from "vitest";
import {
  bypassAgentePermitido,
  bypassCotizadorReadPermitido,
  credencialCotizadorReadValida,
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
    ["/api/cotizaciones/abc-123/archivos", "GET"],
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
