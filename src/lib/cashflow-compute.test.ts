import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  eventosProximos14Dias,
  parseNum,
  saldoMixtoEnFecha,
  saldoRealEnFecha,
  semaforoDesdeSaldos,
  serieSaldoLibreta,
  signedMonto,
  todayBuenosAires,
  totalesProyectados,
  totalesReales,
  type CashflowItemRow,
} from "@/lib/cashflow-compute";

let seq = 0;
/** Item de cashflow con defaults razonables; cada test pisa solo lo que le importa. */
function item(partial: Partial<CashflowItemRow>): CashflowItemRow {
  seq += 1;
  return {
    id: `item-${seq}`,
    obra_id: "obra-1",
    tipo: "egreso",
    categoria: "materiales",
    descripcion: "",
    monto_proyectado: 0,
    fecha_proyectada: "2026-01-10",
    monto_real: null,
    fecha_real: null,
    estado: "pendiente",
    notas: "",
    ...partial,
  };
}

describe("todayBuenosAires", () => {
  it("devuelve una fecha ISO yyyy-mm-dd", () => {
    expect(todayBuenosAires()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDaysIso", () => {
  it("suma días cruzando fin de mes y de año", () => {
    expect(addDaysIso("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("resta días con números negativos", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("maneja años bisiestos", () => {
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("parseNum", () => {
  it("parsea números válidos", () => {
    expect(parseNum("12.5")).toBe(12.5);
    expect(parseNum(7)).toBe(7);
  });

  it("devuelve 0 para basura, null, undefined e infinito", () => {
    expect(parseNum("abc")).toBe(0);
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum(Infinity)).toBe(0);
  });
});

describe("signedMonto", () => {
  it("ingreso queda positivo, egreso negativo", () => {
    expect(signedMonto("ingreso", 100)).toBe(100);
    expect(signedMonto("egreso", 100)).toBe(-100);
  });
});

describe("saldoRealEnFecha", () => {
  const items = [
    item({ tipo: "ingreso", monto_real: 1000, fecha_real: "2026-01-05" }),
    item({ tipo: "egreso", monto_real: 400, fecha_real: "2026-01-07" }),
    item({ tipo: "egreso", monto_real: 100, fecha_real: "2026-01-20" }), // posterior al corte
    item({ tipo: "ingreso", monto_real: 0, fecha_real: "2026-01-06" }), // monto 0 se ignora
    item({ tipo: "ingreso", monto_proyectado: 500 }), // sin real: se ignora
  ];

  it("suma solo movimientos reales hasta la fecha, inclusive", () => {
    expect(saldoRealEnFecha(items, "2026-01-10")).toBe(600);
  });

  it("incluye los movimientos del mismo día del corte", () => {
    expect(saldoRealEnFecha(items, "2026-01-06")).toBe(1000);
    expect(saldoRealEnFecha(items, "2026-01-07")).toBe(600);
  });

  it("sin items devuelve 0", () => {
    expect(saldoRealEnFecha([], "2026-01-10")).toBe(0);
  });
});

describe("saldoMixtoEnFecha", () => {
  it("usa el monto real para lo ejecutado y el proyectado para lo pendiente", () => {
    const items = [
      item({
        tipo: "ingreso",
        monto_proyectado: 900,
        fecha_proyectada: "2026-01-04",
        monto_real: 1000,
        fecha_real: "2026-01-05",
      }),
      item({ tipo: "egreso", monto_proyectado: 300, fecha_proyectada: "2026-01-08" }),
    ];
    expect(saldoMixtoEnFecha(items, "2026-01-10")).toBe(700);
  });

  it("si el real cae después del corte, cuenta el proyectado", () => {
    const items = [
      item({
        tipo: "egreso",
        monto_proyectado: 200,
        fecha_proyectada: "2026-01-09",
        monto_real: 50,
        fecha_real: "2026-01-15",
      }),
    ];
    expect(saldoMixtoEnFecha(items, "2026-01-10")).toBe(-200);
  });
});

describe("semaforoDesdeSaldos", () => {
  it("verde si el saldo mixto a 7 días no es negativo", () => {
    expect(semaforoDesdeSaldos(0, -100)).toBe("verde");
  });

  it("amarillo si a 7 días es negativo pero a 30 no", () => {
    expect(semaforoDesdeSaldos(-1, 0)).toBe("amarillo");
  });

  it("rojo si ambos son negativos", () => {
    expect(semaforoDesdeSaldos(-1, -1)).toBe("rojo");
  });
});

describe("totalesProyectados / totalesReales", () => {
  const items = [
    item({ tipo: "ingreso", monto_proyectado: 1000, monto_real: 950, fecha_real: "2026-01-05" }),
    item({ tipo: "ingreso", monto_proyectado: 250.5 }),
    item({ tipo: "egreso", monto_proyectado: 300.25, monto_real: 310, fecha_real: "2026-01-06" }),
    // monto real SIN fecha real: no cuenta como ejecutado
    item({ tipo: "egreso", monto_proyectado: 100, monto_real: 80, fecha_real: null }),
  ];

  it("proyectados suma todo por monto proyectado", () => {
    expect(totalesProyectados(items)).toEqual({
      ingresos: 1250.5,
      egresos: 400.25,
      neto: 850.25,
    });
  });

  it("reales suma solo líneas con monto Y fecha real", () => {
    expect(totalesReales(items)).toEqual({ ingresos: 950, egresos: 310, neto: 640 });
  });
});

describe("serieSaldoLibreta", () => {
  it("acumula por día solo los movimientos reales", () => {
    const items = [item({ tipo: "ingreso", monto_real: 100, fecha_real: "2026-01-02" })];
    expect(serieSaldoLibreta(items, "2026-01-01", "2026-01-03")).toEqual([
      { fecha: "2026-01-01", saldo: 0 },
      { fecha: "2026-01-02", saldo: 100 },
      { fecha: "2026-01-03", saldo: 100 },
    ]);
  });
});

describe("eventosProximos14Dias", () => {
  const meta = new Map([["obra-1", { presupuesto_id: "pres-1", nombreObra: "Casa Pilar" }]]);
  const items = [
    item({ tipo: "ingreso", monto_proyectado: 500, fecha_proyectada: "2026-06-03" }),
    item({
      obra_id: "obra-2",
      tipo: "egreso",
      monto_proyectado: 180,
      fecha_proyectada: "2026-05-20",
      monto_real: 200,
      fecha_real: "2026-06-02",
    }),
    item({ tipo: "egreso", monto_proyectado: 50, fecha_proyectada: "2026-06-20" }), // fuera de los 14 días
    item({
      tipo: "egreso",
      monto_proyectado: 70,
      fecha_proyectada: "2026-05-28",
      monto_real: 70,
      fecha_real: "2026-05-30",
    }), // en el pasado
  ];

  it("filtra a [hoy, hoy+14], ordena por fecha y distingue real de proyectado", () => {
    const out = eventosProximos14Dias(items, meta, "2026-06-01");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      obra_id: "obra-2",
      nombreObra: "Obra", // obra sin meta → fallback
      presupuesto_id: null,
      fechaReferencia: "2026-06-02",
      montoMostrado: 200, // muestra el real, no el proyectado
      esProyectado: false,
    });
    expect(out[1]).toMatchObject({
      obra_id: "obra-1",
      nombreObra: "Casa Pilar",
      presupuesto_id: "pres-1",
      fechaReferencia: "2026-06-03",
      montoMostrado: 500,
      esProyectado: true,
    });
  });
});
