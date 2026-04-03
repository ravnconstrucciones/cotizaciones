import type { SupabaseClient } from "@supabase/supabase-js";
import { roundArs2 } from "@/lib/format-currency";

/**
 * Preferencias de propuesta definidas en Rentabilidad.
 * Se persisten en `presupuestos.propuesta_comercial_pref` (Supabase).
 */
export type PropuestaPrefV1 = {
  v: 1;
  presupuestoId: string;
  moneda: "ARS" | "USD";
  /** Cotización venta: ARS por 1 USD (para pasar el importe a dólares). */
  cotizacionVentaArsPorUsd: number;
  /** Precio obra sin IVA en ARS, redondeado al mil superior. */
  precioSinIvaArsRedondeado: number;
  /** IVA 21% exacto sobre `precioSinIvaArsRedondeado` (sin redondeo “comercial”). */
  ivaArs: number;
  /** Si true, el importe en propuesta incluye IVA (precio redondeado + IVA exacto). */
  incluyeIvaEnImporte: boolean;
  conversionDisclaimerSugerido?: string;
  casaDolarLabel?: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Misma fila en Supabase puede compararse con UUID con/sin guiones o distinto casing. */
function presupuestoIdsCoinciden(
  idEnJson: unknown,
  presupuestoIdEsperado: string
): boolean {
  const a = String(idEnJson ?? "").trim();
  const b = String(presupuestoIdEsperado).trim();
  if (a === b) return true;
  const norm = (s: string) => s.replace(/-/g, "").toLowerCase();
  if (a.length >= 32 && b.length >= 32 && norm(a) === norm(b)) return true;
  return false;
}

/**
 * Igual que `parsePropuestaPrefJson`, pero si el id en el JSON no coincide (p. ej.
 * pref copiado a mano), igual devuelve los números — útil para leer margen desde
 * la misma fila `presupuestos` ya filtrada por id.
 */
export function parsePropuestaPrefJsonDesdeMismaFila(
  raw: unknown,
  presupuestoId: string
): PropuestaPrefV1 | null {
  const strict = parsePropuestaPrefJson(raw, presupuestoId);
  if (strict) return strict;
  return parsePropuestaPrefJsonInner(raw, presupuestoId, false);
}

function parsePropuestaPrefJsonInner(
  raw: unknown,
  presupuestoId: string,
  exigirCoincidenciaDeId: boolean
): PropuestaPrefV1 | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(obj)) return null;
  if (obj.v !== 1) return null;
  if (
    exigirCoincidenciaDeId &&
    !presupuestoIdsCoinciden(obj.presupuestoId, presupuestoId)
  ) {
    return null;
  }
  const moneda = obj.moneda === "USD" || obj.moneda === "ARS" ? obj.moneda : null;
  if (!moneda) return null;
  const n = (k: string) => {
    const x = Number(obj[k]);
    return Number.isFinite(x) ? x : NaN;
  };
  const cotizacionVentaArsPorUsd = n("cotizacionVentaArsPorUsd");
  const precioSinIvaArsRedondeado = n("precioSinIvaArsRedondeado");
  const ivaArs = n("ivaArs");
  if (
    !Number.isFinite(cotizacionVentaArsPorUsd) ||
    !Number.isFinite(precioSinIvaArsRedondeado) ||
    !Number.isFinite(ivaArs)
  ) {
    return null;
  }
  return {
    v: 1,
    presupuestoId,
    moneda,
    cotizacionVentaArsPorUsd,
    precioSinIvaArsRedondeado,
    ivaArs,
    incluyeIvaEnImporte: Boolean(obj.incluyeIvaEnImporte),
    conversionDisclaimerSugerido:
      typeof obj.conversionDisclaimerSugerido === "string"
        ? obj.conversionDisclaimerSugerido
        : undefined,
    casaDolarLabel:
      typeof obj.casaDolarLabel === "string" ? obj.casaDolarLabel : undefined,
  };
}

export function parsePropuestaPrefJson(
  raw: unknown,
  presupuestoId: string
): PropuestaPrefV1 | null {
  return parsePropuestaPrefJsonInner(raw, presupuestoId, true);
}

/** Guarda la preferencia en el presupuesto (misma fila en Supabase). */
export async function savePropuestaPrefToDb(
  client: SupabaseClient,
  pref: PropuestaPrefV1
): Promise<string | null> {
  const { error } = await client
    .from("presupuestos")
    .update({ propuesta_comercial_pref: pref })
    .eq("id", pref.presupuestoId);
  return error?.message ?? null;
}

/** Quita la preferencia guardada (vuelve al total de líneas en propuesta). */
export async function clearPropuestaPrefInDb(
  client: SupabaseClient,
  presupuestoId: string
): Promise<string | null> {
  const { error } = await client
    .from("presupuestos")
    .update({ propuesta_comercial_pref: null })
    .eq("id", presupuestoId);
  return error?.message ?? null;
}

