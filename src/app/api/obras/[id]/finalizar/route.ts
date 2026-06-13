import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { finalizarObra } from "@/lib/obra-finalizar";

/**
 * POST /api/obras/[id]/finalizar — CERRAR OBRA desde la galería/orbital.
 *
 * [id] = presupuesto_id (convención de las rutas /obras/[id]). Resolvemos el
 * obra_id desde el presupuesto y delegamos a finalizarObra() — misma lógica que
 * el cierre desde cashflow. Tras esto, finalizada_at queda seteado y la obra
 * sale de las activas (deja de figurar en home y en el filtro Activas).
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const presupuestoId = String(id ?? "").trim();
    if (!presupuestoId) {
      return NextResponse.json(
        { error: "presupuesto_id requerido." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id")
      .eq("presupuesto_id", presupuestoId)
      .maybeSingle();

    if (eObra || !obra) {
      return NextResponse.json(
        { error: eObra?.message ?? "Obra no encontrada." },
        { status: 404 }
      );
    }

    const r = await finalizarObra(supabase, String((obra as { id: string }).id));
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.status });
    }
    return NextResponse.json({
      ok: true,
      cierre: r.cierre,
      lecciones_contraste: r.lecciones_contraste,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
