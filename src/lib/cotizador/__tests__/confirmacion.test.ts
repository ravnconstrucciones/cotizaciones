import { describe, expect, it } from "vitest";
import { preciosParaConfirmacion, validarReferencia } from "../confirmacion";
import type { PrecioItemRow } from "../tipos";

const row = (
  item: string,
  origen: PrecioItemRow["origen"],
  valor: number,
  fecha: string
): PrecioItemRow => ({ item, origen, valor, fuente: origen === "eze" ? "Eze" : origen, fecha, revisado_at: fecha });

describe("preciosParaConfirmacion", () => {
  it("arma el PrecioItem desde el cache", () => {
    const p = preciosParaConfirmacion(["Látex"], [row("Látex", "sismat", 100, "2026-08-01")], []);
    expect(p["Látex"].sismat?.valor).toBe(100);
  });

  it("la referencia de la ola gana si es más nueva; pierde si es más vieja", () => {
    const cache = [row("Látex", "internet", 100, "2026-08-10")];
    const nueva = preciosParaConfirmacion(["Látex"], cache, [
      { nombre: "Látex", valor: 120, fuente: "easy.com.ar", fecha: "2026-08-17", origen: "internet" },
    ]);
    expect(nueva["Látex"].internet?.valor).toBe(120);
    const vieja = preciosParaConfirmacion(["Látex"], cache, [
      { nombre: "Látex", valor: 80, fuente: "easy.com.ar", fecha: "2026-07-01", origen: "internet" },
    ]);
    expect(vieja["Látex"].internet?.valor).toBe(100);
  });

  it("eze sale SOLO del cache — una referencia nunca lo pisa", () => {
    const p = preciosParaConfirmacion(["Látex"], [row("Látex", "eze", 90, "2026-08-01")], [
      { nombre: "Látex", valor: 120, fuente: "easy", fecha: "2026-08-17", origen: "internet" },
    ]);
    expect(p["Látex"].eze?.valor).toBe(90);
    expect(p["Látex"].internet?.valor).toBe(120);
  });

  it("un ítem sin nada queda sin entrada (sin_precio aguas abajo)", () => {
    expect(preciosParaConfirmacion(["Nada"], [], [])["Nada"]).toBeUndefined();
  });

  it("una referencia de un ítem que no está en la receta se ignora", () => {
    const p = preciosParaConfirmacion(["Látex"], [], [
      { nombre: "Otro", valor: 1, fuente: "x", fecha: "2026-08-17", origen: "internet" },
    ]);
    expect(Object.keys(p)).toEqual([]);
  });
});

describe("validarReferencia", () => {
  it("rebota origen eze/retail, valores no positivos y fechas mal formadas", () => {
    expect("error" in (validarReferencia({ nombre: "x", valor: 1, fuente: "f", fecha: "2026-08-17", origen: "eze" }) as object)).toBe(true);
    expect("error" in (validarReferencia({ nombre: "x", valor: 0, fuente: "f", fecha: "2026-08-17", origen: "internet" }) as object)).toBe(true);
    expect("error" in (validarReferencia({ nombre: "x", valor: 1, fuente: "f", fecha: "17/08", origen: "internet" }) as object)).toBe(true);
    expect("error" in (validarReferencia({ nombre: "x", valor: 1, fuente: "f", fecha: "2026-08-17", origen: "internet" }) as object)).toBe(false);
  });
});
