import { NextResponse } from "next/server";
import { rechazar, TransicionInvalida } from "@/lib/cotizador/estado";
import type { Desglose, EstadoCotizacion } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/cotizaciones/[id]/rechazar — rechazo con motivo → lección (spec §6.4). */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { motivo?: string };
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select("id, estado, desglose")
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  try {
    const cambio = rechazar(cot.estado as EstadoCotizacion, String(body.motivo ?? ""));
    // Guard de carrera + verificación de filas afectadas (mismo patrón que aprobar).
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

    // El motivo alimenta el loop de mejora (cotizador_lecciones tipo rechazo).
    // Solo se inserta si el UPDATE realmente rechazó (estamos después del guard).
    const recetaNombre = (cot.desglose as Desglose | null)?.receta_nombre ?? null;
    const { error: eLec } = await sb.from("cotizador_lecciones").insert({
      tipo: "rechazo",
      receta_nombre: recetaNombre,
      cotizacion_id: id,
      leccion: cambio.motivo_rechazo,
      ajuste: null,
    });
    if (eLec) console.error("[rechazar] lección no insertada:", eLec.message);

    return NextResponse.json({ ok: true, estado: "rechazada" });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
