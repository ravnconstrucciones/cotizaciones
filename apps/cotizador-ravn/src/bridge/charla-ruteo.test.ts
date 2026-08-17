import { describe, expect, it } from "vitest";
import { extraerRelanzamiento, MARCADOR_RELANZAR } from "./charla-ruteo";

describe("extraerRelanzamiento", () => {
  it("una respuesta sin marcador queda entera y no relanza", () => {
    const r = extraerRelanzamiento("Las cantidades salen del plano que subiste: 124,80 m².");
    expect(r.relanzar).toBe(false);
    expect(r.texto).toBe("Las cantidades salen del plano que subiste: 124,80 m².");
  });

  it("el marcador como última línea relanza y no llega al hilo", () => {
    const r = extraerRelanzamiento(
      `El patio de 40 m² cambia la propuesta: relanzo el reconocimiento.\n${MARCADOR_RELANZAR}\n`
    );
    expect(r.relanzar).toBe(true);
    expect(r.texto).toBe("El patio de 40 m² cambia la propuesta: relanzo el reconocimiento.");
    expect(r.texto).not.toContain(MARCADOR_RELANZAR);
  });

  it("tolera el marcador decorado con corchetes o negrita", () => {
    for (const cierre of [`[${MARCADOR_RELANZAR}]`, `**${MARCADOR_RELANZAR}**`, `  ${MARCADOR_RELANZAR}.`]) {
      const r = extraerRelanzamiento(`Tomo la medida nueva.\n${cierre}`);
      expect(r.relanzar).toBe(true);
      expect(r.texto).toBe("Tomo la medida nueva.");
    }
  });

  it("mencionado en el medio del texto NO rutea", () => {
    const r = extraerRelanzamiento(
      `Si mañana me pasás la medida, ahí sí corresponde ${MARCADOR_RELANZAR} y rearmo todo.\nPor ahora la propuesta queda como está.`
    );
    expect(r.relanzar).toBe(false);
    expect(r.texto).toContain("Por ahora la propuesta queda como está.");
  });

  it("solo el marcador (respuesta vacía) relanza con texto vacío", () => {
    const r = extraerRelanzamiento(`${MARCADOR_RELANZAR}\n\n`);
    expect(r.relanzar).toBe(true);
    expect(r.texto).toBe("");
  });

  it("vacío o nulo no rompe", () => {
    expect(extraerRelanzamiento("")).toEqual({ texto: "", relanzar: false });
    expect(extraerRelanzamiento("   \n \n")).toEqual({ texto: "", relanzar: false });
  });
});