/** Arma un pref mínimo solo para usar `ajustarPropuestaPrefAlImporteMostradoArs` (p. ej. en Rentabilidad). */
export function construirPrefTemporalParaAjusteImporte(p: {
  presupuestoId: string;
  moneda: "ARS" | "USD";
  cotizacionVentaArsPorUsd: number;
  precioSinIvaArsRedondeado: number;
  incluyeIvaEnImporte: boolean;
}): PropuestaPrefV1 {
  const ivaArs = p.incluyeIvaEnImporte
    ? roundArs2(p.precioSinIvaArsRedondeado * 0.21)
    : 0;
  return {
    v: 1,
    presupuestoId: p.presupuestoId,
    moneda: p.moneda,
    cotizacionVentaArsPorUsd: p.cotizacionVentaArsPorUsd,
    precioSinIvaArsRedondeado: p.precioSinIvaArsRedondeado,
    ivaArs,
    incluyeIvaEnImporte: p.incluyeIvaEnImporte,
  };
}

/** Importe total en ARS que debe mostrarse en propuesta (según IVA). */
export function importeArsParaPropuesta(pref: PropuestaPrefV1): number {
  const base = pref.precioSinIvaArsRedondeado;
  if (!pref.incluyeIvaEnImporte) return base;
  return roundArs2(base + pref.ivaArs);
}

/**
 * Entero que ve el usuario en propuesta/PDF (misma regla que `montoImportePdfEntero` en pantalla).
 */
export function importeMostradoEnteroEnMoneda(
  pref: PropuestaPrefV1,
  moneda: "ARS" | "USD"
): number {
  const ars = importeArsParaPropuesta(pref);
  if (moneda === "USD") {
    const c = pref.cotizacionVentaArsPorUsd;
    if (Number.isFinite(c) && c > 0) {
      return Math.round(roundArs2(ars / c));
    }
    return Math.round(ars);
  }
  return Math.round(ars);
}

/**
 * Convierte el importe entero editado (en la moneda de la propuesta) a ARS para persistir el pref.
 */
export function importeArsEquivalenteAMostradoEntero(
  valorMostradoEntero: number,
  moneda: "ARS" | "USD",
  pref: PropuestaPrefV1
): number {
  const v = Math.round(
    Number.isFinite(valorMostradoEntero) ? valorMostradoEntero : 0
  );
  if (moneda === "USD") {
    const c = pref.cotizacionVentaArsPorUsd;
    if (Number.isFinite(c) && c > 0) {
      return Math.round(roundArs2(v * c));
    }
  }
  return v;
}

function importeDisplayArsDesdePrecioSinIva(
  precioSinIva: number,
  incluyeIva: boolean
): number {
  if (!incluyeIva) {
    return Math.round(Number.isFinite(precioSinIva) ? precioSinIva : 0);
  }
  const p = roundArs2(precioSinIva);
  const iva = roundArs2(p * 0.21);
  return Math.round(roundArs2(p + iva));
}

function precioSinIvaEIVaParaImporteMostradoConIva(targetInt: number): {
  precioSinIva: number;
  ivaArs: number;
} {
  if (targetInt <= 0) return { precioSinIva: 0, ivaArs: 0 };
  const disp = (p: number) =>
    Math.round(roundArs2(p + roundArs2(p * 0.21)));

  let hi = targetInt;
  let guard = 0;
  while (disp(hi) < targetInt && guard < 40) {
    hi = hi * 2 + 1;
    guard += 1;
  }

  let lo = 0;
  let hiBin = hi;
  while (lo < hiBin) {
    const mid = Math.floor((lo + hiBin + 1) / 2);
    if (disp(mid) <= targetInt) lo = mid;
    else hiBin = mid - 1;
  }

  const c0 = lo;
  const c1 = lo + 1;
  let bestP = c0;
  let bestDiff = Math.abs(disp(c0) - targetInt);
  const d1 = Math.abs(disp(c1) - targetInt);
  if (d1 < bestDiff) {
    bestP = c1;
    bestDiff = d1;
  }

  return {
    precioSinIva: roundArs2(bestP),
    ivaArs: roundArs2(bestP * 0.21),
  };
}

/**
 * Ajusta precio sin IVA (e IVA si el importe lo incluye) para que el total mostrado en ARS
 * coincida con `targetImporteArsEntero`. El margen en obra (`precio sin IVA − costo directo`)
 * sube o baja en la misma magnitud que el ajuste al precio sin IVA.
 */
export function ajustarPropuestaPrefAlImporteMostradoArs(
  pref: PropuestaPrefV1,
  targetImporteArsEntero: number
): PropuestaPrefV1 {
  const target = Math.round(
    Math.max(
      0,
      Number.isFinite(targetImporteArsEntero) ? targetImporteArsEntero : 0
    )
  );

  if (!pref.incluyeIvaEnImporte) {
    const actual = importeDisplayArsDesdePrecioSinIva(
      pref.precioSinIvaArsRedondeado,
      false
    );
    const delta = target - actual;
    const nuevaPrecio = roundArs2(
      Math.max(0, pref.precioSinIvaArsRedondeado + delta)
    );
    return {
      ...pref,
      precioSinIvaArsRedondeado: nuevaPrecio,
    };
  }

  const { precioSinIva, ivaArs } =
    precioSinIvaEIVaParaImporteMostradoConIva(target);
  return {
    ...pref,
    precioSinIvaArsRedondeado: precioSinIva,
    ivaArs,
  };
}
