import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";
import { parseRentabilidadInputsJson } from "@/lib/ravn-rentabilidad-inputs";

/**
 * Costo directo presupuestado en ARS nominales. Primero suma materiales + M.O.
 * congelados de las líneas del presupuesto; si no hay ítems (flujo por consola
 * de Rentabilidad), cae a los costos de `rentabilidad_inputs` con la misma
 * fórmula que el resumen de cashflow (material + M.O. + internos + cargos).
 */
export async function fetchCostoDirectoPresupuesto(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<{ material: number; mo: number; total: number }> {
  const { data, error } = await supabase
    .from("presupuestos_items")
    .select("cantidad, precio_material_congelado, precio_mo_congelada")
    .eq("presupuesto_id", presupuestoId);

  if (error) throw new Error(error.message);

  let material = 0;
  let mo = 0;
  for (const row of data ?? []) {
    const q = Number(row.cantidad) || 0;
    material += q * (Number(row.precio_material_congelado) || 0);
    mo += q * (Number(row.precio_mo_congelada) || 0);
  }
  const total = roundArs2(material + mo);
  if (total > 0) {
    return { material: roundArs2(material), mo: roundArs2(mo), total };
  }

  return fetchCostoDirectoDesdeConsola(supabase, presupuestoId);
}

async function fetchCostoDirectoDesdeConsola(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<{ material: number; mo: number; total: number }> {
  const { data, error } = await supabase
    .from("presupuestos")
    .select("rentabilidad_inputs")
    .eq("id", presupuestoId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const ri = parseRentabilidadInputsJson(
    data?.rentabilidad_inputs,
    presupuestoId
  );
  if (!ri) return { material: 0, mo: 0, total: 0 };

  const material = parseFormattedNumber(ri.costoMaterialStr);
  const mo = parseFormattedNumber(ri.costoMoStr);
  const extras =
    parseFormattedNumber(ri.costosInternosStr) +
    parseFormattedNumber(ri.cargosAdicionalesStr);
  const total = roundArs2(material + mo + extras);
  return {
    material: roundArs2(material),
    mo: roundArs2(mo),
    total: total > 0 ? total : 0,
  };
}
