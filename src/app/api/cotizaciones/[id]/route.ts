import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/cotizaciones/[id] — detalle completo + receta y presupuesto joineados (mesa de revisión). */
export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .select(
      "*, receta:recetas(id, nombre, titulo, estado, fuentes, version), presupuesto:presupuestos(id, nombre_obra, nombre_cliente)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  const res = NextResponse.json({ cotizacion: data });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}

/**
 * PATCH /api/cotizaciones/[id] — vincular/desvincular la obra (presupuesto_id).
 * Es la llave del loop de oro (§6.2.5): sin presupuesto_id, el contraste al
 * finalizar la obra (Task 12) no encuentra la cotización. Se permite en
 * cualquier estado (el vínculo puede cargarse hasta antes de cerrar la obra).
 */
export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { presupuesto_id?: string | null }
    | null;
  if (!body || !("presupuesto_id" in body)) {
    return NextResponse.json(
      { error: "presupuesto_id requerido (uuid del presupuesto, o null para desvincular)" },
      { status: 400 }
    );
  }
  const presupuestoId = body.presupuesto_id ?? null;
  if (presupuestoId !== null && typeof presupuestoId !== "string") {
    return NextResponse.json({ error: "presupuesto_id inválido" }, { status: 400 });
  }
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .update({ presupuesto_id: presupuestoId })
    .eq("id", id)
    .select("id"); // verificación de filas afectadas — sin .select() un update a id inexistente "pasa"
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, presupuesto_id: presupuestoId });
}

/**
 * DELETE /api/cotizaciones/[id] — borra una cotización (caso: rechazada o
 * duplicada que ensucia la mesa). Borrado físico. Antes desvincula la lección
 * de rechazo (cotizador_lecciones.cotizacion_id es FK sin ON DELETE) para no
 * romper el FK y PRESERVAR el aprendizaje del rechazo.
 */
export async function DELETE(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();

  // 1) Soltar la FK de las lecciones sin perderlas (el aprendizaje sobrevive).
  const { error: lecErr } = await sb
    .from("cotizador_lecciones")
    .update({ cotizacion_id: null })
    .eq("cotizacion_id", id);
  if (lecErr) return NextResponse.json({ error: lecErr.message }, { status: 500 });

  // 2) Borrar la cotización (con .select para verificar que existía).
  const { data, error } = await sb
    .from("cotizaciones")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
