import type { SupabaseClient } from "@supabase/supabase-js";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import { calcularCruce } from "@/lib/plan-compra/cruce";
import { leccionDesdeCruce } from "@/lib/plan-compra/leccion";
import type { PlanItemRow } from "@/lib/plan-compra/tipos";
import { contrastarObra, type GastoRealObra } from "./contraste";
import type { Desglose } from "./tipos";

/**
 * Loop de oro (spec §6.2.5), parte server-side: al cerrar una obra, contrasta
 * cada cotización aprobada/emitida vinculada al presupuesto contra los gastos
 * reales (presupuestos_gastos) y deja la lección en cotizador_lecciones.
 *
 * Devuelve cuántas lecciones insertó. NUNCA tira: el cierre de la obra no se
 * bloquea por el contraste (errores → log y 0).
 *
 * `sb` tiene que ser el cliente admin (service_role): cotizaciones y
 * cotizador_lecciones tienen RLS que la sesión anónima no pasa.
 */
export async function correrContrasteObra(
  sb: SupabaseClient,
  presupuestoId: string
): Promise<number> {
  try {
    // Camino plan (spec 2026-07-03): si la obra tiene plan de compra, el
    // contraste usa el vínculo exacto gasto↔ítem en vez del matching difuso.
    const { data: planItems } = await sb
      .from("obra_plan_items")
      .select("*")
      .eq("presupuesto_id", presupuestoId);
    if (planItems && planItems.length > 0) {
      return await contrastePorPlan(sb, presupuestoId, planItems as PlanItemRow[]);
    }

    const { data: cotizaciones, error: eCot } = await sb
      .from("cotizaciones")
      .select("id, titulo, estado, desglose")
      .eq("presupuesto_id", presupuestoId)
      .in("estado", ["aprobada", "documento_emitido"]);
    if (eCot || !cotizaciones || cotizaciones.length === 0) return 0;

    const { data: gastosRaw, error: eGas } = await sb
      .from("presupuestos_gastos")
      .select("descripcion, importe, fecha")
      .eq("presupuesto_id", presupuestoId);
    if (eGas) return 0;

    const gastos: GastoRealObra[] = (gastosRaw ?? []).map((g) => ({
      descripcion: String(g.descripcion ?? ""),
      importe: Number(g.importe ?? 0),
      fecha: String(g.fecha ?? "").slice(0, 10),
    }));
    if (gastos.length === 0) return 0;

    let insertadas = 0;
    for (const cot of cotizaciones) {
      const desglose = cot.desglose as Desglose | null;
      if (!desglose || !Array.isArray(desglose.items) || desglose.items.length === 0) continue;
      const resultado = contrastarObra(desglose, gastos);
      const { error: eIns } = await sb.from("cotizador_lecciones").insert({
        tipo: "contraste_obra",
        receta_nombre: desglose.receta_nombre,
        cotizacion_id: cot.id,
        obra_presupuesto_id: presupuestoId,
        leccion: resultado.leccion,
        ajuste: resultado.ajuste,
      });
      if (eIns) {
        console.error("[contraste-obra] insert lección:", eIns.message);
      } else {
        insertadas += 1;
      }
    }
    return insertadas;
  } catch (e) {
    console.error("[contraste-obra]", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Contraste exacto vía plan de compra: una sola lección por obra, con margen real. */
async function contrastePorPlan(
  sb: SupabaseClient,
  presupuestoId: string,
  planItems: PlanItemRow[]
): Promise<number> {
  const { data: gastosPlan, error: eGas } = await sb
    .from("presupuestos_gastos")
    .select("id, descripcion, importe, fecha, plan_item_id")
    .eq("presupuesto_id", presupuestoId);
  if (eGas) return 0;

  const { data: obraRow } = await sb
    .from("obras")
    .select("monto_total_a_cobrar_ars")
    .eq("presupuesto_id", presupuestoId)
    .maybeSingle();

  const { data: cotPlan } = await sb
    .from("cotizaciones")
    .select("id, desglose")
    .eq("presupuesto_id", presupuestoId)
    .in("estado", ["aprobada", "documento_emitido"])
    .order("creado_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cruce = calcularCruce(
    planItems,
    (gastosPlan ?? []).map((g) => ({
      id: String(g.id),
      descripcion: String(g.descripcion ?? ""),
      importe_ars: importeGastoObraArs(g),
      plan_item_id: (g.plan_item_id as string | null) ?? null,
      fecha: String(g.fecha ?? "").slice(0, 10),
    })),
    obraRow?.monto_total_a_cobrar_ars == null
      ? null
      : Number(obraRow.monto_total_a_cobrar_ars)
  );

  const recetaNombre =
    (cotPlan?.desglose as Desglose | null)?.receta_nombre ?? "sin-receta";
  const { leccion, ajuste } = leccionDesdeCruce(recetaNombre, cruce);
  const { error: eIns } = await sb.from("cotizador_lecciones").insert({
    tipo: "contraste_obra",
    receta_nombre: recetaNombre,
    cotizacion_id: cotPlan?.id ?? null,
    obra_presupuesto_id: presupuestoId,
    leccion,
    ajuste,
  });
  if (eIns) {
    console.error("[contraste-obra] insert lección plan:", eIns.message);
    return 0;
  }
  return 1;
}
