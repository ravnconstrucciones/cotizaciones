import { NextResponse } from "next/server";
import { crearObraDesdeCotizacion } from "@/lib/cotizador/crear-obra";
import type { Desglose, EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Reclasificación LIBRE desde la mesa (el desplegable de la tarjeta). A
 * diferencia de aprobar/rechazar/emitir (flujo formal, una sola dirección con
 * gate por estado de origen), acá Eze mueve la tarjeta entre pestañas en
 * cualquier sentido para ORDENAR la mesa. Pero los efectos reales se respetan:
 *   - aprobada  → si todavía no tiene obra, dispara el loop de oro (crea el
 *                 proyecto en /obras). Si ya está vinculada, NO duplica.
 *   - rechazada → con motivo opcional; si hay motivo, alimenta cotizador_lecciones.
 *   - en_revision → vuelta atrás pura, sin tocar la obra ya creada.
 * documento_emitido queda fuera: se emite solo desde el flujo formal.
 */
const RECLASIFICABLES = ["en_revision", "aprobada", "rechazada"] as const;
type EstadoDestino = (typeof RECLASIFICABLES)[number];

const REVISION_VACIA: Revision = {
  checklist: [],
  sanidad: [],
  precios_vencidos: [],
  divergencias: [],
  dudas: [],
};

export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    estado?: string;
    motivo?: string;
    importe_final?: number;
  };

  const destino = body.estado as EstadoDestino;
  if (!RECLASIFICABLES.includes(destino)) {
    return NextResponse.json(
      { error: `estado inválido (esperado: ${RECLASIFICABLES.join(", ")})` },
      { status: 400 }
    );
  }
  const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
  const importeFinal =
    typeof body.importe_final === "number" && Number.isFinite(body.importe_final)
      ? body.importe_final
      : undefined;

  const sb = createSupabaseAdminClient();
  const { data: cot, error: eGet } = await sb
    .from("cotizaciones")
    .select(
      "id, estado, revision, presupuesto_id, titulo, zona, total_min, total_max, ficha, foto_portada_path, desglose"
    )
    .eq("id", id)
    .maybeSingle();
  if (eGet) return NextResponse.json({ error: eGet.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const actual = cot.estado as EstadoCotizacion;
  if (actual === destino) {
    return NextResponse.json({ ok: true, estado: destino, presupuesto_id: cot.presupuesto_id });
  }

  // Cambio a persistir según destino.
  let cambio: Record<string, unknown>;
  if (destino === "aprobada") {
    const base = (cot.revision as Revision | null) ?? REVISION_VACIA;
    cambio = {
      estado: "aprobada",
      revision: {
        ...base,
        aprobacion: {
          fecha: new Date().toISOString().slice(0, 10),
          ...(importeFinal != null && importeFinal > 0 ? { importe_final: importeFinal } : {}),
        },
      },
    };
  } else if (destino === "rechazada") {
    cambio = { estado: "rechazada", ...(motivo ? { motivo_rechazo: motivo } : {}) };
  } else {
    cambio = { estado: "en_revision" };
  }

  // Guard de carrera: el UPDATE solo pega si el estado sigue siendo el que
  // leímos. 0 filas = otro (doble click, el bot, otra pestaña) lo cambió → 409.
  const { data: upd, error: eUpd } = await sb
    .from("cotizaciones")
    .update(cambio)
    .eq("id", id)
    .eq("estado", actual)
    .select("id");
  if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });
  if (!upd || upd.length === 0) {
    return NextResponse.json(
      { error: "La cotización cambió de estado — recargá la mesa." },
      { status: 409 }
    );
  }

  // Efectos posteriores (corren DESPUÉS del cambio de estado: un fallo acá nunca
  // revierte la reclasificación de Eze).
  let presupuesto_id = cot.presupuesto_id as string | null;
  let obra_id: string | null = null;

  if (destino === "aprobada" && cot.presupuesto_id == null) {
    const proyecto = await crearObraDesdeCotizacion(
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
    );
    presupuesto_id = proyecto.presupuesto_id;
    obra_id = proyecto.obra_id;
  }

  if (destino === "rechazada" && motivo) {
    const recetaNombre = (cot.desglose as Desglose | null)?.receta_nombre ?? null;
    const { error: eLec } = await sb.from("cotizador_lecciones").insert({
      tipo: "rechazo",
      receta_nombre: recetaNombre,
      cotizacion_id: id,
      leccion: motivo,
      ajuste: null,
    });
    if (eLec) console.error("[estado] lección no insertada:", eLec.message);
  }

  return NextResponse.json({ ok: true, estado: destino, presupuesto_id, obra_id });
}
