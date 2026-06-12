import { describe, expect, it } from "vitest";
import { tituloTrabajo, validarNuevoTrabajo } from "../trabajos-validate";

describe("validarNuevoTrabajo", () => {
  it("acepta un trabajo válido y normaliza contexto a {}", () => {
    const r = validarNuevoTrabajo({ tipo: "cotizar", prompt: "  baño completo en Pilar " });
    expect(r).toEqual({
      ok: true,
      data: { tipo: "cotizar", prompt: "baño completo en Pilar", contexto: {} },
    });
  });

  it("acepta contexto objeto y rechaza contexto array", () => {
    const ok = validarNuevoTrabajo({ tipo: "orden", prompt: "x", contexto: { obra: "Saavedra" } });
    expect(ok.ok && ok.data.contexto).toEqual({ obra: "Saavedra" });
    const arr = validarNuevoTrabajo({ tipo: "orden", prompt: "x", contexto: [1] });
    expect(arr.ok && arr.data.contexto).toEqual({});
  });

  it("rechaza tipo inválido", () => {
    const r = validarNuevoTrabajo({ tipo: "magia", prompt: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("tipo inválido");
  });

  it("rechaza prompt vacío o no-string y body inválido", () => {
    expect(validarNuevoTrabajo({ tipo: "orden", prompt: "   " }).ok).toBe(false);
    expect(validarNuevoTrabajo({ tipo: "orden" }).ok).toBe(false);
    expect(validarNuevoTrabajo(null).ok).toBe(false);
    expect(validarNuevoTrabajo("hola").ok).toBe(false);
  });

  it("rechaza prompt de más de 4000 caracteres", () => {
    expect(validarNuevoTrabajo({ tipo: "orden", prompt: "a".repeat(4001) }).ok).toBe(false);
  });
});

describe("tituloTrabajo", () => {
  it("arma '[tipo] prompt' y trunca a 80 con elipsis", () => {
    expect(tituloTrabajo("cotizar", "baño completo")).toBe("[cotizar] baño completo");
    const largo = tituloTrabajo("orden", "x".repeat(100));
    expect(largo).toBe(`[orden] ${"x".repeat(77)}…`);
  });
});
