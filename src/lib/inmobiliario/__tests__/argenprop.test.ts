import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsearArgenprop } from "@/lib/inmobiliario/fuentes/argenprop";

const html = readFileSync(resolve(__dirname, "../__fixtures__/argenprop-palermo.html"), "utf8");

describe("parsearArgenprop", () => {
  it("extrae al menos 15 avisos válidos del fixture de Palermo", () => {
    const avisos = parsearArgenprop(html, "Palermo");
    expect(avisos.length).toBeGreaterThanOrEqual(15);
  });
  it("cada aviso tiene precio, m² y USD/m² coherentes", () => {
    const avisos = parsearArgenprop(html, "Palermo");
    for (const a of avisos) {
      expect(a.fuente).toBe("argenprop");
      expect(a.tipoDato).toBe("publicacion");
      expect(a.precioUsd).toBeGreaterThan(10000);
      expect(a.m2).toBeGreaterThanOrEqual(15);
      expect(a.usdPorM2).toBe(Math.round(a.precioUsd / a.m2));
      expect(a.fuenteId).toBeTruthy();
    }
  });
  it("la mediana de USD/m² de Palermo es realista (entre 1500 y 6000)", () => {
    const avisos = parsearArgenprop(html, "Palermo");
    const ppm = avisos.map((a) => a.usdPorM2).sort((x, y) => x - y);
    const med = ppm[Math.floor(ppm.length / 2)];
    expect(med).toBeGreaterThan(1500);
    expect(med).toBeLessThan(6000);
  });
  it("los fuenteId son únicos por aviso", () => {
    const avisos = parsearArgenprop(html, "Palermo");
    const ids = new Set(avisos.map((a) => a.fuenteId));
    expect(ids.size).toBe(avisos.length);
  });
});
