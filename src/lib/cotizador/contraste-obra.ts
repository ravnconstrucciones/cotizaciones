import type { SupabaseClient } from "@supabase/supabase-js";
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
