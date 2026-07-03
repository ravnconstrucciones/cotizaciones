import { describe, expect, it } from "vitest";
import {
  calcularCiclo,
  calcularFinanzas,
  fraseDelDia,
  semaforoDe,
  type FechaYMD,
  type FijoRow,
  type GastoVariable,
} from "../finanzas-personal";

const ymd = (s: string): FechaYMD => {
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
};

describe("calcularCiclo (dia_cierre = 25)", () => {
  it("hoy a mitad de ciclo (≤ 25): ciclo del mes anterior", () => {
    const c = calcularCiclo(ymd("2026-06-10"), 25);
    expect(c.inicio).toBe("2026-05-26");
    expect(c.fin).toBe("2026-06-25");
    expect(c.dias_total).toBe(31); // may26..31 (6) + jun1..25 (25)
    expect(c.dia_actual).toBe(16); // may26..jun10
    expect(c.label).toBe("26 may → 25 jun");
  });

  it("hoy = 1ro de mes: sigue en el ciclo que cierra el 25", () => {
    const c = calcularCiclo(ymd("2026-06-01"), 25);
    expect(c.inicio).toBe("2026-05-26");
    expect(c.fin).toBe("2026-06-25");
    expect(c.dia_actual).toBe(7); // may26..jun1
  });

  it("hoy = 25 (día de cierre, borde inclusive): último día del ciclo", () => {
    const c = calcularCiclo(ymd("2026-06-25"), 25);
    expect(c.inicio).toBe("2026-05-26");
    expect(c.fin).toBe("2026-06-25");
    expect(c.dia_actual).toBe(31);
    expect(c.dia_actual).toBe(c.dias_total);
  });

  it("hoy = 26 (cierre + 1): arranca el ciclo nuevo, día 1", () => {
    const c = calcularCiclo(ymd("2026-06-26"), 25);
    expect(c.inicio).toBe("2026-06-26");
    expect(c.fin).toBe("2026-07-25");
    expect(c.dia_actual).toBe(1);
    expect(c.dias_total).toBe(30); // jun26..30 (5) + jul1..25 (25)
    expect(c.label).toBe("26 jun → 25 jul");
  });

  it("fin de mes (31): cae en el ciclo que cierra el mes que viene", () => {
    const c = calcularCiclo(ymd("2026-01-31"), 25);
    expect(c.inicio).toBe("2026-01-26");
    expect(c.fin).toBe("2026-02-25");
    expect(c.dia_actual).toBe(6); // ene26..31
    expect(c.dias_total).toBe(31); // ene26..31 (6) + feb1..25 (25)
  });

  it("febrero antes del cierre: ciclo ene26 → feb25", () => {
    const c = calcularCiclo(ymd("2026-02-20"), 25);
    expect(c.inicio).toBe("2026-01-26");
    expect(c.fin).toBe("2026-02-25");
    expect(c.dias_total).toBe(31);
    expect(c.dia_actual).toBe(26); // ene26..31 (6) + feb1..20 (20)
  });

  it("febrero después del cierre (ciclo corto): feb26 → mar25 = 28 días", () => {
    const c = calcularCiclo(ymd("2026-02-28"), 25);
    expect(c.inicio).toBe("2026-02-26");
    expect(c.fin).toBe("2026-03-25");
    expect(c.dias_total).toBe(28); // feb26..28 (3) + mar1..25 (25)
    expect(c.dia_actual).toBe(3);
  });

  it("cruce de año: dic26 → ene25", () => {
    const c = calcularCiclo(ymd("2026-01-10"), 25);
    expect(c.inicio).toBe("2025-12-26");
    expect(c.fin).toBe("2026-01-25");
    expect(c.dias_total).toBe(31); // dic26..31 (6) + ene1..25 (25)
    expect(c.dia_actual).toBe(16);
    expect(c.label).toBe("26 dic → 25 ene");
  });
});

