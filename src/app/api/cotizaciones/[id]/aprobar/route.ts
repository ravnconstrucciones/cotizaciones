import { NextResponse } from "next/server";
import { aprobar, TransicionInvalida } from "@/lib/cotizador/estado";
import type { EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/cotizaciones/[id]/aprobar — el OK explícito de Eze (spec §6.4). */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { importe_final?: number };
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select("id, estado, revision")
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  try {
    const cambio = aprobar(
      cot.estado as EstadoCotizacion,
      cot.revision as Revision | null,
      typeof body.importe_final === "number" ? body.importe_final : undefined
    );
    // Guard de carrera REAL: el .eq("estado") restringe el UPDATE y el .select()
    // verifica filas afectadas. 0 filas = el estado cambió entre el SELECT y el
    // UPDATE (doble click, otra pestaña, el bot) → 409, nunca éxito fantasma.
    const { data: upd, error } = await sb
      .from("cotizaciones")
      .update(cambio)
      .eq("id", id)
      .eq("estado", "en_revision")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd || upd.length === 0) {
      return NextResponse.json(
        { error: "La cotización ya no está en revisión (cambió de estado) — recargá la mesa." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, estado: "aprobada" });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
