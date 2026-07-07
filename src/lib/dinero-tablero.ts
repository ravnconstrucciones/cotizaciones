import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import type { DuenoTipo } from "@/lib/dinero";
import type { Moneda } from "@/lib/cuentas";

/**
 * Módulo DINERO — matemática PURA del tablero (Fase 3, spec 2026-07-06).
 * La pantalla /dinero y la card de la home consumen estas funciones; acá no
 * hay fetch ni Supabase, solo agregación sobre lo que devuelve /api/dinero.
 * Los `numeric` de Supabase llegan como string → parseNum en cada borde.
 */

/** Fila de la vista dinero_saldos_bolsillos (saldo vivo por cuenta × dueño). */
export type BolsilloVista = {
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  moneda: Moneda;
  saldo: unknown;
  movimientos: number;
};

export type FinanciamientoVista = {
  id: string;
  deudor_tipo: DuenoTipo;
  deudor_obra_id: string | null;
  acreedor_tipo: DuenoTipo;
  acreedor_obra_id: string | null;
  monto_original: unknown;
  saldo_pendiente: unknown;
  moneda: Moneda;
  estado: "abierto" | "devuelto" | "absorbido";
  notas: string;
  created_at: string;
};

/** Pata borrador del ledger (operación del bot sin confirmar). */
export type BorradorVista = {
  id: string;
  grupo_id: string;
  fecha: string;
  cuenta_id: string;
  dueno_tipo: DuenoTipo;
  dueno_obra_id: string | null;
  monto: unknown;
  moneda: Moneda;
  origen_tipo: string;
  descripcion: string;
  created_at: string;
};

export type TotalMoneda = { ars: number; usd: number };
export type TotalesPorDueno = Record<DuenoTipo, TotalMoneda>;

/** De quién es la plata: Σ bolsillos por dueño, pesos y dólares aparte. */
export function totalesPorDueno(bolsillos: BolsilloVista[]): TotalesPorDueno {
  const t: TotalesPorDueno = {
    obra: { ars: 0, usd: 0 },
    empresa: { ars: 0, usd: 0 },
    personal: { ars: 0, usd: 0 },
  };
  for (const b of bolsillos) {
    const clave = b.moneda === "USD" ? "usd" : "ars";
    t[b.dueno_tipo][clave] = roundArs2(t[b.dueno_tipo][clave] + parseNum(b.saldo));
  }
  return t;
}

/** Bolsillos de cada cuenta, los de más plata primero. */
export function bolsillosPorCuenta(
  bolsillos: BolsilloVista[]
): Map<string, BolsilloVista[]> {
  const porCuenta = new Map<string, BolsilloVista[]>();
  for (const b of bolsillos) {
    const lista = porCuenta.get(b.cuenta_id) ?? [];
    lista.push(b);
    porCuenta.set(b.cuenta_id, lista);
  }
  for (const lista of porCuenta.values()) {
    lista.sort((a, z) => parseNum(z.saldo) - parseNum(a.saldo));
  }
  return porCuenta;
}

export type DivergenciaCuenta = {
  cuenta_id: string;
  saldoLedger: number;
  saldoMotor: number;
  delta: number;
};

/**
 * "A conciliar": cuentas donde el ledger no coincide con el motor actual.
 * Solo se comparan cuentas que el ledger conoce (paridad chequeoConsistencia).
 */
export function divergenciasContraMotor(
  bolsillos: BolsilloVista[],
  saldosMotor: Array<{ id: string; saldo: number }>
): DivergenciaCuenta[] {
  const ledger = new Map<string, number>();
  for (const b of bolsillos) {
    ledger.set(b.cuenta_id, roundArs2((ledger.get(b.cuenta_id) ?? 0) + parseNum(b.saldo)));
  }
  const divergencias: DivergenciaCuenta[] = [];
  for (const c of saldosMotor) {
    const saldoLedger = ledger.get(c.id);
    if (saldoLedger === undefined) continue;
    const delta = roundArs2(saldoLedger - c.saldo);
    if (delta !== 0) {
      divergencias.push({ cuenta_id: c.id, saldoLedger, saldoMotor: c.saldo, delta });
    }
  }
  return divergencias;
}

export type DeudaVista = {
  id: string;
  deudor_tipo: DuenoTipo;
  deudor_obra_id: string | null;
  acreedor_tipo: DuenoTipo;
  acreedor_obra_id: string | null;
  montoOriginal: number;
  saldoPendiente: number;
  moneda: Moneda;
  estado: "abierto" | "devuelto" | "absorbido";
  notas: string;
  /** Días desde que nació la deuda (antigüedad, spec §Tablero). */
  dias: number;
};

const MS_DIA = 24 * 60 * 60 * 1000;

