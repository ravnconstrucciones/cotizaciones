import { roundArs2 } from "@/lib/format-currency";

export type CashflowTipo = "ingreso" | "egreso";

export type CashflowItemRow = {
  id: string;
  obra_id: string;
  tipo: CashflowTipo;
  categoria: string;
  descripcion: string;
  monto_proyectado: number;
  fecha_proyectada: string;
  monto_real: number | null;
  fecha_real: string | null;
  estado: string;
  notas: string;
};

export function todayBuenosAires(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function parseNum(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function signedMonto(tipo: CashflowTipo, monto: number): number {
  return roundArs2(tipo === "ingreso" ? monto : -monto);
}

/** Saldo acumulado solo con movimientos reales hasta la fecha (inclusive). */
export function saldoRealEnFecha(items: CashflowItemRow[], fechaIso: string): number {
  const ev: { f: string; d: number }[] = [];
  for (const it of items) {
    if (it.monto_real == null || it.fecha_real == null) continue;
    const mr = parseNum(it.monto_real);
    if (mr <= 0) continue;
    if (it.fecha_real > fechaIso) continue;
    ev.push({ f: it.fecha_real, d: signedMonto(it.tipo, mr) });
  }
  ev.sort((a, b) => a.f.localeCompare(b.f));
  let s = 0;
  for (const e of ev) s = roundArs2(s + e.d);
  return s;
}

/**
 * Saldo de caja "mixto" al cierre del día: lo ejecutado con montos reales;
 * lo pendiente cuenta con monto y fecha proyectados.
 */
export function saldoMixtoEnFecha(items: CashflowItemRow[], fechaIso: string): number {
  let s = 0;
  for (const it of items) {
    const mp = roundArs2(parseNum(it.monto_proyectado));
    const mr =
      it.monto_real != null && it.fecha_real != null
        ? roundArs2(parseNum(it.monto_real))
        : null;
    const fr = it.fecha_real;
    if (mr != null && fr != null && fr <= fechaIso) {
      s = roundArs2(s + signedMonto(it.tipo, mr));
    } else if (it.fecha_proyectada <= fechaIso) {
      s = roundArs2(s + signedMonto(it.tipo, mp));
    }
  }
  return s;
}

export type SemaforoCashflow = "verde" | "amarillo" | "rojo";

export function semaforoDesdeSaldos(
  mixto7: number,
  mixto30: number
): SemaforoCashflow {
  if (mixto7 >= 0) return "verde";
  if (mixto30 >= 0) return "amarillo";
  return "rojo";
}

/** Saldo proyectado acumulado: suma movimientos con fecha_proyectada <= fecha (solo monto_proyectado). */
export function saldoProyectadoAcumuladoHasta(
  items: CashflowItemRow[],
  fechaIso: string
): number {
  let s = 0;
  for (const it of items) {
    if (it.fecha_proyectada > fechaIso) continue;
    s = roundArs2(
      s + signedMonto(it.tipo, roundArs2(parseNum(it.monto_proyectado)))
    );
  }
  return roundArs2(s);
}

export type PuntoSaldoSerie = { fecha: string; proyectado: number; real: number };

/** Saldo de libreta (caja directa): ingresos reales − egresos reales, sin filtrar por fecha. */
export function saldoCajaTotal(items: CashflowItemRow[]): number {
  return totalesReales(items).neto;
}

export type PuntoSaldoLibreta = { fecha: string; saldo: number };

/** Serie diaria de saldo acumulado solo con movimientos reales (caja directa). */
export function serieSaldoLibreta(
  items: CashflowItemRow[],
  desdeIso: string,
  hastaIso: string
): PuntoSaldoLibreta[] {
  return serieSaldoAcumulado(items, desdeIso, hastaIso).map((p) => ({
    fecha: p.fecha,
    saldo: p.real,
  }));
}

export type PuntoSaldoObraChart = {
  fecha: string;
  saldo: number;
  /** Ingresos reales acumulados (cobranzas) hasta cada fecha. */
  ingresos_acum: number;
};

/** Saldo de caja + ingresos acumulados en la misma grilla de fechas (avance vs propuesta). */
export function serieSaldoObraChart(
  items: CashflowItemRow[],
  desdeIso: string,
  hastaIso: string
): PuntoSaldoObraChart[] {
  const saldo = serieSaldoLibreta(items, desdeIso, hastaIso);
  const ing = serieIngresosAcumuladoReales(items, desdeIso, hastaIso);
  return saldo.map((p, i) => ({
    fecha: p.fecha,
    saldo: p.saldo,
    ingresos_acum: ing[i]?.ingresos_acum ?? 0,
  }));
}

/** Ingresos con monto y fecha real acumulados por día (solo cobranzas). */
export function serieIngresosAcumuladoReales(
  items: CashflowItemRow[],
  desdeIso: string,
  hastaIso: string
): { fecha: string; ingresos_acum: number }[] {
  const out: { fecha: string; ingresos_acum: number }[] = [];
  let f = desdeIso;
  while (f <= hastaIso) {
    let acum = 0;
    for (const it of items) {
      if (it.tipo !== "ingreso") continue;
      if (it.monto_real == null || it.fecha_real == null) continue;
      if (it.fecha_real <= f) {
        acum = roundArs2(acum + roundArs2(parseNum(it.monto_real)));
      }
    }
    out.push({ fecha: f, ingresos_acum: acum });
    f = addDaysIso(f, 1);
  }
  return out;
}

/** Serie diaria de saldos acumulados (proyectado vs real), entre fechas inclusive. */
export function serieSaldoAcumulado(
  items: CashflowItemRow[],
  desdeIso: string,
  hastaIso: string
): PuntoSaldoSerie[] {
  const out: PuntoSaldoSerie[] = [];
  let f = desdeIso;
  while (f <= hastaIso) {
    let proj = 0;
    let real = 0;
    const evP: { f: string; d: number }[] = [];
    const evR: { f: string; d: number }[] = [];
    for (const it of items) {
      const mp = roundArs2(parseNum(it.monto_proyectado));
      evP.push({ f: it.fecha_proyectada, d: signedMonto(it.tipo, mp) });
      if (it.monto_real != null && it.fecha_real != null) {
        const mr = roundArs2(parseNum(it.monto_real));
        evR.push({ f: it.fecha_real, d: signedMonto(it.tipo, mr) });
      }
    }
    evP.sort((a, b) => a.f.localeCompare(b.f));
    evR.sort((a, b) => a.f.localeCompare(b.f));
    for (const e of evP) {
      if (e.f <= f) proj = roundArs2(proj + e.d);
    }
    for (const e of evR) {
      if (e.f <= f) real = roundArs2(real + e.d);
    }
    out.push({ fecha: f, proyectado: proj, real });
    f = addDaysIso(f, 1);
  }
  return out;
}

/** Totales de ingreso/egreso con montos proyectados (toda la obra). */
export function totalesProyectados(items: CashflowItemRow[]): {
  ingresos: number;
  egresos: number;
  neto: number;
} {
  let ing = 0;
  let egr = 0;
  for (const it of items) {
    const mp = roundArs2(parseNum(it.monto_proyectado));
    if (it.tipo === "ingreso") ing = roundArs2(ing + mp);
    else egr = roundArs2(egr + mp);
  }
  return { ingresos: ing, egresos: egr, neto: roundArs2(ing - egr) };
}

/** Suma de movimientos reales registrados (solo líneas con monto y fecha real). */
export function totalesReales(items: CashflowItemRow[]): {
  ingresos: number;
  egresos: number;
  neto: number;
} {
  let ing = 0;
  let egr = 0;
  for (const it of items) {
    if (it.monto_real == null || it.fecha_real == null) continue;
    const mr = roundArs2(parseNum(it.monto_real));
    if (it.tipo === "ingreso") ing = roundArs2(ing + mr);
    else egr = roundArs2(egr + mr);
  }
  return { ingresos: ing, egresos: egr, neto: roundArs2(ing - egr) };
}

export type EventoProximo = {
  id: string;
  obra_id: string;
  presupuesto_id: string | null;
  nombreObra: string;
  tipo: CashflowTipo;
  categoria: string;
  descripcion: string;
  fechaReferencia: string;
  montoMostrado: number;
  esProyectado: boolean;
};

/** Cobros y pagos con fecha de referencia en [hoy, hoy+14] (fecha proyectada si aún no hay real). */
export function eventosProximos14Dias(
  items: CashflowItemRow[],
  metaPorObraId: Map<
    string,
    { presupuesto_id: string; nombreObra: string }
  >,
  hoyIso: string
): EventoProximo[] {
  const hasta = addDaysIso(hoyIso, 14);
  const list: EventoProximo[] = [];
  for (const it of items) {
    const ref =
      it.monto_real != null && it.fecha_real != null
        ? it.fecha_real
        : it.fecha_proyectada;
    if (ref < hoyIso || ref > hasta) continue;
    const meta = metaPorObraId.get(it.obra_id);
    const montoMostrado =
      it.monto_real != null && it.fecha_real != null
        ? roundArs2(parseNum(it.monto_real))
        : roundArs2(parseNum(it.monto_proyectado));
    list.push({
      id: it.id,
      obra_id: it.obra_id,
      presupuesto_id: meta?.presupuesto_id ?? null,
      nombreObra: meta?.nombreObra ?? "Obra",
      tipo: it.tipo,
      categoria: it.categoria,
      descripcion: it.descripcion,
      fechaReferencia: ref,
      montoMostrado,
      esProyectado: !(it.monto_real != null && it.fecha_real != null),
    });
  }
  list.sort((a, b) => {
    const c = a.fechaReferencia.localeCompare(b.fechaReferencia);
    if (c !== 0) return c;
    return a.descripcion.localeCompare(b.descripcion);
  });
  return list;
}
