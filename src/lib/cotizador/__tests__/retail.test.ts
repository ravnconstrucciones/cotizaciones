import { describe, it, expect, afterEach, vi } from "vitest";
import { parsePrecioML, parsePrecioEasy, fetchPrecioRetail } from "../retail";

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

// Helper: producto VTEX con un precio y disponibilidad.
const prodEasy = (Price: unknown, IsAvailable: unknown = true) => ({
  items: [{ sellers: [{ commertialOffer: { Price, IsAvailable } }] }],
});

describe("parsePrecioEasy", () => {
  it("devuelve la mediana de los precios disponibles", () => {
    expect(parsePrecioEasy([prodEasy(8200), prodEasy(7600), prodEasy(9300)])).toBe(8200);
  });

  it("descarta productos sin stock", () => {
    expect(parsePrecioEasy([prodEasy(100, false), prodEasy(400)])).toBe(400);
  });

  it("descarta precios no positivos o no numéricos", () => {
    expect(parsePrecioEasy([prodEasy(0), prodEasy("x"), prodEasy(500)])).toBe(500);
  });

  it("aguanta productos con forma incompleta", () => {
    expect(parsePrecioEasy([{}, { items: [] }, { items: [{ sellers: [] }] }, prodEasy(300)])).toBe(300);
  });

  it("null ante respuesta vacía o con forma inválida", () => {
    expect(parsePrecioEasy([])).toBeNull();
    expect(parsePrecioEasy(null)).toBeNull();
    expect(parsePrecioEasy({ results: [] })).toBeNull();
  });
});

describe("fetchPrecioRetail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fetchDe = (porUrl: (url: string) => unknown) =>
    (async (url: unknown) => ({
      ok: true,
      status: 200,
      json: async () => porUrl(String(url)),
    })) as unknown as typeof fetch;

  it("sin token va directo a Easy y arma PrecioFechado con la mediana", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const urls: string[] = [];
    const f = fetchDe((url) => {
      urls.push(url);
      return [prodEasy(1000), prodEasy(2000), prodEasy(3000)];
    });
    const p = await fetchPrecioRetail("cemento loma negra", "2026-07-01", f);
    expect(p).toEqual({ valor: 2000, fuente: "Easy (ref. retail)", fecha: "2026-07-01" });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("easy.com.ar");
  });

  it("con token intenta ML primero y no cae a Easy si ML responde", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "tok");
    const urls: string[] = [];
    const f = fetchDe((url) => {
      urls.push(url);
      return { results: [{ price: 5000 }] };
    });
    const p = await fetchPrecioRetail("membrana 4mm", "2026-07-01", f);
    expect(p).toEqual({ valor: 5000, fuente: "MercadoLibre (ref. retail)", fecha: "2026-07-01" });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("api.mercadolibre.com");
  });

  it("con token pero ML sin resultados, cae a Easy", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "tok");
    const f = fetchDe((url) =>
      url.includes("mercadolibre") ? { results: [] } : [prodEasy(700)]
    );
    const p = await fetchPrecioRetail("pastina", "2026-07-01", f);
    expect(p).toEqual({ valor: 700, fuente: "Easy (ref. retail)", fecha: "2026-07-01" });
  });

  it("acepta el 206 de paginación VTEX", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const f = (async () => ({
      ok: false,
      status: 206,
      json: async () => [prodEasy(900)],
    })) as unknown as typeof fetch;
    const p = await fetchPrecioRetail("cal", "2026-07-01", f);
    expect(p?.valor).toBe(900);
  });

  it("null si la respuesta no es ok", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const f = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchPrecioRetail("x", "2026-07-01", f)).toBeNull();
  });

  it("null si fetch tira (red/timeout) — no rompe la cotización", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const f = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await fetchPrecioRetail("x", "2026-07-01", f)).toBeNull();
  });

  it("query vacío no llama a ninguna fuente", async () => {
    let llamado = false;
    const f = (async () => {
      llamado = true;
      return { ok: true, status: 200, json: async () => [] };
    }) as unknown as typeof fetch;
    expect(await fetchPrecioRetail("   ", "2026-07-01", f)).toBeNull();
    expect(llamado).toBe(false);
  });
});
