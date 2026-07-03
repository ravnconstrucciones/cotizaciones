import { formatMoneyInt, roundArs2 } from "@/lib/format-currency";

/**
 * Finanzas Personales — cálculo PURO del presupuesto personal de Eze.
 *
 * No se guarda nada día por día: el historial completo del ciclo se RECONSTRUYE
 * determinísticamente desde los gastos fechados (el código suma, la IA no —
 * igual que `salud-negocio.ts`). El modelo es "presupuesto del día":
 *
 *  - Al arrancar cada día, su presupuesto queda FIJADO: lo que quedaba del
 *    discrecional al inicio de ese día ÷ los días que faltaban (contándolo).
 *  - Cada gasto del día descuenta 1 a 1 de ese presupuesto → `disponible_hoy`
 *    es lo que te queda HOY, en vivo, y puede quedar negativo (día en rojo).
 *  - Al día siguiente el contador se renueva: se reparte lo que quedó entre
 *    los días que faltan (prorrateo vivo — un día rojo baja el diario de
 *    mañana, no te mata).
 *
 * Dos mundos en una sola tarjeta: lo personal (suma al gasto) y el software de
 * la empresa (`dueno='empresa'`, etiquetado e informativo, NO entra a ningún
 * cálculo personal). El ciclo es el de la tarjeta (del 26 al 25), no el mes
 * calendario: el acumulado se resetea el día de cierre.
 */

export type SemaforoFin = "verde" | "amarillo" | "rojo";

/** Fecha sin hora, mes 1-12. Se calcula en zona BA antes de entrar acá. */
export type FechaYMD = { year: number; month: number; day: number };

export type FijoRow = {
  id: string;
  nombre: string;
  monto_ars: number;
  dueno: string; // 'personal' | 'empresa'
  activo: boolean;
  orden: number;
};

export type GastoVariable = {
  id: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  monto: number;
  categoria: string;
};

export type Ciclo = {
  inicio: string; // YYYY-MM-DD inclusive
  fin: string; // YYYY-MM-DD inclusive
  dia_actual: number; // días transcurridos del ciclo, contando hoy (1..dias_total)
  dias_total: number; // largo del ciclo (28–31)
  label: string; // "26 may → 25 jun"
};

/** Un día del ciclo, reconstruido desde los gastos fechados. */
export type DiaCiclo = {
  fecha: string; // YYYY-MM-DD
  dia_ciclo: number; // 1..dias_total
  /** Fijado al arrancar el día: lo que quedaba ÷ días que faltaban (contándolo). */
  presupuesto: number;
  gastado: number;
  saldo: number; // presupuesto − gastado (negativo = te pasaste ese día)
  estado: "verde" | "rojo" | "hoy" | "futuro";
  gastos: GastoVariable[];
};

export type FinanzasResumen = {
  ciclo: Ciclo;
  tope_personal_mensual: number;
  fijos_personal_total: number;
  discrecional_mes: number;
  asignacion_diaria: number;
  gastado_variable: number;
  dias_restantes: number;
  disponible_ciclo: number;
  /** Presupuesto de HOY, fijado al arrancar el día (no baja por gastar hoy). */
  presupuesto_hoy: number;
  /** Lo gastado HOY. */
  gastado_hoy: number;
  /** Lo que te queda HOY, en vivo: presupuesto_hoy − gastado_hoy (puede ser negativo). */
  disponible_hoy: number;
  /** Lo que queda del ciclo ÷ días restantes — el diario proyectado hacia adelante. */
  por_dia_al_cierre: number;
  ritmo_semanal: number;
  proyeccion_fin_ciclo: number;
  semaforo: SemaforoFin;
  dias: DiaCiclo[];
  fijos_personal: { id: string; nombre: string; monto_ars: number; orden: number }[];
  software_empresa: { total: number; items: { id: string; nombre: string; monto_ars: number }[] };
  por_categoria: Record<string, number>;
  ultimos_gastos: GastoVariable[];
};

const MS_DIA = 86_400_000;

