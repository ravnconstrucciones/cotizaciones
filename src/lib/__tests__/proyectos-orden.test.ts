import { describe, expect, it } from "vitest";
import {
  clasificarProyecto,
  ordenarProyectos,
  type ProyectoRow,
} from "@/lib/proyectos-orden";

function proyecto(partial: Partial<ProyectoRow>): ProyectoRow {
  return {
    id: "p-1",
    nombre_obra: "Reforma baño",
    nombre_cliente: "Cliente",
    presupuesto_aprobado: false,
    created_at: "2026-01-01T00:00:00Z",
    cant_items: 0,
    cant_gastos: 0,
    ...partial,
  };
}

describe("ordenarProyectos", () => {
  it("aprobados aparecen antes que no aprobados", () => {
    const rows = [
      proyecto({ id: "a", presupuesto_aprobado: false, cant_items: 10 }),
      proyecto({ id: "b", presupuesto_aprobado: true, cant_items: 2 }),
    ];
    const result = ordenarProyectos(rows);
    expect(result[0].id).toBe("b");
    expect(result[1].id).toBe("a");
  });

  it("dentro de los no aprobados, más items va primero", () => {
    const rows = [
      proyecto({ id: "a", presupuesto_aprobado: false, cant_items: 3 }),
      proyecto({ id: "b", presupuesto_aprobado: false, cant_items: 15 }),
      proyecto({ id: "c", presupuesto_aprobado: false, cant_items: 7 }),
    ];
    const result = ordenarProyectos(rows);
    expect(result.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("dentro de los aprobados, más items va primero", () => {
    const rows = [
      proyecto({ id: "a", presupuesto_aprobado: true, cant_items: 5 }),
      proyecto({ id: "b", presupuesto_aprobado: true, cant_items: 20 }),
    ];
    const result = ordenarProyectos(rows);
    expect(result[0].id).toBe("b");
  });

  it("empate de items: más reciente primero", () => {
    const rows = [
      proyecto({
        id: "viejo",
        cant_items: 5,
        created_at: "2025-01-01T00:00:00Z",
      }),
      proyecto({
        id: "nuevo",
        cant_items: 5,
        created_at: "2026-06-01T00:00:00Z",
      }),
    ];
    const result = ordenarProyectos(rows);
    expect(result[0].id).toBe("nuevo");
  });

  it("no muta el array original", () => {
    const rows = [
      proyecto({ id: "a", presupuesto_aprobado: true }),
      proyecto({ id: "b" }),
    ];
    const copia = [...rows];
    ordenarProyectos(rows);
    expect(rows).toEqual(copia);
  });

  it("lista vacía devuelve vacío", () => {
    expect(ordenarProyectos([])).toEqual([]);
  });
});

describe("clasificarProyecto", () => {
  it("aprobado → 'aprobado'", () => {
    expect(
      clasificarProyecto({ presupuesto_aprobado: true, cant_items: 0 })
    ).toBe("aprobado");
  });

  it("no aprobado con items → 'con_items'", () => {
    expect(
      clasificarProyecto({ presupuesto_aprobado: false, cant_items: 5 })
    ).toBe("con_items");
  });

  it("no aprobado sin items → 'borrador'", () => {
    expect(
      clasificarProyecto({ presupuesto_aprobado: false, cant_items: 0 })
    ).toBe("borrador");
  });

  it("aprobado con items → 'aprobado' (aprobado tiene prioridad)", () => {
    expect(
      clasificarProyecto({ presupuesto_aprobado: true, cant_items: 10 })
    ).toBe("aprobado");
  });

  it("null en presupuesto_aprobado se trata como no aprobado", () => {
    expect(
      clasificarProyecto({ presupuesto_aprobado: null, cant_items: 3 })
    ).toBe("con_items");
  });
});
