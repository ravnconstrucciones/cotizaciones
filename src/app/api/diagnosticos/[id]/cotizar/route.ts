import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/diagnosticos/[id]/cotizar — "Enviar a cotizar".
 *
 * Convierte el diagnóstico en una cotización BORRADOR y deja el relevamiento
 * como primer mensaje de la mesa, para que la mesa arranque con el contexto de
 * campo ya adentro. NO calcula precios: eso es del cotizador (el código suma,
 * no la IA) y se hace en la mesa.
 *
 * Idempotente: si el diagnóstico ya tiene cotización, devuelve esa.
 */
export async function POST(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();

  const { data: diag, error: errDiag } = await sb
    .from("diagnosticos")
    .select("id, titulo, direccion, cliente, estado, relevamiento, contenido, presupuesto_id, cotizacion_id")
    .eq("id", id)
    .single();
  if (errDiag) {
    const status = errDiag.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: errDiag.message }, { status });
  }

  if (diag.cotizacion_id) {
    return NextResponse.json({ cotizacion_id: diag.cotizacion_id, ya_existia: true });
  }

  const resumen =
    typeof (diag.contenido as { resumen?: unknown } | null)?.resumen === "string"
      ? ((diag.contenido as { resumen: string }).resumen as string)
      : "";

  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .insert({
      titulo: diag.titulo,
      zona: diag.direccion ?? null,
      estado: "borrador",
      presupuesto_id: diag.presupuesto_id ?? null,
      ficha: {
        origen: "diagnostico",
        diagnostico_id: diag.id,
        cliente: diag.cliente ?? null,
        direccion: diag.direccion ?? null,
        resumen,
      },
    })
    .select("id")
    .single();
  if (errCot) return NextResponse.json({ error: errCot.message }, { status: 500 });

  // El relevamiento entra a la mesa como mensaje del sistema: es el contexto de
  // campo, y así queda visible en el hilo en vez de escondido en un jsonb.
  const cuerpo = [resumen, diag.relevamiento].filter((t) => typeof t === "string" && t.trim()).join("\n\n");
  if (cuerpo.trim()) {
    const { error: errMsg } = await sb.from("cotizacion_mensajes").insert({
      cotizacion_id: cot.id,
      autor: "sistema",
      texto: `Relevamiento del diagnóstico «${diag.titulo}»:\n\n${cuerpo}`,
      meta: { tipo: "aviso", diagnostico_id: diag.id },
    });
    // Si el mensaje falla, la cotización ya existe y es lo que importa: se
    // avisa pero no se rompe el flujo.
    if (errMsg) console.error("cotizar: no se pudo sembrar el mensaje de mesa", errMsg.message);
  }

  const { error: errUpd } = await sb
    .from("diagnosticos")
    .update({ cotizacion_id: cot.id, estado: "cotizado", actualizado_at: new Date().toISOString() })
    .eq("id", diag.id);
  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });

  return NextResponse.json({ cotizacion_id: cot.id }, { status: 201 });
}