const MESES_ABR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Días que tiene un mes (month 1-12). Day 0 del mes siguiente = último día. */
function diasEnMes(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function ymdToUTC(f: FechaYMD): number {
  return Date.UTC(f.year, f.month - 1, f.day);
}

function utcToYmd(ms: number): FechaYMD {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function isoDe(f: FechaYMD): string {
  const mm = String(f.month).padStart(2, "0");
  const dd = String(f.day).padStart(2, "0");
  return `${f.year}-${mm}-${dd}`;
}

function fmtDiaMes(f: FechaYMD): string {
  return `${f.day} ${MESES_ABR[f.month - 1]}`;
}

/** El día de cierre de un mes, clampeado al último día (por si dia_cierre > largo). */
function cierreDe(year: number, month: number, diaCierre: number): FechaYMD {
  return { year, month, day: Math.min(diaCierre, diasEnMes(year, month)) };
}

function mesAnterior(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function mesSiguiente(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Ciclo de la tarjeta a partir del día de cierre.
 *
 * Un ciclo está acotado por dos cierres consecutivos: termina el día de cierre
 * (clampeado al mes) y arranca el día SIGUIENTE al cierre del mes anterior. Si
 * hoy ya pasó el cierre de este mes, el ciclo en curso cierra el mes que viene.
 *
 * Se trabaja en ms UTC para que el "+1 día" cruce fin de mes sin sufrir TZ ni
 * meses de distinta longitud (febrero incluido). `hoy` ya viene en zona BA.
 */
export function calcularCiclo(hoy: FechaYMD, diaCierre: number): Ciclo {
  const cierreEsteMes = cierreDe(hoy.year, hoy.month, diaCierre);
  // Mes en el que cierra el ciclo en curso.
  const finYM =
    hoy.day <= cierreEsteMes.day
      ? { year: hoy.year, month: hoy.month }
      : mesSiguiente(hoy.year, hoy.month);

  const fin = cierreDe(finYM.year, finYM.month, diaCierre);
  const prev = mesAnterior(finYM.year, finYM.month);
  const cierrePrev = cierreDe(prev.year, prev.month, diaCierre);

  const inicioMs = ymdToUTC(cierrePrev) + MS_DIA; // día siguiente al cierre anterior
  const finMs = ymdToUTC(fin);
  const hoyMs = ymdToUTC(hoy);

  const inicio = utcToYmd(inicioMs);
  const diasTotal = Math.round((finMs - inicioMs) / MS_DIA) + 1;
  const diaActual = Math.round((hoyMs - inicioMs) / MS_DIA) + 1;

  return {
    inicio: isoDe(inicio),
    fin: isoDe(fin),
    dia_actual: diaActual,
    dias_total: diasTotal,
    label: `${fmtDiaMes(inicio)} → ${fmtDiaMes(fin)}`,
  };
}

/**
 * Semáforo sobre lo que queda del ciclo (no sobre el ritmo de un día):
 *  - disponible_ciclo < 0           → rojo (te comiste todo el discrecional del mes).
 *  - < 3 días de asignación de aire  → amarillo (te estás quedando corto, cuidá el cierre).
 *  - resto                          → verde (tenés plata de sobra hasta el cierre).
 *
 * La idea: mientras te quede presupuesto del mes, NUNCA es rojo aunque hayas
 * arrancado gastando fuerte — el diario se recalcula solo con lo que queda.
 */
export function semaforoDe(disponibleCiclo: number, asignacionDiaria: number): SemaforoFin {
  if (disponibleCiclo < 0) return "rojo";
  if (disponibleCiclo < asignacionDiaria * 3) return "amarillo";
  return "verde";
}

/** Días que tarda en recuperarse el rojo (cada día sin gastar suma la asignación). */
export function diasParaRecuperar(disponibleHoy: number, asignacionDiaria: number): number {
  if (disponibleHoy >= 0 || asignacionDiaria <= 0) return 0;
  return Math.ceil(Math.abs(disponibleHoy) / asignacionDiaria);
}

/** Frase lista para el bot de WhatsApp ("¿cuánto puedo gastar hoy?"). */
export function fraseDelDia(
  disponibleHoy: number,
  disponibleCiclo: number,
  semaforo: SemaforoFin
): string {
  if (semaforo === "rojo") {
    return `Te pasaste del presupuesto del mes por ${formatMoneyInt(Math.abs(disponibleCiclo))}, frená hasta el cierre`;
  }
  if (disponibleHoy < 0) {
    return `Hoy ya te pasaste por ${formatMoneyInt(Math.abs(disponibleHoy))} — mañana se renueva el contador · te quedan ${formatMoneyInt(disponibleCiclo)} hasta el cierre`;
  }
  return `Hoy te quedan ${formatMoneyInt(disponibleHoy)} · ${formatMoneyInt(disponibleCiclo)} hasta el cierre`;
}

/** ¿La fecha (YYYY-MM-DD) cae dentro del ciclo, bordes inclusive? */
function dentroDelCiclo(fechaIso: string, ciclo: Ciclo): boolean {
  const f = fechaIso.slice(0, 10);
  return f >= ciclo.inicio && f <= ciclo.fin;
}

export type FinanzasInput = {
  topePersonalMensual: number;
  diaCierre: number;
  hoy: FechaYMD;
  fijos: FijoRow[];
  /** Gastos variables (gastos_personales). Se filtran al ciclo acá adentro. */
  gastosVariables: GastoVariable[];
};

/**
 * El motor completo: de la config + fijos + gastos del ciclo a la foto del
 * presupuesto personal. Todo determinístico y testeable (sin IO).
 */
export function calcularFinanzas(input: FinanzasInput): FinanzasResumen {
  const ciclo = calcularCiclo(input.hoy, input.diaCierre);

  // Fijos: separar lo personal (resta del discrecional) del software de la
  // empresa (solo informativo). Solo cuentan los activos.
  const activos = input.fijos.filter((f) => f.activo);
  const fijosPersonal = activos
    .filter((f) => f.dueno === "personal")
    .sort((a, b) => a.orden - b.orden);
  const fijosEmpresa = activos
    .filter((f) => f.dueno === "empresa")
    .sort((a, b) => a.orden - b.orden);

  const fijosPersonalTotal = roundArs2(
    fijosPersonal.reduce((acc, f) => acc + Number(f.monto_ars || 0), 0)
  );
  const softwareTotal = roundArs2(
    fijosEmpresa.reduce((acc, f) => acc + Number(f.monto_ars || 0), 0)
  );

  const topePersonalMensual = roundArs2(Math.max(0, input.topePersonalMensual));
  const discrecionalMes = roundArs2(topePersonalMensual - fijosPersonalTotal);
  const asignacionDiaria =
    ciclo.dias_total > 0 ? roundArs2(discrecionalMes / ciclo.dias_total) : 0;

  // Gastos variables del CICLO (no del mes calendario).
  const gastosCiclo = input.gastosVariables.filter((g) =>
    dentroDelCiclo(g.fecha, ciclo)
  );

  const gastadoVariable = roundArs2(
    gastosCiclo.reduce((acc, g) => acc + Number(g.monto || 0), 0)
  );

  const porCategoria: Record<string, number> = {};
  for (const g of gastosCiclo) {
    const cat = g.categoria || "Varios";
    porCategoria[cat] = roundArs2((porCategoria[cat] ?? 0) + Number(g.monto || 0));
  }

  // Lo que QUEDA del ciclo (lo que no gastaste del discrecional). Es el número
  // tranquilizador: mientras sea positivo, tenés plata hasta el cierre.
  const disponibleCiclo = roundArs2(discrecionalMes - gastadoVariable);
  const diasRestantes = Math.max(1, ciclo.dias_total - ciclo.dia_actual + 1);
  // El diario proyectado hacia adelante: lo que queda repartido en lo que falta.
  const porDiaAlCierre = roundArs2(disponibleCiclo / diasRestantes);

  // ── Reconstrucción día por día ──
  // Se camina el ciclo desde el día 1: el presupuesto de cada día queda fijado
  // con lo que quedaba al ARRANCAR ese día ÷ los días que faltaban (contándolo),
  // y lo gastado ese día descuenta 1 a 1. Un día que ya cerró es verde si le
  // sobró y rojo si se pasó; el sobrante/faltante fluye solo al prorrateo de
  // los días siguientes.
  const gastosPorFecha = new Map<string, GastoVariable[]>();
  for (const g of gastosCiclo) {
    const f = g.fecha.slice(0, 10);
    const lista = gastosPorFecha.get(f);
    if (lista) lista.push(g);
    else gastosPorFecha.set(f, [g]);
  }

  const [iy, im, id] = ciclo.inicio.split("-").map(Number);
  const inicioMs = ymdToUTC({ year: iy, month: im, day: id });

  const dias: DiaCiclo[] = [];
  let restante = discrecionalMes;
  let presupuestoHoy = 0;
  let gastadoHoy = 0;

  for (let d = 1; d <= ciclo.dia_actual; d++) {
    const fecha = isoDe(utcToYmd(inicioMs + (d - 1) * MS_DIA));
    const gastosDia = gastosPorFecha.get(fecha) ?? [];
    const gastadoDia = roundArs2(
      gastosDia.reduce((acc, g) => acc + Number(g.monto || 0), 0)
    );
    // Si el ciclo ya está reventado, el presupuesto del día es 0 (no negativo).
    const presupuestoDia = roundArs2(
      Math.max(0, restante) / (ciclo.dias_total - d + 1)
    );
    const saldoDia = roundArs2(presupuestoDia - gastadoDia);
    const esHoy = d === ciclo.dia_actual;
    dias.push({
      fecha,
      dia_ciclo: d,
      presupuesto: presupuestoDia,
      gastado: gastadoDia,
      saldo: saldoDia,
      estado: esHoy ? "hoy" : saldoDia >= 0 ? "verde" : "rojo",
      gastos: gastosDia,
    });
    if (esHoy) {
      presupuestoHoy = presupuestoDia;
      gastadoHoy = gastadoDia;
    }
    restante = roundArs2(restante - gastadoDia);
  }

  // Días futuros: proyección pareja de lo que queda (si no gastás más hoy).
  const diasFuturos = ciclo.dias_total - ciclo.dia_actual;
  const proyectadoFuturo =
    diasFuturos > 0 ? roundArs2(Math.max(0, disponibleCiclo) / diasFuturos) : 0;
  for (let d = ciclo.dia_actual + 1; d <= ciclo.dias_total; d++) {
    const fecha = isoDe(utcToYmd(inicioMs + (d - 1) * MS_DIA));
    dias.push({
      fecha,
      dia_ciclo: d,
      presupuesto: proyectadoFuturo,
      gastado: 0,
      saldo: proyectadoFuturo,
      estado: "futuro",
      gastos: [],
    });
  }

  // Lo que te queda HOY, en vivo: el presupuesto fijado al arrancar el día
  // menos lo que ya gastaste hoy. Negativo = hoy quedaste en rojo (mañana se
  // renueva el contador con el prorrateo).
  const disponibleHoy = roundArs2(presupuestoHoy - gastadoHoy);
  const ritmoSemanal = roundArs2(porDiaAlCierre * 7);
  const proyeccionFinCiclo = disponibleCiclo;
  const semaforo = semaforoDe(disponibleCiclo, asignacionDiaria);

  return {
    ciclo,
    tope_personal_mensual: topePersonalMensual,
    fijos_personal_total: fijosPersonalTotal,
    discrecional_mes: discrecionalMes,
    asignacion_diaria: asignacionDiaria,
    gastado_variable: gastadoVariable,
    dias_restantes: diasRestantes,
    disponible_ciclo: disponibleCiclo,
    presupuesto_hoy: presupuestoHoy,
    gastado_hoy: gastadoHoy,
    disponible_hoy: disponibleHoy,
    por_dia_al_cierre: porDiaAlCierre,
    ritmo_semanal: ritmoSemanal,
    proyeccion_fin_ciclo: proyeccionFinCiclo,
    semaforo,
    dias,
    fijos_personal: fijosPersonal.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      monto_ars: roundArs2(Number(f.monto_ars || 0)),
      orden: f.orden,
    })),
    software_empresa: {
      total: softwareTotal,
      items: fijosEmpresa.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        monto_ars: roundArs2(Number(f.monto_ars || 0)),
      })),
    },
    por_categoria: porCategoria,
    ultimos_gastos: gastosCiclo.slice(0, 30),
  };
}
