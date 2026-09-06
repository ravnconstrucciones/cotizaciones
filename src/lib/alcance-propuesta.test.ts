import { describe, it, expect } from "vitest";
import { agruparAlcancePropuesta } from "./alcance-propuesta";
import type { ItemDesglose } from "./cotizador/tipos";
const item = (nombre: string, etapa: string, activo?: boolean) => ({ nombre, etapa, activo }) as ItemDesglose;
describe("alcance comercial", () => {
  it("no vuelve a ofrecer ítems excluidos y conserva los históricos sin bandera", () => {
    const result = agruparAlcancePropuesta([item("Incluido", "Obra"), item("Quitado", "Obra", false)]);
    expect(result.flatMap(e => e.items).map(i => i.nombre)).toEqual(["Incluido"]);
  });
  it("reúne etapas separadas sin reordenar sus trabajos ni generar etapas vacías", () => {
    const result = agruparAlcancePropuesta([item("A", "Pintura"), item("B", "Baño"), item("C", "Pintura"), item("D", "Quitada", false)]);
    expect(result.map(e => [e.nombre, e.items.map(i => i.nombre)])).toEqual([["Pintura", ["A", "C"]], ["Baño", ["B"]]]);
  });
});