describe("calcularCiclo (dia_cierre al borde de mes corto)", () => {
  it("dia_cierre = 28 en febrero: clampea bien y arranca ciclo nuevo", () => {
    const c = calcularCiclo(ymd("2026-02-28"), 28);
    expect(c.inicio).toBe("2026-01-29"); // ene cierra el 28, +1
    expect(c.fin).toBe("2026-02-28");
    expect(c.dias_total).toBe(31); // ene29..31 (3) + feb1..28 (28)
    expect(c.dia_actual).toBe(31);
  });
});

describe("semaforoDe (sobre lo que queda del ciclo)", () => {
  it("queda mucho (≥ 3 días de aire) → verde", () => {
    expect(semaforoDe(600000, 20000)).toBe("verde");
    expect(semaforoDe(60000, 20000)).toBe("verde"); // borde: 60000 === 3×asig
  });
  it("queda poco (< 3 días de aire) pero positivo → amarillo", () => {
    expect(semaforoDe(59999, 20000)).toBe("amarillo");
    expect(semaforoDe(0, 20000)).toBe("amarillo");
  });
  it("te pasaste del mes (negativo) → rojo", () => {
    expect(semaforoDe(-1, 20000)).toBe("rojo");
  });
});

describe("fraseDelDia", () => {
  it("frase verde/amarillo lleva lo que queda hoy y lo que queda del ciclo", () => {
    const f = fraseDelDia(46181, 1246883, "verde");
    expect(f).toContain("Hoy te quedan");
    expect(f).toContain("hasta el cierre");
  });
  it("día en rojo (pero ciclo vivo): avisa que hoy se pasó y que mañana renueva", () => {
    const f = fraseDelDia(-12000, 500000, "verde");
    expect(f).toContain("Hoy ya te pasaste");
    expect(f).toContain("mañana se renueva");
  });
  it("frase roja avisa que se pasó del presupuesto del mes", () => {
    const f = fraseDelDia(-5000, -5000, "rojo");
    expect(f).toContain("Te pasaste del presupuesto del mes");
    expect(f).toContain("frená hasta el cierre");
  });
});

/**
 * Modelo "presupuesto del día": al arrancar el día queda fijado (lo que quedaba
 * ÷ días que faltaban) y lo gastado HOY descuenta 1 a 1 — puede dar negativo
 * (día en rojo) aunque el ciclo siga verde. Ciclo de 30 días (26 abr → 25 may,
 * discrecional $600k, sin fijos).
 */
