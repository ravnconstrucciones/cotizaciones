import { NextResponse } from "next/server";
import { aprobar, TransicionInvalida } from "@/lib/cotizador/estado";
import { crearObraDesdeCotizacion } from "@/lib/cotizador/crear-obra";
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
    .select(
      "id, estado, revision, presupuesto_id, titulo, zona, total_min, total_max, ficha, foto_portada_path"
    )
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

    // Loop de oro: si la cotización no tiene obra vinculada todavía, aprobar la
    // convierte en proyecto (presupuesto + obra) que aparece en /obras. Si ya
    // estaba vinculada a mano, no creamos nada (comportamiento actual). Esto
    // corre DESPUÉS del cambio de estado: un fallo acá nunca bloquea el OK de
    // Eze — la cotización queda aprobada y re-vinculable desde la mesa.
    const importeFinal =
      typeof body.importe_final === "number" ? body.importe_final : undefined;
    const proyecto =
      cot.presupuesto_id == null
        ? await crearObraDesdeCotizacion(
            sb,
            {
              id: cot.id,
              titulo: cot.titulo,
              zona: cot.zona,
              total_min: cot.total_min,
              total_max: cot.total_max,
              ficha: cot.ficha,
              foto_portada_path: cot.foto_portada_path,
            },
            importeFinal
          )
        : { presupuesto_id: cot.presupuesto_id, obra_id: null };

    return NextResponse.json({
      ok: true,
      estado: "aprobada",
      presupuesto_id: proyecto.presupuesto_id,
      obra_id: proyecto.obra_id,
    });
  } catch (e) {
    const status = e instanceof TransicionInvalida ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status }
    );
  }
}
