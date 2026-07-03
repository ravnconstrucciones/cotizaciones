import { describe, expect, it } from "vitest";
import { calcularCruce, type GastoParaCruce } from "../cruce";
import type { PlanItemRow } from "../tipos";

function item(p: Partial<PlanItemRow>): PlanItemRow {
  return {
    id: "i1",
    creado_at: "2026-07-01T00:00:00Z",
    presupuesto_id: "pres-1",
    cotizacion_id: "cot-1",
    origen: "cotizacion",
    tipo: "material",
    nombre: "Ítem",
    etapa: null,
    unidad: "u",
    cantidad: 2,
    precio_unitario: 100000,
    incluido: true,
    notas: null,
    cotizado: {
      cantidad: 2,
      unidad: "u",
      precio_min: 90000,
      precio_max: 110000,
      subtotal_min: 180000,
      subtotal_max: 220000,
      fuente: "easy",
      fecha: "2026-07-01",
    },
    ...p,
  };
}

function gasto(p: Partial<GastoParaCruce>): GastoParaCruce {
  return {
    id: "g1",
    descripcion: "compra",
    importe_ars: 0,
    plan_item_id: null,
    fecha: "2026-07-05",
    ...p,
  };
}

describe("calcularCruce", () => {
  it("fila con cotizado (punto medio), plan (cant x precio) y real (gastos vinculados)", () => {
    const items = [item({ id: "latex" })];
    const gastos = [
      gasto({ id: "g1", plan_item_id: "latex", importe_ars: 95000 }),
      gasto({ id: "g2", plan_item_id: "latex", importe_ars: 100000 }),
    ];
    const c = calcularCruce(items, gastos, 500000);
    expect(c.filas[0]).toMatchObject({
      cotizado: 200000,
      plan: 200000,
      real: 195000,
      cant_gastos: 2,
      desvio_pct: -2.5,
    });
  });

  it("excluido: plan 0, cotizado visible; agregado manual: cotizado null", () => {
    const items = [
      item({ id: "ducha", nombre: "Plato de ducha", incluido: false }),
      item({
        id: "flete",
        nombre: "Flete olvidado",
        origen: "manual",
        cotizado: null,
        cantidad: 1,
        precio_unitario: 40000,
      }),
    ];
    const c = calcularCruce(items, [gasto({ plan_item_id: "flete", importe_ars: 42000 })], null);
    expect(c.filas.find((f) => f.item.id === "ducha")).toMatchObject({
      cotizado: 200000,
      plan: 0,
      real: 0,
    });
    expect(c.filas.find((f) => f.item.id === "flete")).toMatchObject({
      cotizado: null,
      plan: 40000,
      real: 42000,
      desvio_pct: null,
    });
  });

  it("plan sin precio cargado cae al cotizado medio si está incluido", () => {
    const items = [item({ precio_unitario: null })];
    const c = calcularCruce(items, [], null);
    expect(c.filas[0].plan).toBe(200000);
  });

  it("sin asignar entra al real_total y al margen; nada queda escondido", () => {
    const items = [item({ id: "latex" })];
    const gastos = [
      gasto({ id: "g1", plan_item_id: "latex", importe_ars: 150000 }),
      gasto({ id: "g2", plan_item_id: null, importe_ars: 50000 }),
    ];
    const c = calcularCruce(items, gastos, 500000);
    expect(c.totales).toMatchObject({
      cotizado: 200000,
      plan: 200000,
      real_asignado: 150000,
      real_sin_asignar: 50000,
      real_total: 200000,
    });
    expect(c.sin_asignar).toHaveLength(1);
    expect(c.margen).toMatchObject({
      cobrado: 500000,
      margen_ars: 300000,
      margen_pct: 60,
      margen_plan_ars: 300000,
    });
  });

  it("sin cobrado: margen null pero totales completos", () => {
    const c = calcularCruce([item({})], [], null);
    expect(c.margen).toMatchObject({
      cobrado: null,
      margen_ars: null,
      margen_pct: null,
      margen_plan_ars: null,
    });
  });

  it("ordena materiales y extras antes que mano de obra", () => {
    const items = [
      item({ id: "mo", tipo: "mano_de_obra", nombre: "Pintor" }),
      item({ id: "mat", tipo: "material", nombre: "Látex" }),
      item({ id: "ex", tipo: "extra", nombre: "Flete" }),
    ];
    const c = calcularCruce(items, [], null);
    expect(c.filas.map((f) => f.item.id)).toEqual(["mat", "ex", "mo"]);
  });
});
