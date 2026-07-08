import { describe, expect, it } from "vitest";
import {
  chequeoConsistencia,
  claveBolsillo,
  saldosBolsillos,
  saldosCuentasDesdeLedger,
  validarGrupo,
  type MovimientoPlataRow,
} from "@/lib/dinero";

const mov = (m: Partial<MovimientoPlataRow>): MovimientoPlataRow => ({
  id: "m-1",
  cuenta_id: "c-mp",
  dueno_tipo: "empresa",
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
      // Caso volquete real: -90k bolsillo obra Palermo + -60k bolsillo RAVN, en MP.
      mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-palermo", monto: 200000, origen_tipo: "cobro" }),
      mov({ id: "m-2", dueno_tipo: "obra", dueno_obra_id: "p-palermo", monto: -90000 }),
      mov({ id: "m-3", dueno_tipo: "empresa", monto: -60000 }),
      mov({ id: "m-4", dueno_tipo: "empresa", monto: -99999, estado: "borrador" }),
    ]);
    const obra = bolsillos.find((b) => b.dueno_tipo === "obra");
    const ravn = bolsillos.find((b) => b.dueno_tipo === "empresa");
    expect(obra).toMatchObject({ cuenta_id: "c-mp", dueno_obra_id: "p-palermo", saldo: 110000, movimientos: 2 });
    expect(ravn).toMatchObject({ cuenta_id: "c-mp", dueno_obra_id: null, saldo: -60000, movimientos: 1 });
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
    expect(claveBolsillo("c-1", "obra", "p-1")).not.toBe(claveBolsillo("c-1", "empresa", null));
    expect(claveBolsillo("c-1", "obra", "p-1")).toBe(claveBolsillo("c-1", "obra", "p-1"));
  });
});

describe("saldosCuentasDesdeLedger", () => {
  it("saldo de cuenta = suma de sus bolsillos (invariante de la spec)", () => {
    const saldos = saldosCuentasDesdeLedger([
      mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: 300000, origen_tipo: "cobro" }),
      mov({ id: "m-2", dueno_tipo: "empresa", monto: -60000 }),
      mov({ id: "m-3", cuenta_id: "c-bbva", dueno_tipo: "empresa", monto: 500, origen_tipo: "cobro" }),
    ]);
    expect(saldos.get("c-mp")).toBe(240000);
    expect(saldos.get("c-bbva")).toBe(500);
  });
});

const CUENTAS = [
  { id: "c-mp", moneda: "ARS" as const },
  { id: "c-usd", moneda: "USD" as const },
];

describe("validarGrupo (invariantes de la spec)", () => {
  it("grupo válido → sin errores", () => {
    expect(
      validarGrupo(
        [
          mov({ id: "m-1", dueno_tipo: "obra", dueno_obra_id: "p-1", monto: -90000 }),
          mov({ id: "m-2", dueno_tipo: "empresa", monto: -60000 }),
        ],
        CUENTAS
      )
    ).toEqual([]);
  });

  it("detecta grupo_id mezclado, estado mixto, moneda que no es la de la cuenta, monto 0 y dueño incoherente", () => {
    const errores = validarGrupo(
      [
        mov({ id: "m-1", grupo_id: "g-1", monto: 100 }),
        mov({ id: "m-2", grupo_id: "g-OTRO", monto: 100 }), // otro grupo
        mov({ id: "m-3", estado: "borrador", monto: 100 }), // estado mixto
        mov({ id: "m-4", cuenta_id: "c-usd", moneda: "ARS", monto: 100 }), // c-usd es USD
        mov({ id: "m-5", monto: 0 }), // monto cero
        mov({ id: "m-6", dueno_tipo: "obra", dueno_obra_id: null, monto: 100 }), // obra sin obra_id
      ],
      CUENTAS
    );
    expect(errores.length).toBe(5);
  });

  it("grupo vacío es inválido", () => {
    expect(validarGrupo([], CUENTAS)).not.toEqual([]);
  });
});

describe("chequeoConsistencia", () => {
  it("compara ledger vs motor actual SOLO en cuentas que el ledger conoce", () => {
    const movs = [
      mov({ id: "m-1", monto: 100000, origen_tipo: "cobro" }),
      mov({ id: "m-2", monto: -40000 }),
    ];
    const motor = new Map([
      ["c-mp", 60000], // coincide → sin divergencia
      ["c-bbva", 999999], // no está en el ledger → se ignora
    ]);
    expect(chequeoConsistencia(movs, motor)).toEqual([]);
  });

  it("reporta la divergencia con el delta exacto", () => {
    const movs = [mov({ id: "m-1", monto: 60000, origen_tipo: "cobro" })];
    const motor = new Map([["c-mp", 61000]]);
    expect(chequeoConsistencia(movs, motor)).toEqual([
      { cuenta_id: "c-mp", saldoLedger: 60000, saldoMotor: 61000, delta: -1000 },
    ]);
  });
});
