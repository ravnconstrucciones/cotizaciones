import { describe, it, expect } from "vitest";
import { parsePrecioML, fetchPrecioML } from "../mercadolibre";

describe("parsePrecioML", () => {
  it("devuelve la mediana de los precios válidos (impar)", () => {
    expect(parsePrecioML({ results: [{ price: 100 }, { price: 300 }, { price: 200 }] })).toBe(200);
  });

  it("mediana par = promedio redondeado de los dos del medio", () => {
    expect(
      parsePrecioML({ results: [{ price: 100 }, { price: 200 }, { price: 300 }, { price: 500 }] })
    ).toBe(250);
  });

  it("descarta precios no positivos o no numéricos", () => {
    expect(
      parsePrecioML({ results: [{ price: 0 }, { price: -5 }, { price: "x" }, { price: 400 }] })
    ).toBe(400);
  });

  it("null ante respuesta vacía o con forma inválida", () => {
    expect(parsePrecioML({ results: [] })).toBeNull();
    expect(parsePrecioML(null)).toBeNull();
    expect(parsePrecioML({})).toBeNull();
  });
});

describe("fetchPrecioML", () => {
  const okFetch = (results: unknown) =>
    (async () => ({ ok: true, json: async () => ({ results }) })) as unknown as typeof fetch;

  it("arma PrecioFechado con la mediana cuando la API responde", async () => {
    const p = await fetchPrecioML(
      "membrana 4mm",
      "2026-06-14",
      okFetch([{ price: 1000 }, { price: 2000 }, { price: 3000 }])
    );
    expect(p).toEqual({ valor: 2000, fuente: "MercadoLibre (ref. retail)", fecha: "2026-06-14" });
  });

  it("null si la respuesta no es ok", async () => {
    const f = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchPrecioML("x", "2026-06-14", f)).toBeNull();
  });

  it("null si fetch tira (red/timeout) — no rompe la cotización", async () => {
    const f = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await fetchPrecioML("x", "2026-06-14", f)).toBeNull();
  });

  it("query vacío no llama a la API", async () => {
    let llamado = false;
    const f = (async () => {
      llamado = true;
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;
    expect(await fetchPrecioML("   ", "2026-06-14", f)).toBeNull();
    expect(llamado).toBe(false);
  });
});
