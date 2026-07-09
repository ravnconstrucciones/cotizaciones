import { describe, it, expect } from "vitest";
import {
  parsePrecioVtex,
  fetchPrecioRetail,
  fetchPreciosComparados,
  elegirCadena,
  cadenasComparacion,
} from "../retail";

// Helper: producto VTEX con un precio y disponibilidad.
const prodVtex = (Price: unknown, IsAvailable: unknown = true) => ({
  items: [{ sellers: [{ commertialOffer: { Price, IsAvailable } }] }],
});

describe("parsePrecioVtex", () => {
  it("devuelve la mediana de los precios disponibles", () => {
    expect(parsePrecioVtex([prodVtex(8200), prodVtex(7600), prodVtex(9300)])).toBe(8200);
  });

  it("mediana par = promedio redondeado de los dos del medio", () => {
    expect(parsePrecioVtex([prodVtex(100), prodVtex(200), prodVtex(300), prodVtex(500)])).toBe(250);
  });

  it("descarta productos sin stock", () => {
    expect(parsePrecioVtex([prodVtex(100, false), prodVtex(400)])).toBe(400);
  });

  it("descarta precios no positivos o no numéricos", () => {
    expect(parsePrecioVtex([prodVtex(0), prodVtex("x"), prodVtex(500)])).toBe(500);
  });

  it("aguanta productos con forma incompleta", () => {
    expect(
      parsePrecioVtex([{}, { items: [] }, { items: [{ sellers: [] }] }, prodVtex(300)])
    ).toBe(300);
  });

  it("null ante respuesta vacía o con forma inválida", () => {
    expect(parsePrecioVtex([])).toBeNull();
    expect(parsePrecioVtex(null)).toBeNull();
    expect(parsePrecioVtex({ results: [] })).toBeNull();
  });
});

const fetchDe = (porUrl: (url: string) => unknown) =>
  (async (url: unknown) => ({
    ok: true,
    status: 200,
    json: async () => porUrl(String(url)),
  })) as unknown as typeof fetch;

describe("fetchPrecioRetail", () => {
  it("arma PrecioFechado con la mediana de la cadena del rubro", async () => {
    const urls: string[] = [];
    const f = fetchDe((url) => {
      urls.push(url);
      return [prodVtex(1000), prodVtex(2000), prodVtex(3000)];
    });
    const p = await fetchPrecioRetail("cemento loma negra", "2026-07-01", f);
    expect(p).toEqual({ valor: 2000, fuente: "Easy (ref. retail)", fecha: "2026-07-01" });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("easy.com.ar");
  });

  it("acepta el 206 de paginación VTEX", async () => {
    const f = (async () => ({
      ok: false,
      status: 206,
      json: async () => [prodVtex(900)],
    })) as unknown as typeof fetch;
    const p = await fetchPrecioRetail("cal", "2026-07-01", f);
    expect(p?.valor).toBe(900);
  });

  it("null si la respuesta no es ok", async () => {
    const f = (async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchPrecioRetail("x", "2026-07-01", f)).toBeNull();
  });

  it("null si fetch tira (red/timeout) — no rompe la cotización", async () => {
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
  const prod = (Price: number) => ({
    items: [{ sellers: [{ commertialOffer: { Price, IsAvailable: true } }] }],
  });

  it("pintura pega a Prestigio y marca la fuente", async () => {
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

describe("cadenasComparacion", () => {
  it("pintura compara Prestigio vs Colorshop", () => {
    expect(cadenasComparacion("látex interior 20L")).toEqual(["prestigio", "colorshop"]);
  });

  it("el resto usa solo su cadena principal", () => {
    expect(cadenasComparacion("cemento loma negra")).toEqual(["easy"]);
    expect(cadenasComparacion("porcelanato 60x60")).toEqual(["blaisten"]);
  });
});

describe("fetchPreciosComparados", () => {
  it("trae precio + traza por cada cadena del rubro (pintura: Prestigio y Colorshop)", async () => {
    const porHost = (url: string) => {
      if (url.includes("prestigio.com.ar")) return [prodVtex(30000), prodVtex(32000)];
      if (url.includes("colorshop.com.ar")) return [prodVtex(28000)];
      return [];
    };
    const r = await fetchPreciosComparados("esmalte sintético blanco", "2026-07-09", fetchDe(porHost));
    expect(r).toEqual([
      {
        cadena: "prestigio",
        nombre: "Prestigio",
        fuente: "Prestigio (ref. retail)",
        precio: { valor: 31000, fuente: "Prestigio (ref. retail)", fecha: "2026-07-09" },
      },
      {
        cadena: "colorshop",
        nombre: "Colorshop",
        fuente: "Colorshop (ref. retail)",
        precio: { valor: 28000, fuente: "Colorshop (ref. retail)", fecha: "2026-07-09" },
      },
    ]);
  });

  it("la cadena sin resultado queda con precio null (la otra igual devuelve)", async () => {
    const porHost = (url: string) =>
      url.includes("colorshop.com.ar") ? [] : [prodVtex(31000)];
    const r = await fetchPreciosComparados("látex 20L", "2026-07-09", fetchDe(porHost));
    expect(r[0].precio?.valor).toBe(31000);
    expect(r[1].precio).toBeNull();
  });

  it("query vacío devuelve lista vacía", async () => {
    expect(await fetchPreciosComparados("  ", "2026-07-09")).toEqual([]);
  });
});
