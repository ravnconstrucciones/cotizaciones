import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; archivoId: string }> };

/** PATCH { en_propuesta: boolean } — marca una foto para salir en la propuesta. */
export async function PATCH(req: Request, ctx: Params) {
  const { id, archivoId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { en_propuesta?: boolean } | null;
  if (typeof body?.en_propuesta !== "boolean") {
    return NextResponse.json({ error: "en_propuesta (boolean) requerido." }, { status: 400 });
  }
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizacion_archivos")
    .update({ en_propuesta: body.en_propuesta })
    .eq("id", archivoId)
    .eq("cotizacion_id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
