import { describe, expect, it } from "vitest";
import { apiUrl } from "./api-url";

describe("apiUrl", () => {
  it("saca las credenciales de basic auth que trae el documento", () => {
    // Entrando por http://RAVN:APORTODO@localhost:3010/, `location.origin` ya
    // viene limpio: es el origen, no la URL del documento.
    expect(apiUrl("/api/quotes?quote=abc", "http://localhost:3010")).toBe(
      "http://localhost:3010/api/quotes?quote=abc"
    );
  });

  it("respeta el host y el puerto de donde está servido el visor", () => {
    expect(apiUrl("/api/pase", "https://ravn-cotizador.vercel.app")).toBe(
      "https://ravn-cotizador.vercel.app/api/pase"
    );
  });

  it("deja la ruta como está cuando no hay origen (servidor o test)", () => {
    expect(apiUrl("/api/taller?quote=abc", null)).toBe("/api/taller?quote=abc");
  });

  it("no rompe si el origen es basura: la ruta sigue saliendo", () => {
    expect(apiUrl("/api/taller", "no-es-un-origen")).toBe("/api/taller");
  });
});
