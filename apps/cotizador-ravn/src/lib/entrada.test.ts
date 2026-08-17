import { describe, expect, it } from "vitest";
import { momentoDelExpediente, textoConAdjuntos, tituloProvisional } from "./entrada";

describe("tituloProvisional", () => {
  it("usa el primer renglón no vacío del texto", () => {
    expect(tituloProvisional("\n Pintura interior 4x3 \ndetalle…", [])).toBe(
      "Pintura interior 4x3"
    );
  });

  it("recorta a 60 caracteres con puntos suspensivos", () => {
    const largo = "a".repeat(80);
    expect(tituloProvisional(largo, [])).toHaveLength(61); // 60 + "…"
    expect(tituloProvisional(largo, []).endsWith("…")).toBe(true);
  });

  it("sin texto usa el nombre del primer archivo sin extensión", () => {
    expect(tituloProvisional("  ", ["OT-husares.pdf", "foto.jpg"])).toBe("OT-husares");
  });

  it("sin texto ni archivos cae al genérico", () => {
    expect(tituloProvisional("", [])).toBe("Cotización nueva");
  });
});

describe("textoConAdjuntos", () => {
  it("suma el pie de adjuntos al texto", () => {
    expect(textoConAdjuntos("Va el plano.", ["plano.pdf"])).toBe(
      "Va el plano.\n\nAdjunté: plano.pdf"
    );
  });

  it("con texto vacío el mensaje ES el pie", () => {
    expect(textoConAdjuntos("", ["a.pdf", "b.jpg"])).toBe("Adjunté: a.pdf, b.jpg");
  });

  it("sin archivos no toca el texto", () => {
    expect(textoConAdjuntos("hola", [])).toBe("hola");
  });
});

describe("momentoDelExpediente", () => {
  it("entrada manda sobre todo", () => {
    expect(
      momentoDelExpediente({ entrada: true, legacyState: "aprobada", preview: false })
    ).toBe("entrada");
  });

  it("borrador real es reconocimiento", () => {
    expect(
      momentoDelExpediente({ entrada: false, legacyState: "borrador", preview: false })
    ).toBe("reconocimiento");
  });

  it("borrador en preview es charla (demo local)", () => {
    expect(
      momentoDelExpediente({ entrada: false, legacyState: "borrador", preview: true })
    ).toBe("charla");
  });

  it("el resto es charla", () => {
    expect(
      momentoDelExpediente({ entrada: false, legacyState: "en_revision", preview: false })
    ).toBe("charla");
  });
});
