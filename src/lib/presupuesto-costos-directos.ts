import type { SupabaseClient } from "@supabase/supabase-js";
import { roundArs2 } from "@/lib/format-currency";

/** Suma materiales + M.O. congelados de todas las líneas del presupuesto. */
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
  return { material: roundArs2(material), mo: roundArs2(mo), total };
}