/** Deudas con antigüedad en días; abiertas primero, la más vieja arriba. */
export function deudasConAntiguedad(
  financiamientos: FinanciamientoVista[],
  ahoraMs: number
): DeudaVista[] {
  return financiamientos
    .map((f) => ({
      id: f.id,
      deudor_tipo: f.deudor_tipo,
      deudor_obra_id: f.deudor_obra_id,
      acreedor_tipo: f.acreedor_tipo,
      acreedor_obra_id: f.acreedor_obra_id,
      montoOriginal: roundArs2(parseNum(f.monto_original)),
      saldoPendiente: roundArs2(parseNum(f.saldo_pendiente)),
      moneda: f.moneda,
      estado: f.estado,
      notas: f.notas,
      dias: Math.max(0, Math.floor((ahoraMs - Date.parse(f.created_at)) / MS_DIA)),
    }))
    .sort((a, z) => {
      if ((a.estado === "abierto") !== (z.estado === "abierto")) {
        return a.estado === "abierto" ? -1 : 1;
      }
      return z.dias - a.dias;
    });
}

export type GrupoBorrador = {
  grupo_id: string;
  fecha: string;
  descripcion: string;
  origen_tipo: string;
  patas: number;
  /** Plata que mueve el grupo: Σ |monto| por moneda (magnitud, no neto). */
  totalArs: number;
  totalUsd: number;
  created_at: string;
};

/** Borradores del bot agrupados por operación (grupo_id), el último primero. */
export function borradoresAgrupados(borradores: BorradorVista[]): GrupoBorrador[] {
  const porGrupo = new Map<string, GrupoBorrador>();
  for (const b of borradores) {
    const g = porGrupo.get(b.grupo_id) ?? {
      grupo_id: b.grupo_id,
      fecha: b.fecha,
      descripcion: b.descripcion,
      origen_tipo: b.origen_tipo,
      patas: 0,
      totalArs: 0,
      totalUsd: 0,
      created_at: b.created_at,
    };
    g.patas += 1;
    if (!g.descripcion && b.descripcion) g.descripcion = b.descripcion;
    const monto = Math.abs(parseNum(b.monto));
    if (b.moneda === "USD") g.totalUsd = roundArs2(g.totalUsd + monto);
    else g.totalArs = roundArs2(g.totalArs + monto);
    if (b.created_at > g.created_at) g.created_at = b.created_at;
    porGrupo.set(b.grupo_id, g);
  }
  return [...porGrupo.values()].sort((a, z) =>
    z.created_at.localeCompare(a.created_at)
  );
}

export type ComposicionObra = {
  obra_id: string;
  costo: number;
  /** Cuánto del costo lo puso cada dueño ajeno (solo ARS, spec §Tablero). */
  financiado: Array<{
    acreedor_tipo: DuenoTipo;
    acreedor_obra_id: string | null;
    monto: number;
  }>;
  financiadoTotal: number;
  pctPropio: number;
};

/**
 * Composición del costo de cada obra deudora: % caja propia vs financiado
 * por otras obras / RAVN / Eze. Solo financiamientos en ARS (los USD se ven
 * en el libro de deudas; mezclar monedas acá daría un % mentiroso).
 */
export function composicionPorObra(
  financiamientos: FinanciamientoVista[],
  costosPorObra: Record<string, number>
): ComposicionObra[] {
  const porObra = new Map<string, ComposicionObra>();
  for (const f of financiamientos) {
    if (f.deudor_tipo !== "obra" || !f.deudor_obra_id) continue;
    if (f.moneda !== "ARS") continue;
    const costo = roundArs2(parseNum(costosPorObra[f.deudor_obra_id]));
    const c = porObra.get(f.deudor_obra_id) ?? {
      obra_id: f.deudor_obra_id,
      costo,
      financiado: [],
      financiadoTotal: 0,
      pctPropio: 1,
    };
    const monto = roundArs2(parseNum(f.monto_original));
    const clave = `${f.acreedor_tipo}|${f.acreedor_obra_id ?? ""}`;
    const previo = c.financiado.find(
      (x) => `${x.acreedor_tipo}|${x.acreedor_obra_id ?? ""}` === clave
    );
    if (previo) previo.monto = roundArs2(previo.monto + monto);
    else
      c.financiado.push({
        acreedor_tipo: f.acreedor_tipo,
        acreedor_obra_id: f.acreedor_obra_id,
        monto,
      });
    c.financiadoTotal = roundArs2(c.financiadoTotal + monto);
    porObra.set(f.deudor_obra_id, c);
  }
  for (const c of porObra.values()) {
    c.financiado.sort((a, z) => z.monto - a.monto);
    c.pctPropio =
      c.costo > 0 ? Math.max(0, roundArs2((c.costo - c.financiadoTotal) / c.costo)) : 0;
  }
  return [...porObra.values()].sort((a, z) => z.financiadoTotal - a.financiadoTotal);
}

/** Etiqueta corta de un dueño para el tablero ("RAVN", "Eze" o la obra). */
export function nombreDueno(
  tipo: DuenoTipo,
  obraId: string | null,
  obras: Record<string, string>
): string {
  if (tipo === "empresa") return "RAVN";
  if (tipo === "personal") return "Eze";
  return (obraId && obras[obraId]) || "Obra sin nombre";
}
