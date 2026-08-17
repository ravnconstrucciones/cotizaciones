import { describe, expect, it } from "vitest";
import {
  extraerRelanzamiento,
  extraerRuteo,
  MARCADOR_PRECIOS,
  MARCADOR_RELANZAR,
} from "./charla-ruteo";

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

describe("extraerRuteo (marcador de precios)", () => {
  it("el marcador de precios como última línea encadena la ola y no llega al hilo", () => {
    const r = extraerRuteo(
      `La arena y el adoquín no tienen precio en el expediente: los investigo y cargo el tablero.\n${MARCADOR_PRECIOS}`
    );
    expect(r.investigarPrecios).toBe(true);
    expect(r.relanzar).toBe(false);
    expect(r.texto).not.toContain(MARCADOR_PRECIOS);
  });

  it("tolera el marcador de precios decorado", () => {
    for (const cierre of [`[${MARCADOR_PRECIOS}]`, `**${MARCADOR_PRECIOS}**`, `${MARCADOR_PRECIOS}.`]) {
      const r = extraerRuteo(`Voy a buscar esos precios.\n${cierre}`);
      expect(r.investigarPrecios).toBe(true);
      expect(r.texto).toBe("Voy a buscar esos precios.");
    }
  });

  it("mencionado en el medio no encadena nada", () => {
    const r = extraerRuteo(
      `Si querés disparo ${MARCADOR_PRECIOS} más tarde.\nPor ahora el total es la investigación persistida.`
    );
    expect(r.investigarPrecios).toBe(false);
  });

  it("los dos marcadores son excluyentes: el último manda", () => {
    const r = extraerRuteo(`Tomo el dato.\n${MARCADOR_RELANZAR}`);
    expect(r.relanzar).toBe(true);
    expect(r.investigarPrecios).toBe(false);
  });
});
