import { describe, expect, it } from "vitest";
import {
  escalaExport,
  normalizarRect,
  pathCropItem,
  slugItem,
} from "../crops";

describe("slugItem", () => {
  it("baja a minúsculas, saca acentos y símbolos", () => {
    expect(slugItem("Mampara de ducha corrediza, herrajes negros")).toBe(
      "mampara-de-ducha-corrediza-herrajes-negros"
    );
    expect(slugItem("Porcelanato 60×60 (beige claro)")).toBe("porcelanato-60-60-beige-claro");
    expect(slugItem("Grifería FV Epuyén")).toBe("griferia-fv-epuyen");
  });

  it("nunca devuelve vacío ni termina en guion tras el corte a 60", () => {
    expect(slugItem("¡¡¡")).toBe("item");
    const largo = slugItem("a".repeat(59) + " b c d e f");
    expect(largo.length).toBeLessThanOrEqual(60);
    expect(largo.endsWith("-")).toBe(false);
  });
});

describe("pathCropItem", () => {
  it("arma el path con slug, timestamp y extensión limpia", () => {
    expect(pathCropItem("abc-123", "Inodoro Ferrum Bari", "JPG", 1720000000000)).toBe(
      "crops-item/abc-123/inodoro-ferrum-bari-1720000000000.jpg"
    );
  });

  it("cae a jpg si la extensión viene rota", () => {
    expect(pathCropItem("abc", "x", "??", 1)).toBe("crops-item/abc/x-1.jpg");
  });
});

describe("normalizarRect", () => {
  const IMG = { w: 1000, h: 800 };

  it("deja pasar un rect válido, redondeado", () => {
    expect(normalizarRect({ x: 10.4, y: 20.6, ancho: 100.2, alto: 50.5 }, IMG.w, IMG.h)).toEqual({
      x: 10,
      y: 21,
      ancho: 100,
      alto: 51,
    });
  });

  it("acepta rectángulos dibujados hacia atrás (ancho/alto negativos)", () => {
    expect(normalizarRect({ x: 200, y: 300, ancho: -100, alto: -50 }, IMG.w, IMG.h)).toEqual({
      x: 100,
      y: 250,
      ancho: 100,
      alto: 50,
    });
  });

  it("clampea a los bordes de la imagen", () => {
    expect(normalizarRect({ x: -20, y: -10, ancho: 100, alto: 60 }, IMG.w, IMG.h)).toEqual({
      x: 0,
      y: 0,
      ancho: 80,
      alto: 50,
    });
    expect(normalizarRect({ x: 950, y: 780, ancho: 200, alto: 200 }, IMG.w, IMG.h)).toEqual({
      x: 950,
      y: 780,
      ancho: 50,
      alto: 20,
    });
  });

  it("rechaza recortes demasiado chicos o imagen inválida", () => {
    expect(normalizarRect({ x: 0, y: 0, ancho: 10, alto: 100 }, IMG.w, IMG.h)).toBeNull();
    expect(normalizarRect({ x: 0, y: 0, ancho: 100, alto: 100 }, 0, 0)).toBeNull();
  });
});

describe("escalaExport", () => {
  it("no agranda nunca y achica al máximo", () => {
    expect(escalaExport(400, 300)).toBe(1);
    expect(escalaExport(1024, 512)).toBe(0.5);
    expect(escalaExport(512, 2048)).toBe(0.25);
  });
});
