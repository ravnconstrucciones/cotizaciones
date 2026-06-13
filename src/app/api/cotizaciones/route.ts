import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTADOS = ["borrador", "en_revision", "aprobada", "rechazada", "documento_emitido"];

/** GET /api/cotizaciones[?estado=en_revision] — lista para el tablero. */
export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const estado = req.nextUrl.searchParams.get("estado");
  let q = sb
    .from("cotizaciones")
    .select("id, creado_at, titulo, zona, estado, total_min, total_max, presupuesto_id, trabajo_id")
    .order("creado_at", { ascending: false })
    .limit(200);
  if (estado && ESTADOS.includes(estado)) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const res = NextResponse.json({ cotizaciones: data ?? [] });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}

/**
 * POST /api/cotizaciones — crea una cotización desde el tablero (borrador o
 * en_revision si ya viene con desglose). El daemon NO usa esta ruta: inserta
 * directo por REST de Supabase (el middleware exige sesión para /api/*).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.titulo !== "string" || !body.titulo.trim()) {
    return NextResponse.json({ error: "titulo requerido" }, { status: 400 });
  }
  const estado = body.estado === "en_revision" ? "en_revision" : "borrador";
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .insert({
      titulo: body.titulo.trim(),
      zona: typeof body.zona === "string" ? body.zona : null,
      estado,
      receta_id: body.receta_id ?? null,
      trabajo_id: body.trabajo_id ?? null,
      presupuesto_id: body.presupuesto_id ?? null,
      ficha: body.ficha ?? {},
      desglose: body.desglose ?? {},
      revision: body.revision ?? null,
      total_min: typeof body.total_min === "number" ? body.total_min : null,
      total_max: typeof body.total_max === "number" ? body.total_max : null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
