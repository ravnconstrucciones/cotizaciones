import { NextResponse } from "next/server";
import { emitir, TransicionInvalida } from "@/lib/cotizador/estado";
import type { DatosDocumento, EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function lineas(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v.split("\n").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/** POST /api/cotizaciones/[id]/emitir — solo desde aprobada (spec §6.4). */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const documento: DatosDocumento = {
    cliente: String(body.cliente ?? ""),
    lugar: String(body.lugar ?? ""),
    forma_pago: lineas(body.forma_pago),
    plazo: lineas(body.plazo),
    notas: lineas(body.notas),
  };
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select("id, estado, revision")
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  try {
    const cambio = emitir(
      cot.estado as EstadoCotizacion,
      cot.revision as Revision | null,
      documento
    );
    // Guard de carrera + verificación de filas afectadas (mismo patrón que aprobar).
    const { data: upd, error } = await sb
      .from("cotizaciones")
      .update(cambio)
      .eq("id", id)
      .eq("estado", "aprobada")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!upd || upd.length === 0) {
      return NextResponse.json(
        { error: "La cotización ya no está aprobada (cambió de estado) — recargá la mesa." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, estado: "documento_emitido" });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
