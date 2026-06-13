import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { finalizarObra } from "@/lib/obra-finalizar";

type Params = { params: Promise<{ obra_id: string }> };

/**
 * Cierre de obra desde cashflow (params.obra_id = obras.id). La lógica vive en
 * finalizarObra() — compartida con POST /api/obras/[id]/finalizar (galería).
 */
export async function POST(_req: Request, ctx: Params) {
  try {
    const { obra_id } = await ctx.params;
    const supabase = createSupabaseAdminClient();
    const r = await finalizarObra(supabase, obra_id);
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
