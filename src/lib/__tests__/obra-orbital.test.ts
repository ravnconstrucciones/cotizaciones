import { describe, expect, it } from "vitest";
import {
  derivarOrbitalObra,
  estadoPorPct,
  type GastoOrbitalInput,
  type ItemOrbitalInput,
} from "@/lib/obra-orbital";

const NOMBRES = {
  "1": "1 - Albañilería",
  "2": "2 - Pintura",
  "3": "3 - Electricidad",
};

function item(
  rubroId: string | null,
  cantidad: number,
  mat: number,
  mo: number
): ItemOrbitalInput {
  return { rubroId, cantidad, precioMaterial: mat, precioMo: mo };
}

function gasto(rubroId: string | null, importeArs: number): GastoOrbitalInput {
  return { rubroId, importeArs };
}

describe("estadoPorPct", () => {
  it("deriva los tres estados con el umbral 95/0", () => {
    expect(estadoPorPct(0)).toBe("pending");
    expect(estadoPorPct(0.01)).toBe("in-progress");
    expect(estadoPorPct(94.99)).toBe("in-progress");
    expect(estadoPorPct(95)).toBe("completed");
    expect(estadoPorPct(140)).toBe("completed");
  });
});

describe("derivarOrbitalObra", () => {
  it("agrupa ítems por rubro con la convención cantidad × (mat + mo)", () => {
    const r = derivarOrbitalObra(
      [item("1", 2, 100, 50), item("1", 1, 200, 0), item("2", 10, 10, 5)],
      [],
      NOMBRES
    );
    expect(r.nodos).toHaveLength(2);
    const alba = r.nodos.find((n) => n.rubroId === "1")!;
    expect(alba.presupuestado).toBe(500); // 2×150 + 1×200
    expect(alba.nombre).toBe("1 - Albañilería");
    expect(alba.status).toBe("pending");
    expect(alba.energy).toBe(0);
    expect(r.presupuestadoTotal).toBe(650);
  });

  it("cruza gastos por rubro: % ejecutado, energy 0-100 y desvío", () => {
    const r = derivarOrbitalObra(
      [item("1", 1, 1000, 0), item("2", 1, 1000, 0)],
      [gasto("1", 500), gasto("2", 1200)],
      NOMBRES
    );
    const alba = r.nodos.find((n) => n.rubroId === "1")!;
    expect(alba.pctEjecutado).toBe(50);
    expect(alba.energy).toBe(50);
    expect(alba.status).toBe("in-progress");
    expect(alba.desvio).toBe(500);

    const pintura = r.nodos.find((n) => n.rubroId === "2")!;
    expect(pintura.pctEjecutado).toBe(120); // real, sin tope
    expect(pintura.energy).toBe(100); // capeado para el glow
    expect(pintura.status).toBe("completed");
    expect(pintura.desvio).toBe(-200); // pasado de presupuesto
  });

  it("status completed desde 95% ejecutado", () => {
    const r = derivarOrbitalObra(
      [item("1", 1, 100, 0)],
      [gasto("1", 95)],
      NOMBRES
    );
    expect(r.nodos[0].status).toBe("completed");
  });

  it("gastos sin rubro van al bucket aparte y suman al total gastado", () => {
    const r = derivarOrbitalObra(
      [item("1", 1, 100, 0)],
      [gasto(null, 30), gasto("", 20), gasto("1", 10)],
      NOMBRES
    );
    expect(r.gastoSinRubro).toBe(50);
    expect(r.gastadoTotal).toBe(60);
    expect(r.nodos).toHaveLength(1);
  });

  it("un gasto en rubro sin partida crea nodo con presupuestado 0 y pct 100", () => {
    const r = derivarOrbitalObra(
      [item("1", 1, 100, 0)],
      [gasto("3", 40)],
      NOMBRES
    );
    const elec = r.nodos.find((n) => n.rubroId === "3")!;
    expect(elec.presupuestado).toBe(0);
    expect(elec.gastado).toBe(40);
    expect(elec.pctEjecutado).toBe(100);
    expect(elec.status).toBe("completed");
    expect(elec.desvio).toBe(-40);
  });

  it("ítems sin rubro caen al pseudo-rubro 'otros'", () => {
    const r = derivarOrbitalObra([item(null, 1, 100, 0)], [], {});
    expect(r.nodos[0].rubroId).toBe("otros");
    expect(r.nodos[0].nombre).toBe("Otros");
  });

  it("ordena los nodos por prefijo numérico del rubro", () => {
    const r = derivarOrbitalObra(
      [item("10", 1, 1, 0), item("2", 1, 1, 0), item("1", 1, 1, 0)],
      [],
      {}
    );
    expect(r.nodos.map((n) => n.rubroId)).toEqual(["1", "2", "10"]);
  });
});
