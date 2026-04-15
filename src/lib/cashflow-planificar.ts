import { roundArs2 } from "@/lib/format-currency";
import { addDaysIso } from "@/lib/cashflow-compute";

export type LineaPresupuestoCosto = {
  descripcion: string;
  monto: number;
};

export type PlanIngresoFila = {
  clave: "anticipo" | "cuota_1" | "cuota_2" | "cuota_final";
  categoria: "anticipo" | "cuota_avance" | "cuota_final";
  descripcion: string;
  porcentaje: number;
  monto: number;
  fecha_proyectada: string;
};

export function repartirPorcentajesIngresos(
  pctAnticipo: number,
  pctCuota1: number,
  pctCuota2: number,
  totalArs: number,
  hoyIso: string,
  diasCuota1: number,
  diasCuota2: number,
  diasFinal: number
): PlanIngresoFila[] {
  const t = roundArs2(Math.max(0, totalArs));
  const pA = Math.min(100, Math.max(0, pctAnticipo));
  const p1 = Math.min(100, Math.max(0, pctCuota1));
  const p2 = Math.min(100, Math.max(0, pctCuota2));
  const pF = Math.max(0, 100 - pA - p1 - p2);
  const mAnt = roundArs2(t * (pA / 100));
  const m1 = roundArs2(t * (p1 / 100));
  const m2 = roundArs2(t * (p2 / 100));
  const mF = roundArs2(t - mAnt - m1 - m2);
  return [
    {
      clave: "anticipo",
      categoria: "anticipo",
      descripcion: "Anticipo",
      porcentaje: pA,
      monto: mAnt,
      fecha_proyectada: hoyIso,
    },
    {
      clave: "cuota_1",
      categoria: "cuota_avance",
      descripcion: "Cuota 1 por avance",
      porcentaje: p1,
      monto: m1,
      fecha_proyectada: addDaysIso(hoyIso, diasCuota1),
    },
    {
      clave: "cuota_2",
      categoria: "cuota_avance",
      descripcion: "Cuota 2 por avance",
      porcentaje: p2,
      monto: m2,
      fecha_proyectada: addDaysIso(hoyIso, diasCuota2),
    },
    {
      clave: "cuota_final",
      categoria: "cuota_final",
      descripcion: "Cuota final",
      porcentaje: pF,
      monto: mF,
      fecha_proyectada: addDaysIso(hoyIso, diasFinal),
    },
  ];
}

/** Fechas de egreso por línea de presupuesto entre día 10 y día 80 del plan. */
export function fechasEgresosDistribuidas(
  hoyIso: string,
  cantidadLineas: number
): string[] {
  const n = Math.max(1, cantidadLineas);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const dias = Math.round(10 + ((i + 1) * 70) / (n + 1));
    out.push(addDaysIso(hoyIso, Math.min(80, Math.max(10, dias))));
  }
  return out;
}
