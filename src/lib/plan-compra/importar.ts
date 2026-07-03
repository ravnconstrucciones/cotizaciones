import type { SupabaseClient } from "@supabase/supabase-js";
import type { Desglose } from "@/lib/cotizador/tipos";
import { sembrarPlanDesdeDesglose } from "./sembrar";

/**
 * Importa el desglose de una cotización como plan de compra de la obra.
 * Idempotente: si la obra ya tiene ítems origen 'cotizacion' (de CUALQUIER
 * cotización — una 2ª cotización sobre la misma obra duplicaría el plan y
 * doblaría los totales del cruce), no vuelve a sembrar (motivo 'ya_importado').
 * Best-effort: nunca tira — ante
 * error devuelve { insertados: 0, motivo } y loguea (mismo contrato que el
 * loop de oro de crear-obra: un fallo acá jamás bloquea la aprobación).
 */
export async function importarPlanDesdeCotizacion(
  sb: SupabaseClient,
  presupuestoId: string,
  cotizacionId: string
): Promise<{ insertados: number; motivo?: string }> {
  try {
    const { data: existentes, error: eEx } = await sb
      .from("obra_plan_items")
      .select("id")
      .eq("presupuesto_id", presupuestoId)
      .eq("origen", "cotizacion")
      .limit(1);
    if (eEx) throw new Error(eEx.message);
    if (existentes && existentes.length > 0) return { insertados: 0, motivo: "ya_importado" };

    const { data: cot, error: eCot } = await sb
      .from("cotizaciones")
      .select("id, desglose")
      .eq("id", cotizacionId)
      .maybeSingle();
    if (eCot || !cot) throw new Error(eCot?.message ?? "cotización no encontrada");

    const desglose = cot.desglose as Desglose | null;
    if (!desglose || !Array.isArray(desglose.items) || desglose.items.length === 0) {
      return { insertados: 0, motivo: "sin_desglose" };
    }

    const filas = sembrarPlanDesdeDesglose(desglose, presupuestoId, cotizacionId);
    const { error: eIns } = await sb.from("obra_plan_items").insert(filas);
    if (eIns) throw new Error(eIns.message);
    return { insertados: filas.length };
  } catch (e) {
    console.error("[importarPlanDesdeCotizacion]", e instanceof Error ? e.message : e);
    return { insertados: 0, motivo: "error" };
  }
}
