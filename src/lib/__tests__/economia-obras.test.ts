import { describe, expect, it } from "vitest";
import { calcularEconomiaObra, calcularRubros, type GastoEconomico } from "../economia-obras";

const p = { id: "p", nombre_obra: "Obra", nombre_cliente: "Cliente", presupuesto_aprobado: true, created_at: "2026-09-01" };
const o = { id: "o", presupuesto_id: "p", monto_total_a_cobrar_ars: 1000, finalizada_at: null };
const gasto: GastoEconomico = { id: "g", presupuesto_id: "p", importe: 200.25, fecha: "2026-09-01", cashflow_item_id: "c", mo_acuerdo_id: "a", rubro_id: "1" };

describe("economía de obras", () => {
  it("cuenta una sola vez el gasto y su movimiento de caja vinculado", () => {
    const r = calcularEconomiaObra(p, o, [gasto], [{ id: "c", obra_id: "o", tipo: "egreso", monto_real: 200.25, fecha_real: "2026-09-01", estado: "pagado" }], []);
    expect(r.gastadoArs).toBe(200.25);
    expect(r.resultadoArs).toBe(799.75);
    expect(r.moPagadaArs).toBe(200.25);
  });
  it("no considera cuotas pendientes, anuladas ni monedas sin conversión como cobros ARS", () => {
    const r = calcularEconomiaObra(p, o, [], [
      { id: "c1", obra_id: "o", tipo: "ingreso", monto_real: null, monto_proyectado: 900, estado: "pendiente" },
      { id: "c2", obra_id: "o", tipo: "ingreso", monto_real: 400, fecha_real: "2026-09-01", deleted_at: "2026-09-02" },
      { id: "c3", obra_id: "o", tipo: "ingreso", monto_real: 50, monto_usd: 50, moneda: "USD", fecha_real: "2026-09-01", estado: "cobrado" },
    ], []);
    expect(r.cobradoArs).toBe(0);
    expect(r.cobradoUsd).toBe(50);
  });
  it("mantiene desconocido un contrato faltante o dolarizado sin tipo de cambio", () => {
    expect(calcularEconomiaObra(p, null, [gasto], [], []).margenPct).toBeNull();
    expect(calcularEconomiaObra(p, { ...o, monto_total_a_cobrar_usd: 100, monto_total_a_cobrar_ars: null }, [], [], []).resultadoArs).toBeNull();
  });
  it("respeta los centavos y suma la mano de obra pendiente al costo de cierre", () => {
    const r = calcularEconomiaObra(p, o, [gasto], [], [{ id: "a", presupuesto_id: "p", moneda: "ARS", monto_arreglado: 500, estado: "abierto" }]);
    expect(r.moPendienteArs).toBe(299.75);
    expect(r.costoCierreArs).toBe(500);
    expect(r.resultadoProyectadoArs).toBe(500);
  });
  it("no divide costos de rubros diferentes por una superficie global ni mezcla unidades", () => {
    const r = calcularRubros([{ ...gasto, plan_item_id: "plan" }, { ...gasto, id: "g2", importe: 100, plan_item_id: null }], [
      { id: "plan", nombre: "Pintura", tipo: "mano_de_obra", unidad: "m2", cantidad: 10, incluido: true },
      { id: "plan2", nombre: "Puerta", tipo: "material", unidad: "u", cantidad: 1, incluido: true },
    ], [{ id: "1", nombre: "Pintura" }]);
    expect(r.trabajos[0].costoUnitario).toBe(20.03);
    expect(r.trabajos[1].costoUnitario).toBeNull();
    expect(r.sinAsignarArs).toBe(100);
    expect(r.rubros[0].gastadoArs).toBe(300.25);
  });
});

describe("conciliación del resumen",()=>{
  it("reconoce MO explícita sin inventar el operario",()=>{
    const r=calcularEconomiaObra(p,o,[{...gasto,mo_acuerdo_id:null,descripcion:"mano de obra"}],[],[]);
    expect(r.moPagadaArs).toBe(200.25);
  });
  it("un contrato sin costos cargados todavía no se presenta como ganancia",()=>{
    expect(calcularEconomiaObra(p,o,[],[],[]).resultadoArs).toBeNull();
  });
});

it("hace visibles pagos al operario sin inventar un acuerdo ni duplicar costos",()=>{
  const r=calcularEconomiaObra({id:"p",created_at:"2026-09-09"},{id:"o",presupuesto_id:"p",monto_total_a_cobrar_ars:100},[{id:"g",presupuesto_id:"p",fecha:"2026-09-09",importe:40,operario_id:"fran",descripcion:"Electricidad"}],[],[]);
  expect(r.gastadoArs).toBe(40);
  expect(r.resultadoArs).toBe(60);
  expect(r.pagosPersonalSinAcuerdoArs).toBe(40);
  expect(r.moPagadaArs).toBe(0);
});
