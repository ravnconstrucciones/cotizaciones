import { describe, expect, it } from "vitest";
import {
  MAX_PORTADA_BYTES,
  MAX_SUBIDA_BYTES,
  armarPathSubida,
  carpetaDeTipo,
  extensionLimpia,
  maxBytesDeTipo,
  pathValidoParaConfirmar,
} from "./subida-directa";

const COT = "702c051a-d0c6-4714-bd7a-e8dc5516e62d";

describe("carpetaDeTipo", () => {
  it("mapea los tipos conocidos", () => {
    expect(carpetaDeTipo("foto")).toBe("fotos");
    expect(carpetaDeTipo("diagnostico")).toBe("diagnosticos");
    expect(carpetaDeTipo("propuesta")).toBe("propuestas");
    expect(carpetaDeTipo("portada")).toBe("portadas-cotizacion");
  });

  it("tipo desconocido cae a propuestas (convención histórica de la ruta multipart)", () => {
    expect(carpetaDeTipo("otro")).toBe("propuestas");
    expect(carpetaDeTipo("")).toBe("propuestas");
  });
});

describe("maxBytesDeTipo", () => {
  it("portada 8 MB, resto 25 MB", () => {
    expect(maxBytesDeTipo("portada")).toBe(MAX_PORTADA_BYTES);
    expect(maxBytesDeTipo("foto")).toBe(MAX_SUBIDA_BYTES);
    expect(maxBytesDeTipo("propuesta")).toBe(MAX_SUBIDA_BYTES);
  });
});

describe("extensionLimpia", () => {
  it("extrae y sanea la extensión", () => {
    expect(extensionLimpia("foto.JPG", "jpg")).toBe("jpg");
    expect(extensionLimpia("informe.final.PDF", "pdf")).toBe("pdf");
  });

  it("cae al fallback sin extensión o con basura", () => {
    expect(extensionLimpia("sinextension", "pdf")).toBe("pdf");
    expect(extensionLimpia("archivo.", "jpg")).toBe("jpg");
    expect(extensionLimpia("raro.@#$", "png")).toBe("png");
    expect(extensionLimpia(".oculto", "pdf")).toBe("pdf");
  });

  it("recorta extensiones absurdamente largas a 10", () => {
    expect(extensionLimpia("x.extensionlarguisima", "pdf")).toBe("extensionl");
  });
});

describe("armarPathSubida", () => {
  it("arma {carpeta}/{id}/{ts}.{ext}", () => {
    expect(armarPathSubida({ cotizacionId: COT, tipo: "foto", nombre: "IMG_2043.HEIC", ts: 123 })).toBe(
      `fotos/${COT}/123.heic`
    );
    expect(armarPathSubida({ cotizacionId: COT, tipo: "portada", nombre: "render.png", ts: 9 })).toBe(
      `portadas-cotizacion/${COT}/9.png`
    );
  });

  it("fallback jpg para foto/portada y pdf para docs", () => {
    expect(armarPathSubida({ cotizacionId: COT, tipo: "foto", nombre: "sin", ts: 1 })).toBe(
      `fotos/${COT}/1.jpg`
    );
    expect(armarPathSubida({ cotizacionId: COT, tipo: "propuesta", nombre: "x.@!", ts: 1 })).toBe(
      `propuestas/${COT}/1.pdf`
    );
  });
});

describe("pathValidoParaConfirmar", () => {
  const bueno = `fotos/${COT}/1753534567890.jpg`;

  it("acepta el path que firmar emitió", () => {
    expect(pathValidoParaConfirmar(bueno, COT, "foto")).toBe(true);
    expect(pathValidoParaConfirmar(`portadas-cotizacion/${COT}/1.webp`, COT, "portada")).toBe(true);
  });

  it("rechaza carpeta que no corresponde al tipo", () => {
    expect(pathValidoParaConfirmar(bueno, COT, "propuesta")).toBe(false);
    expect(pathValidoParaConfirmar(`propuestas/${COT}/1.pdf`, COT, "foto")).toBe(false);
  });

  it("rechaza otra cotización, traversal y nombres arbitrarios", () => {
    expect(pathValidoParaConfirmar(`fotos/otra-cot/1.jpg`, COT, "foto")).toBe(false);
    expect(pathValidoParaConfirmar(`fotos/${COT}/../otra/1.jpg`, COT, "foto")).toBe(false);
    expect(pathValidoParaConfirmar(`fotos/${COT}/evil.php.jpg`, COT, "foto")).toBe(false);
    expect(pathValidoParaConfirmar(`fotos/${COT}/1.jpg/extra`, COT, "foto")).toBe(false);
    expect(pathValidoParaConfirmar(`fotos/${COT}/1.`, COT, "foto")).toBe(false);
    expect(pathValidoParaConfirmar("", COT, "foto")).toBe(false);
    expect(pathValidoParaConfirmar(bueno, "", "foto")).toBe(false);
  });
});
