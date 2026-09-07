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
  it("muestra primero el más reciente aunque esté vacío o sin aprobar", () => {
    const rows = [
      proyecto({ id: "viejo", presupuesto_aprobado: true, cant_items: 20, created_at: "2026-08-01T00:00:00Z" }),
      proyecto({ id: "nuevo", created_at: "2026-09-06T00:00:00Z" }),
      proyecto({ id: "medio", cant_items: 40, created_at: "2026-09-01T00:00:00Z" }),
    ];
    expect(ordenarProyectos(rows).map(r => r.id)).toEqual(["nuevo", "medio", "viejo"]);
  });

  it("mantiene un orden estable si coinciden las fechas de creación", () => {
    expect(ordenarProyectos([proyecto({ id: "b" }), proyecto({ id: "a" })]).map(r => r.id)).toEqual(["a", "b"]);
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
