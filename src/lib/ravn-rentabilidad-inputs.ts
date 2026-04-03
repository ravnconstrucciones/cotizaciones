import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Valores del formulario Rentabilidad persistidos en `presupuestos.rentabilidad_inputs`.
 * Incluye costo directo material/M.O. tal como los dejaste (podés haberlos corregido a mano).
 */
export type RentabilidadInputsPersistedV1 = {
  v: 1;
  presupuestoId: string;
  costoMaterialStr: string;
  costoMoStr: string;
  remarqueMaterialPctStr: string;
  remarqueMoPctStr: string;
  cargosAdicionalesStr: string;
  costosInternosStr: string;
  contingenciaPctStr: string;
  bonificacionComercialPctStr: string;
  mostrarIva: boolean;
  monedaPresentacion: "ARS" | "USD";
  cotizacionManualStr: string;
  casaDolar: string;
  /** Cierre manual del precio obra sin IVA; null = solo cálculo desde ítems. */
  precioObraManual: number | null;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

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

function strOr(x: unknown, fallback: string): string {
  return typeof x === "string" ? x : fallback;
}

export function parseRentabilidadInputsJson(
  raw: unknown,
  presupuestoId: string
): RentabilidadInputsPersistedV1 | null {
  if (raw == null) return null;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!isRecord(obj) || obj.v !== 1) return null;
  if (!presupuestoIdsCoinciden(obj.presupuestoId, presupuestoId)) {
    return null;
  }
  const moneda =
    obj.monedaPresentacion === "USD" || obj.monedaPresentacion === "ARS"
      ? obj.monedaPresentacion
      : "ARS";
  let precioObraManual: number | null = null;
  if (obj.precioObraManual === null || obj.precioObraManual === undefined) {
    precioObraManual = null;
  } else {
    const n = Number(obj.precioObraManual);
    precioObraManual = Number.isFinite(n) ? n : null;
  }
  return {
    v: 1,
    presupuestoId,
    costoMaterialStr: strOr(obj.costoMaterialStr, ""),
    costoMoStr: strOr(obj.costoMoStr, ""),
    remarqueMaterialPctStr: strOr(obj.remarqueMaterialPctStr, "0"),
    remarqueMoPctStr: strOr(obj.remarqueMoPctStr, "0"),
    cargosAdicionalesStr: strOr(obj.cargosAdicionalesStr, ""),
    costosInternosStr: strOr(obj.costosInternosStr, ""),
    contingenciaPctStr: strOr(obj.contingenciaPctStr, "0"),
    bonificacionComercialPctStr: strOr(obj.bonificacionComercialPctStr, "0"),
    mostrarIva: Boolean(obj.mostrarIva),
    monedaPresentacion: moneda,
    cotizacionManualStr: strOr(obj.cotizacionManualStr, ""),
    casaDolar: strOr(obj.casaDolar, "oficial"),
    precioObraManual,
  };
}

export function buildRentabilidadInputsPayload(params: {
  presupuestoId: string;
  costoMaterialStr: string;
  costoMoStr: string;
  remarqueMaterialPctStr: string;
  remarqueMoPctStr: string;
  cargosAdicionalesStr: string;
  costosInternosStr: string;
  contingenciaPctStr: string;
  bonificacionComercialPctStr: string;
  mostrarIva: boolean;
  monedaPresentacion: "ARS" | "USD";
  cotizacionManualStr: string;
  casaDolar: string;
  precioObraManual: number | null;
}): RentabilidadInputsPersistedV1 {
  return {
    v: 1,
    presupuestoId: params.presupuestoId,
    costoMaterialStr: params.costoMaterialStr,
    costoMoStr: params.costoMoStr,
    remarqueMaterialPctStr: params.remarqueMaterialPctStr,
    remarqueMoPctStr: params.remarqueMoPctStr,
    cargosAdicionalesStr: params.cargosAdicionalesStr,
    costosInternosStr: params.costosInternosStr,
    contingenciaPctStr: params.contingenciaPctStr,
    bonificacionComercialPctStr: params.bonificacionComercialPctStr,
    mostrarIva: params.mostrarIva,
    monedaPresentacion: params.monedaPresentacion,
    cotizacionManualStr: params.cotizacionManualStr,
    casaDolar: params.casaDolar,
    precioObraManual: params.precioObraManual,
  };
}

export async function saveRentabilidadInputsToDb(
  client: SupabaseClient,
  inputs: RentabilidadInputsPersistedV1
): Promise<string | null> {
  const { error } = await client
    .from("presupuestos")
    .update({ rentabilidad_inputs: inputs })
    .eq("id", inputs.presupuestoId);
  return error?.message ?? null;
}
