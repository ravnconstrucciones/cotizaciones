import { describe, it, expect, afterEach, vi } from "vitest";
import {
  parsePrecioML,
  parsePrecioEasy,
  fetchPrecioRetail,
  elegirCadena,
} from "../retail";

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

describe("elegirCadena (ruteo rubro → cadena)", () => {
  it("pintura va a Prestigio", () => {
    expect(elegirCadena("látex interior 20 litros")).toBe("prestigio");
    expect(elegirCadena("Esmalte sintético blanco")).toBe("prestigio");
    expect(elegirCadena("fijador al agua")).toBe("prestigio");
  });

  it("cerámico y baño van a Blaisten", () => {
    expect(elegirCadena("porcelanato símil madera 60x60")).toBe("blaisten");
    expect(elegirCadena("grifería monocomando cocina")).toBe("blaisten");
    expect(elegirCadena("inodoro corto")).toBe("blaisten");
  });

  it("obra gris, electricidad y plomería caen a Easy (default)", () => {
    expect(elegirCadena("cemento loma negra 50kg")).toBe("easy");
    expect(elegirCadena("cable unipolar 2.5")).toBe("easy");
    expect(elegirCadena("caño pvc 110")).toBe("easy");
    expect(elegirCadena("membrana líquida 20kg")).toBe("easy");
  });

  it("normaliza acentos y mayúsculas para matchear", () => {
    expect(elegirCadena("CERÁMICA esmaltada")).toBe("blaisten");
    expect(elegirCadena("PINTURA látex")).toBe("prestigio");
  });

  it("pintura gana a cerámico cuando hay ambas palabras (comprás la pintura)", () => {
    // "esmalte para azulejos" = compra de pintura, no de azulejo.
    expect(elegirCadena("esmalte para azulejos")).toBe("prestigio");
  });

  it("query sin rubro reconocible → Easy", () => {
    expect(elegirCadena("tornillos autoperforantes")).toBe("easy");
  });

  // Regresión: colisiones de substring que el match por \b tiene que evitar.
  it("NO confunde 'placa' con 'laca' — Durlock va a Easy, no a la pinturería", () => {
    expect(elegirCadena("placa de yeso 12.5mm")).toBe("easy");
    expect(elegirCadena("placa cementicia 8mm")).toBe("easy");
    expect(elegirCadena("placa OSB 18mm")).toBe("easy");
  });

  it("'caño sanitario' (desagüe PVC) va a Easy, no a Blaisten", () => {
    expect(elegirCadena("caño sanitario 110mm")).toBe("easy");
    expect(elegirCadena("codo sanitario 45")).toBe("easy");
  });

  it("'césped sintético' NO cae en la pinturería (esmalte sintético sí)", () => {
    expect(elegirCadena("césped sintético 20mm")).toBe("easy");
    expect(elegirCadena("esmalte sintético blanco")).toBe("prestigio");
  });

  it("lavatorio y ducha van a Blaisten", () => {
    expect(elegirCadena("lavatorio con columna")).toBe("blaisten");
    expect(elegirCadena("columna de ducha")).toBe("blaisten");
  });
});

describe("fetchPrecioRetail — ruteo a la cadena del rubro", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fetchDe = (porUrl: (url: string) => unknown) =>
    (async (url: unknown) => ({
      ok: true,
      status: 200,
      json: async () => porUrl(String(url)),
    })) as unknown as typeof fetch;

  const prod = (Price: number) => ({
    items: [{ sellers: [{ commertialOffer: { Price, IsAvailable: true } }] }],
  });

  it("pintura pega a Prestigio y marca la fuente", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const urls: string[] = [];
    const f = fetchDe((url) => {
      urls.push(url);
      return [prod(30000), prod(31459), prod(33000)];
    });
    const p = await fetchPrecioRetail("látex interior 20L", "2026-07-09", f);
    expect(p).toEqual({
      valor: 31459,
      fuente: "Prestigio (ref. retail)",
      fecha: "2026-07-09",
    });
    expect(urls[0]).toContain("prestigio.com.ar");
  });

  it("cerámico/baño pega a Blaisten", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const urls: string[] = [];
    const f = fetchDe((url) => {
      urls.push(url);
      return [prod(155890)];
    });
    const p = await fetchPrecioRetail("grifería monocomando", "2026-07-09", f);
    expect(p?.fuente).toBe("Blaisten (ref. retail)");
    expect(urls[0]).toContain("blaisten.com.ar");
  });

  it("electricidad cae a Easy", async () => {
    vi.stubEnv("ML_ACCESS_TOKEN", "");
    const urls: string[] = [];
    const f = fetchDe((url) => {
      urls.push(url);
      return [prod(94995)];
    });
    const p = await fetchPrecioRetail("cable unipolar 2.5mm", "2026-07-09", f);
    expect(p?.fuente).toBe("Easy (ref. retail)");
    expect(urls[0]).toContain("easy.com.ar");
  });
});
