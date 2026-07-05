import { parseNum } from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";

/**
 * Sistema de CUENTAS (02/07/2026) — dónde está la plata físicamente.
 *
 * El saldo de cada cuenta se DERIVA: saldo_inicial (la foto que pasó Eze el
 * 02/07) + los movimientos que tienen cuenta_id asignada. Los movimientos
 * viejos quedan "sin asignar" (cuenta_id null) y no tocan ningún saldo — el
 * punto de partida es la foto, no la historia. El código suma; la IA no.
 */

export type Moneda = "ARS" | "USD";
export type Procedencia = "propia" | "obra";

export type Cuenta = {
  id: string;
  nombre: string;
  moneda: Moneda;
  saldo_inicial: number;
  fecha_saldo_inicial: string;
  procedencia: Procedencia;
  activa: boolean;
  orden: number;
  notas?: string;
  /** Cuenta espejo de reserva MP por obra ("MP · Reserva Obra X"): la obra a
   * la que pertenece la reserva. NULL/ausente = cuenta normal. */
  obra_id?: string | null;
};

/** Nombre canónico de la cuenta espejo de reserva MP de una obra (04/07). */
export function nombreReservaObra(nombreObra: string): string {
  return `MP · Reserva Obra ${nombreObra}`;
}

/** Cuenta de reserva MP de la obra, si existe y está activa. Los gastos de la
 * obra la ofrecen como cuenta de origen por defecto cuando tiene saldo. */
export function reservaDeObra<T extends Cuenta>(
  cuentas: T[],
  obraId: string | null | undefined
): T | null {
  if (!obraId) return null;
  return cuentas.find((c) => c.activa && c.obra_id === obraId) ?? null;
}

/** presupuestos_gastos: importe SIEMPRE en ARS; si el gasto se pagó desde una
 * cuenta USD, se pasa a dólares con la cotización guardada en la fila. */
export type GastoObraCuentaRow = {
  cuenta_id: string | null;
  importe: unknown;
  cotizacion_venta_ars_por_usd?: unknown;
  cashflow_item_id?: string | null;
};

export type CashflowCuentaRow = {
  id: string;
  cuenta_id: string | null;
  tipo: string; // "ingreso" | "egreso"
  monto_real: unknown;
  moneda?: string | null;
  monto_usd?: unknown;
  deleted_at?: string | null;
};

export type RetiroCuentaRow = {
  cuenta_id: string | null;
  tipo: string; // "retiro" | "aporte"
  monto_ars: unknown;
};

export type GastoPersonalCuentaRow = {
  cuenta_id: string | null;
  monto: unknown;
};

/** gastos_empresa: gastos del negocio SIN obra (software, suscripciones,
 * herramientas, publicidad). Traen moneda propia (ARS o USD — las
 * suscripciones de la tarjeta van en dólares a la cuenta Tarjeta Visa US$). */
export type GastoEmpresaCuentaRow = {
  cuenta_id: string | null;
  monto: unknown;
  moneda?: string | null;
};

/** transferencias: plata que se mueve ENTRE cuentas (pago de resumen de
 * tarjeta repartido, pases, cambio de moneda). Cada monto va en la moneda de
 * su cuenta; el par permite cross-currency sin inventar cotizaciones. */
export type TransferenciaCuentaRow = {
  cuenta_origen_id: string | null;
  cuenta_destino_id: string | null;
  monto_origen: unknown;
  monto_destino: unknown;
};

/** cuenta_ajustes: ARQUEOS — Eze declara cuánto hay de verdad en una cuenta y
 * el delta (declarado − derivado al momento) entra como un movimiento más, en
 * la MONEDA de la cuenta. Queda historial de cuándo/cuánto se desvió cada una. */
export type AjusteCuentaRow = {
  cuenta_id: string | null;
  delta: unknown;
};

export type CuentaConSaldo = Cuenta & {
  saldo: number; // en la moneda de la cuenta
  movimientos: number; // cuántos movimientos asignados la ajustaron
};

export type SaldosCuentas = {
  cuentas: CuentaConSaldo[];
  // Agregados por moneda y procedencia (propia = de Eze, obra = del cliente).
  arsPropia: number;
  arsObra: number;
  usdPropia: number;
  usdObra: number;
  sinAsignar: number; // movimientos con cuenta_id null (histórico) — informativo
};

/**
 * Deriva el saldo de cada cuenta a partir de la foto inicial + movimientos
 * asignados.
 *
 * Reglas de moneda: cada movimiento ajusta la cuenta EN LA MONEDA DE LA CUENTA.
 *  - Cashflow: cuenta ARS usa monto_real; cuenta USD usa monto_usd. Si el
 *    movimiento no trae monto en esa moneda, no ajusta (0) — nunca se convierte
 *    a una cotización inventada.
 *  - Gasto de obra: importe en ARS; para cuenta USD se pasa a dólares con la
 *    cotización de la fila (cotizacion_venta_ars_por_usd); sin cotización → 0.
 *  - Retiros/aportes y gastos personales: solo en pesos (monto_ars / monto).
 *
 * Dedup gasto↔libreta: un gasto de obra espeja un egreso en cashflow_items
 * (cashflow_item_id). La cuenta vive en el GASTO; si además el espejo trae
 * cuenta_id, se ignora el espejo para no restar dos veces.
 */
