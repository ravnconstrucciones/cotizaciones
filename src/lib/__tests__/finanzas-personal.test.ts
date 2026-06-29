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
  it("frase verde/amarillo lleva el diario y lo que queda", () => {
    const f = fraseDelDia(46181, 1246883, "verde");
    expect(f).toContain("Hoy podés gastar");
    expect(f).toContain("hasta el cierre");
  });
  it("frase roja avisa que se pasó del presupuesto del mes", () => {
    const f = fraseDelDia(-5000, -5000, "rojo");
    expect(f).toContain("Te pasaste del presupuesto del mes");
    expect(f).toContain("frená hasta el cierre");
  });
});

/**
 * Modelo "lo que queda ÷ días que faltan": el diario se recalcula solo.
 * Ciclo de 30 días (26 abr → 25 may, discrecional $600k, sin fijos). Gastar
 * temprano baja el diario de los días siguientes, pero nunca da rojo mientras
 * quede plata del mes.
 */
describe("calcularFinanzas — diario recalculado", () => {
  const baseFijos: FijoRow[] = [];
  const conGastos = (gastos: GastoVariable[], hoy: string) =>
    calcularFinanzas({
      topePersonalMensual: 600000,
      diaCierre: 25,
      hoy: ymd(hoy),
      fijos: baseFijos,
      gastosVariables: gastos,
    });

  it("día 1, sin gastos → $20k/día (600k / 30)", () => {
    const r = conGastos([], "2026-04-26");
    expect(r.asignacion_diaria).toBe(20000);
    expect(r.ciclo.dias_total).toBe(30);
    expect(r.dias_restantes).toBe(30);
    expect(r.disponible_ciclo).toBe(600000);
    expect(r.disponible_hoy).toBe(20000);
    expect(r.semaforo).toBe("verde"); // queda todo el mes
  });

  it("día 2, sin gastos → 600k / 29 días", () => {
    const r = conGastos([], "2026-04-27");
    expect(r.dias_restantes).toBe(29);
    expect(r.disponible_hoy).toBeCloseTo(600000 / 29, 2);
    expect(r.semaforo).toBe("verde");
  });

  it("día 3, gastó $50k → (600k−50k) / 28 días, sigue verde (no rojo)", () => {
    const r = conGastos(
      [{ id: "g1", fecha: "2026-04-28", concepto: "súper", monto: 50000, categoria: "Supermercado" }],
      "2026-04-28"
    );
    expect(r.gastado_variable).toBe(50000);
    expect(r.disponible_ciclo).toBe(550000);
    expect(r.disponible_hoy).toBeCloseTo(550000 / 28, 2);
    expect(r.semaforo).toBe("verde");
  });

  it("se comió TODO el discrecional → rojo de verdad", () => {
    const r = conGastos(
      [{ id: "g1", fecha: "2026-04-28", concepto: "se pasó", monto: 650000, categoria: "Varios" }],
      "2026-04-29"
    );
    expect(r.disponible_ciclo).toBe(-50000); // 600000 - 650000
    expect(r.semaforo).toBe("rojo");
    expect(r.proyeccion_fin_ciclo).toBe(-50000);
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

  it("ritmo semanal = diario recalculado × 7", () => {
    expect(r.ritmo_semanal).toBeCloseTo(r.disponible_hoy * 7, 2);
  });
});
