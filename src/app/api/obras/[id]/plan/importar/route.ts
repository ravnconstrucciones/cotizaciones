import { NextResponse } from "next/server";
import { importarPlanDesdeCotizacion } from "@/lib/plan-compra/importar";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/obras/[id]/plan/importar — importa el plan desde la cotización vinculada ([id] = presupuesto_id). */
export async function POST(_req: Request, ctx: Params) {
  const { id: presupuestoId } = await ctx.params;
  const sb = createSupabaseAdminClient();

  const { data: cots, error } = await sb
    .from("cotizaciones")
    .select("id")
    .eq("presupuesto_id", presupuestoId)
    .in("estado", ["aprobada", "documento_emitido"])
    .order("creado_at", { ascending: false })
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cots || cots.length === 0) {
    return NextResponse.json({ insertados: 0, motivo: "sin_cotizacion" });
  }

  const resultado = await importarPlanDesdeCotizacion(sb, presupuestoId, cots[0].id);
  return NextResponse.json(resultado);
}