export function saldosPorCuenta(args: {
  cuentas: Cuenta[];
  gastosObra: GastoObraCuentaRow[];
  cashflow: CashflowCuentaRow[];
  retiros: RetiroCuentaRow[];
  gastosPersonales: GastoPersonalCuentaRow[];
  gastosEmpresa?: GastoEmpresaCuentaRow[];
  transferencias?: TransferenciaCuentaRow[];
  ajustes?: AjusteCuentaRow[];
}): SaldosCuentas {
  const porId = new Map<string, { saldo: number; movs: number }>();
  for (const c of args.cuentas) {
    porId.set(c.id, { saldo: roundArs2(c.saldo_inicial), movs: 0 });
  }
  const monedaDe = new Map(args.cuentas.map((c) => [c.id, c.moneda]));
  let sinAsignar = 0;

  const ajustar = (cuentaId: string | null, delta: number) => {
    if (!cuentaId) {
      sinAsignar += 1;
      return;
    }
    const acc = porId.get(cuentaId);
    if (!acc) return; // cuenta borrada/desconocida: no rompe, no suma
    acc.saldo = roundArs2(acc.saldo + delta);
    acc.movs += 1;
  };

  const espejos = new Set<string>();
  for (const g of args.gastosObra) {
    if (g.cashflow_item_id) espejos.add(String(g.cashflow_item_id));
  }

  for (const g of args.gastosObra) {
    if (!g.cuenta_id) {
      sinAsignar += 1;
      continue;
    }
    const importeArs = roundArs2(parseNum(g.importe));
    if (monedaDe.get(g.cuenta_id) === "USD") {
      const cot = parseNum(g.cotizacion_venta_ars_por_usd);
      ajustar(g.cuenta_id, cot > 0 ? -roundArs2(importeArs / cot) : 0);
    } else {
      ajustar(g.cuenta_id, -importeArs);
    }
  }

  for (const m of args.cashflow) {
    if (m.deleted_at) continue;
    if (espejos.has(String(m.id))) continue;
    if (!m.cuenta_id) {
      sinAsignar += 1;
      continue;
    }
    const enUsd = monedaDe.get(m.cuenta_id) === "USD";
    const monto = roundArs2(
      enUsd ? parseNum(m.monto_usd) : parseNum(m.monto_real)
    );
    ajustar(m.cuenta_id, m.tipo === "egreso" ? -monto : monto);
  }

  for (const r of args.retiros) {
    const monto = roundArs2(parseNum(r.monto_ars));
    ajustar(r.cuenta_id, r.tipo === "aporte" ? monto : -monto);
  }

  for (const g of args.gastosPersonales) {
    ajustar(g.cuenta_id, -roundArs2(parseNum(g.monto)));
  }

  // Gastos de empresa: restan en la moneda del gasto SOLO si coincide con la
  // de la cuenta (un gasto USD no toca una cuenta ARS ni al revés — nunca se
  // convierte a una cotización inventada).
  for (const g of args.gastosEmpresa ?? []) {
    if (!g.cuenta_id) {
      sinAsignar += 1;
      continue;
    }
    const monedaGasto = g.moneda === "USD" ? "USD" : "ARS";
    const coincide = monedaDe.get(g.cuenta_id) === monedaGasto;
    ajustar(g.cuenta_id, coincide ? -roundArs2(parseNum(g.monto)) : 0);
  }

  // Transferencias: restan del origen y suman al destino, cada pata en la
  // moneda de su cuenta. Pagar el resumen de una tarjeta (saldo negativo)
  // es exactamente esto: destino = la tarjeta, y su deuda sube hacia 0.
  for (const t of args.transferencias ?? []) {
    ajustar(t.cuenta_origen_id, -roundArs2(parseNum(t.monto_origen)));
    ajustar(t.cuenta_destino_id, roundArs2(parseNum(t.monto_destino)));
  }

  // Arqueos: el delta va directo (positivo o negativo), ya está en la moneda
  // de la cuenta porque se calculó contra su saldo derivado.
  for (const a of args.ajustes ?? []) {
    ajustar(a.cuenta_id, roundArs2(parseNum(a.delta)));
  }

  const cuentas: CuentaConSaldo[] = [...args.cuentas]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    .map((c) => ({
      ...c,
      saldo: porId.get(c.id)?.saldo ?? roundArs2(c.saldo_inicial),
      movimientos: porId.get(c.id)?.movs ?? 0,
    }));

  const sum = (arr: number[]) => roundArs2(arr.reduce((a, b) => a + b, 0));
  const activas = cuentas.filter((c) => c.activa);
  const de = (moneda: Moneda, procedencia: Procedencia) =>
    sum(
      activas
        .filter((c) => c.moneda === moneda && c.procedencia === procedencia)
        .map((c) => c.saldo)
    );

  return {
    cuentas,
    arsPropia: de("ARS", "propia"),
    arsObra: de("ARS", "obra"),
    usdPropia: de("USD", "propia"),
    usdObra: de("USD", "obra"),
    sinAsignar,
  };
}
