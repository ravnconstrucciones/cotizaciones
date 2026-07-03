import { describe, expect, it } from "vitest";
import { leccionDesdeCruce } from "../leccion";
import type { Cruce, FilaCruce } from "../cruce";
import type { PlanItemRow } from "../tipos";

function fila(p: {
  id: string;
  nombre: string;
  cotizado: number | null;
  plan: number;
  real: number;
  cant_gastos?: number;
  desvio_pct?: number | null;
  incluido?: boolean;
  origen?: "cotizacion" | "manual";
}): FilaCruce {
  const item = {
    id: p.id,
    creado_at: "2026-07-01T00:00:00Z",
    presupuesto_id: "pres",
    cotizacion_id: "cot",
    origen: p.origen ?? "cotizacion",
    tipo: "material",
    nombre: p.nombre,
    etapa: null,
    unidad: null,
    cantidad: 1,
    precio_unitario: p.plan,
    incluido: p.incluido ?? true,
    notas: null,
    cotizado:
      p.cotizado == null
        ? null
        : {
            cantidad: 1,
            unidad: null,
            precio_min: p.cotizado,
            precio_max: p.cotizado,
            subtotal_min: p.cotizado,
            subtotal_max: p.cotizado,
            fuente: "test",
            fecha: "2026-07-01",
          },
  } as PlanItemRow;
  return {
    item,
    cotizado: p.cotizado,
    plan: p.incluido === false ? 0 : p.plan,
    real: p.real,
    cant_gastos: p.cant_gastos ?? (p.real > 0 ? 1 : 0),
    desvio_pct: p.desvio_pct ?? null,
  };
}

const cruce: Cruce = {
  filas: [
    fila({ id: "a", nombre: "Látex", cotizado: 200000, plan: 200000, real: 160000, desvio_pct: -20 }),
    fila({ id: "b", nombre: "Plato de ducha", cotizado: 180000, plan: 0, real: 0, incluido: false }),
    fila({ id: "c", nombre: "Flete olvidado", cotizado: null, plan: 40000, real: 42000, origen: "manual" }),
  ],
  sin_asignar: [
    { id: "g9", descripcion: "varios", importe_ars: 15000, plan_item_id: null, fecha: "2026-07-10" },
  ],
  totales: {
    cotizado: 380000,
    plan: 240000,
    real_asignado: 202000,
    real_sin_asignar: 15000,
    real_total: 217000,
  },
  margen: { cobrado: 600000, margen_ars: 383000, margen_pct: 63.8, margen_plan_ars: 360000 },
};

describe("leccionDesdeCruce", () => {
  it("arma la lección con desvíos relevantes, olvidados y excluidos", () => {
    const { leccion, ajuste } = leccionDesdeCruce("pintura-interior", cruce);
    expect(leccion).toContain("Látex");
    expect(leccion).toContain("-20");
    expect(leccion).toContain("Flete olvidado");
    expect(leccion).toContain("excluido");
    expect(ajuste).toMatchObject({
      modo: "plan",
      total_cotizado: 380000,
      total_real: 217000,
      margen_real_pct: 63.8,
    });
    const a = ajuste as { desviados: unknown[]; sin_cotizar: unknown[]; excluidos: unknown[] };
    expect(a.desviados).toHaveLength(1);
    expect(a.sin_cotizar).toHaveLength(1);
    expect(a.excluidos).toHaveLength(1);
  });

  it("ignora desvíos chicos (|desvío| < 10%)", () => {
    const chico: Cruce = {
      ...cruce,
      filas: [
        fila({ id: "a", nombre: "Látex", cotizado: 200000, plan: 200000, real: 205000, desvio_pct: 2.5 }),
      ],
    };
    const { ajuste } = leccionDesdeCruce("x", chico);
    expect((ajuste as { desviados: unknown[] }).desviados).toHaveLength(0);
  });
});
