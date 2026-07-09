import { describe, expect, it } from "vitest";
import { itemsDeReceta, materialesDeReceta } from "../takeoff-helpers";

const receta = {
  etapas: [
    {
      nombre: "Pintura",
      orden: 1,
      items: [
        { nombre: "Látex interior 20L", tipo: "material" as const, unidad: "u" as const, formula: "1" },
        { nombre: "Pintor oficial", tipo: "mano_de_obra" as const, unidad: "dia" as const, formula: "1" },
        { nombre: "Látex interior 20L", tipo: "material" as const, unidad: "u" as const, formula: "1" },
      ],
    },
  ],
};

describe("takeoff-helpers", () => {
  it("itemsDeReceta junta todos sin duplicar", () => {
    expect(itemsDeReceta(receta)).toEqual(["Látex interior 20L", "Pintor oficial"]);
  });
  it("materialesDeReceta filtra la mano de obra", () => {
    expect(materialesDeReceta(receta)).toEqual(["Látex interior 20L"]);
  });
});
