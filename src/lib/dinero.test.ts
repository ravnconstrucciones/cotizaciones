import { describe, expect, it } from "vitest";
import {
  claveBolsillo,
  saldosBolsillos,
  saldosCuentasDesdeLedger,
  type MovimientoPlataRow,
} from "@/lib/dinero";

const mov = (m: Partial<MovimientoPlataRow>): MovimientoPlataRow => ({
  id: "m-1",
  cuenta_id: "c-mp",
  dueno_tipo: "personal",
  dueno_obra_id: null,
  monto: 0,
  moneda: "ARS",
  grupo_id: "g-1",
  origen_tipo: "gasto_personal",
  estado: "asentado",
  ...m,
});

describe("saldosBolsillos", () => {
  it("suma por (cuenta, dueño) y SOLO movimientos asentados", () => {
    const bolsillos = saldosBolsillos([
      // Caso volquete real: -90k bolsillo obra Palermo + -60k bolsillo Eze, en MP.
      mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-palermo", monto: 200000, origen_tipo: "cobro" }),
      mov({ id: "m-2", dueno_tipo: "obra", dueno_obra_id: "p-palermo", monto: -90000 }),
      mov({ id: "m-3", dueno_tipo: "personal", monto: -60000 }),
      mov({ id: "m-4", dueno_tipo: "personal", monto: -99999, estado: "borrador" }),
    ]);
    const obra = bolsillos.find((b) => b.dueno_tipo === "obra");
    const eze = bolsillos.find((b) => b.dueno_tipo === "personal");
    expect(obra).toMatchObject({ cuenta_id: "c-mp", dueno_obra_id: "p-palermo", saldo: 110000, movimientos: 2 });
    expect(eze).toMatchObject({ cuenta_id: "c-mp", dueno_obra_id: null, saldo: -60000, movimientos: 1 });
    expect(bolsillos).toHaveLength(2); // el borrador no crea bolsillo
  });

  it("separa la misma obra en cuentas distintas (bolsillo = cuenta × dueño)", () => {
    const bolsillos = saldosBolsillos([
      mov({ id: "m-1", cuenta_id: "c-mp", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 100, origen_tipo: "cobro" }),
      mov({ id: "m-2", cuenta_id: "c-efe", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 50, origen_tipo: "cobro" }),
    ]);
    expect(bolsillos).toHaveLength(2);
  });

  it("montos llegan como unknown (numeric de Supabase viene string) y redondea a 2", () => {
    const [b] = saldosBolsillos([
      mov({ id: "m-1", monto: "100.1" as unknown }),
      mov({ id: "m-2", monto: "0.01" as unknown }),
    ]);
    expect(b.saldo).toBe(100.11);
  });
});

describe("claveBolsillo", () => {
  it("es estable y distingue dueño con y sin obra", () => {
    expect(claveBolsillo("c-1", "obra", "p-1")).not.toBe(claveBolsillo("c-1", "personal", null));
    expect(claveBolsillo("c-1", "obra", "p-1")).toBe(claveBolsillo("c-1", "obra", "p-1"));
  });
});

describe("saldosCuentasDesdeLedger", () => {
  it("saldo de cuenta = suma de sus bolsillos (invariante de la spec)", () => {
    const saldos = saldosCuentasDesdeLedger([
      mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 300000, origen_tipo: "cobro" }),
      mov({ id: "m-2", dueno_tipo: "personal", monto: -60000 }),
      mov({ id: "m-3", cuenta_id: "c-bbva", dueno_tipo: "empresa", monto: 500, origen_tipo: "cobro" }),
    ]);
    expect(saldos.get("c-mp")).toBe(240000);
    expect(saldos.get("c-bbva")).toBe(500);
  });
});