describe("calcularFinanzas — presupuesto del día", () => {
  const baseFijos: FijoRow[] = [];
  const conGastos = (gastos: GastoVariable[], hoy: string) =>
    calcularFinanzas({
      topePersonalMensual: 600000,
      diaCierre: 25,
      hoy: ymd(hoy),
      fijos: baseFijos,
      gastosVariables: gastos,
    });

  it("día 1, sin gastos → presupuesto de hoy $20k (600k / 30) y todo disponible", () => {
    const r = conGastos([], "2026-04-26");
    expect(r.asignacion_diaria).toBe(20000);
    expect(r.ciclo.dias_total).toBe(30);
    expect(r.dias_restantes).toBe(30);
    expect(r.disponible_ciclo).toBe(600000);
    expect(r.presupuesto_hoy).toBe(20000);
    expect(r.gastado_hoy).toBe(0);
    expect(r.disponible_hoy).toBe(20000);
    expect(r.semaforo).toBe("verde"); // queda todo el mes
  });

  it("día 2, sin gastos → el contador se renueva: 600k / 29 días", () => {
    const r = conGastos([], "2026-04-27");
    expect(r.dias_restantes).toBe(29);
    expect(r.presupuesto_hoy).toBeCloseTo(600000 / 29, 2);
    expect(r.disponible_hoy).toBeCloseTo(600000 / 29, 2);
    expect(r.semaforo).toBe("verde");
  });

  it("gastar HOY descuenta 1 a 1 del presupuesto del día (puede dar negativo)", () => {
    const r = conGastos(
      [{ id: "g1", fecha: "2026-04-28", concepto: "súper", monto: 50000, categoria: "Supermercado" }],
      "2026-04-28"
    );
    expect(r.gastado_variable).toBe(50000);
    expect(r.disponible_ciclo).toBe(550000);
    // El presupuesto de hoy quedó fijado ANTES de gastar: 600k / 28 días.
    expect(r.presupuesto_hoy).toBeCloseTo(600000 / 28, 2);
    expect(r.gastado_hoy).toBe(50000);
    // Y lo gastado descuenta 1 a 1: hoy quedaste en rojo, el ciclo sigue verde.
    expect(r.disponible_hoy).toBeCloseTo(600000 / 28 - 50000, 2);
    expect(r.disponible_hoy).toBeLessThan(0);
    expect(r.por_dia_al_cierre).toBeCloseTo(550000 / 28, 2);
    expect(r.semaforo).toBe("verde");
  });

  it("un gasto de AYER no toca el presupuesto de hoy fijado (solo lo prorratea)", () => {
    const r = conGastos(
      [{ id: "g1", fecha: "2026-04-27", concepto: "salida", monto: 50000, categoria: "Salidas" }],
      "2026-04-28"
    );
    // Hoy arranca con lo que quedó: (600k − 50k) / 28 días.
    expect(r.presupuesto_hoy).toBeCloseTo(550000 / 28, 2);
    expect(r.gastado_hoy).toBe(0);
    expect(r.disponible_hoy).toBeCloseTo(550000 / 28, 2);
  });

  it("se comió TODO el discrecional → rojo de verdad y presupuesto de hoy en 0", () => {
    const r = conGastos(
      [{ id: "g1", fecha: "2026-04-28", concepto: "se pasó", monto: 650000, categoria: "Varios" }],
      "2026-04-29"
    );
    expect(r.disponible_ciclo).toBe(-50000); // 600000 - 650000
    expect(r.semaforo).toBe("rojo");
    expect(r.proyeccion_fin_ciclo).toBe(-50000);
    expect(r.presupuesto_hoy).toBe(0); // no hay más plata que repartir
    expect(r.disponible_hoy).toBe(0);
  });
});

/**
 * Historial día por día: el ciclo entero reconstruido desde los gastos
 * fechados, con presupuesto fijado por día, verde/rojo y proyección futura.
 */
describe("calcularFinanzas — historial día por día", () => {
  const gastos: GastoVariable[] = [
    // día 1 (26 abr): se pasó → rojo
    { id: "g1", fecha: "2026-04-26", concepto: "asado", monto: 30000, categoria: "Salidas" },
    // día 2 (27 abr): gastó poco → verde
    { id: "g2", fecha: "2026-04-27", concepto: "café", monto: 5000, categoria: "Salidas" },
    // día 3 (28 abr, hoy): gastó parte del día
    { id: "g3", fecha: "2026-04-28", concepto: "nafta", monto: 10000, categoria: "Combustible" },
  ];
  const r = calcularFinanzas({
    topePersonalMensual: 600000,
    diaCierre: 25,
    hoy: { year: 2026, month: 4, day: 28 },
    fijos: [],
    gastosVariables: gastos,
  });

  it("devuelve TODOS los días del ciclo (pasados, hoy y futuros)", () => {
    expect(r.dias).toHaveLength(30);
    expect(r.dias[0]?.fecha).toBe("2026-04-26");
    expect(r.dias[29]?.fecha).toBe("2026-05-25");
  });

  it("día 1: presupuesto $20k, gastó $30k → rojo con saldo −$10k", () => {
    const d1 = r.dias[0]!;
    expect(d1.presupuesto).toBe(20000);
    expect(d1.gastado).toBe(30000);
    expect(d1.saldo).toBe(-10000);
    expect(d1.estado).toBe("rojo");
    expect(d1.gastos).toHaveLength(1);
  });

  it("día 2: el contador se renovó con lo que quedó → (600k−30k)/29, verde", () => {
    const d2 = r.dias[1]!;
    expect(d2.presupuesto).toBeCloseTo(570000 / 29, 2);
    expect(d2.gastado).toBe(5000);
    expect(d2.estado).toBe("verde");
  });

  it("hoy (día 3): presupuesto fijado al arrancar, estado 'hoy'", () => {
    const d3 = r.dias[2]!;
    expect(d3.estado).toBe("hoy");
    expect(d3.presupuesto).toBeCloseTo(565000 / 28, 2);
    expect(d3.gastado).toBe(10000);
    expect(d3.presupuesto).toBe(r.presupuesto_hoy);
    expect(d3.saldo).toBeCloseTo(r.disponible_hoy, 2);
  });

  it("días futuros: proyección pareja de lo que queda, estado 'futuro'", () => {
    const d4 = r.dias[3]!;
    expect(d4.estado).toBe("futuro");
    expect(d4.gastado).toBe(0);
    // (600k − 45k gastados) / 27 días que faltan después de hoy
    expect(d4.presupuesto).toBeCloseTo(555000 / 27, 2);
    expect(r.dias.slice(3).every((d) => d.estado === "futuro")).toBe(true);
  });
});

