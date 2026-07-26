import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DatosDocumento, EstadoCotizacion, Revision } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function listaDeStrings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out;
}

/**
 * PATCH /api/cotizaciones/[id]/documento-borrador — la propuesta en vivo.
 * Fable la va redactando turno a turno; acá se mergea sobre lo que había.
 * Solo estados de mesa (borrador/en_revision). Emitir sigue siendo de Eze.
 */
export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { documento?: Partial<DatosDocumento> }
    | null;
  const doc = body?.documento;
  if (!doc || typeof doc !== "object") {
    return NextResponse.json({ error: "documento requerido." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id, estado, revision")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const estado = cot.estado as EstadoCotizacion;
  if (estado !== "borrador" && estado !== "en_revision") {
    return NextResponse.json(
      { error: `El borrador de propuesta solo se edita en la mesa (estado "${estado}").` },
      { status: 409 }
    );
  }

  const revision = (cot.revision ?? {
    checklist: [],
    sanidad: [],
    precios_vencidos: [],
    divergencias: [],
    dudas: [],
  }) as Revision;
  const previo: DatosDocumento =
    revision.documento_borrador ?? {
      cliente: "",
      lugar: "",
      forma_pago: [],
      plazo: [],
      notas: [],
    };

  const nuevo: DatosDocumento = {
    cliente: typeof doc.cliente === "string" ? doc.cliente.trim() : previo.cliente,
    lugar: typeof doc.lugar === "string" ? doc.lugar.trim() : previo.lugar,
    forma_pago: listaDeStrings(doc.forma_pago) ?? previo.forma_pago,
    plazo: listaDeStrings(doc.plazo) ?? previo.plazo,
    notas: listaDeStrings(doc.notas) ?? previo.notas,
  };

  const { error: eUpd } = await sb
    .from("cotizaciones")
    .update({ revision: { ...revision, documento_borrador: nuevo } })
    .eq("id", id)
    .in("estado", ["borrador", "en_revision"]); // guard de carrera
  if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });

  return NextResponse.json({ ok: true, documento_borrador: nuevo });
}