describe("calcularFinanzas — fijos, software y categorías", () => {
  const fijos: FijoRow[] = [
    { id: "f1", nombre: "Prepaga", monto_ars: 266000, dueno: "personal", activo: true, orden: 1 },
    { id: "f2", nombre: "Expensas", monto_ars: 594000, dueno: "personal", activo: true, orden: 2 },
    { id: "f3", nombre: "Viejo", monto_ars: 100000, dueno: "personal", activo: false, orden: 3 },
    { id: "e1", nombre: "Claude", monto_ars: 300000, dueno: "empresa", activo: true, orden: 1 },
  ];
  const gastos: GastoVariable[] = [
    { id: "g1", fecha: "2026-05-26", concepto: "súper", monto: 30000, categoria: "Supermercado" },
    { id: "g2", fecha: "2026-06-02", concepto: "nafta", monto: 40000, categoria: "Combustible" },
    // fuera del ciclo (antes del inicio) — no debe contar
    { id: "g3", fecha: "2026-05-20", concepto: "viejo", monto: 99999, categoria: "Varios" },
  ];

  const r = calcularFinanzas({
    topePersonalMensual: 2800000,
    diaCierre: 25,
    hoy: ymd("2026-06-10"),
    fijos,
    gastosVariables: gastos,
  });

  it("suma solo fijos personales ACTIVOS", () => {
    expect(r.fijos_personal_total).toBe(860000); // 266000 + 594000 (el inactivo no cuenta)
    expect(r.fijos_personal).toHaveLength(2);
  });

  it("discrecional = tope − fijos personales", () => {
    expect(r.discrecional_mes).toBe(1940000); // 2800000 - 860000
  });

  it("software de la empresa va aparte, no resta", () => {
    expect(r.software_empresa.total).toBe(300000);
    expect(r.software_empresa.items).toHaveLength(1);
    expect(r.software_empresa.items[0]?.nombre).toBe("Claude");
  });

  it("gastado variable solo cuenta lo del ciclo (excluye fuera de rango)", () => {
    expect(r.gastado_variable).toBe(70000); // 30000 + 40000, NO el de 99999
    expect(r.por_categoria).toEqual({ Supermercado: 30000, Combustible: 40000 });
    expect(r.ultimos_gastos).toHaveLength(2);
  });

  it("ritmo semanal = diario proyectado al cierre × 7", () => {
    expect(r.ritmo_semanal).toBeCloseTo(r.por_dia_al_cierre * 7, 2);
  });
});
