import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { refrescarRetail } from "@/lib/cotizador/precios-cache";
import { materialesDeReceta } from "@/lib/cotizador/takeoff-helpers";
import type { Receta } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // decenas de fetches VTEX secuenciales

/**
 * POST /api/cotizar/precios/refresh — el botón "refrescar ahora" del panel.
 * Busca el precio retail VIVO de los materiales de la receta y lo upsertea en
 * el cache fechado. Los que ninguna cadena tenía vuelven en `sin_precio` para
 * que el panel los muestre como pregunta (ley 1: no se rellenan).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { receta?: string } | null;
  if (!body?.receta) return NextResponse.json({ error: "receta (nombre) requerida" }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: recetaRow, error } = await sb
    .from("recetas")
    .select("etapas")
    .eq("nombre", body.receta)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recetaRow) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });

  const materiales = materialesDeReceta(recetaRow as unknown as Pick<Receta, "etapas">);
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = await refrescarRetail(materiales, hoy);

  if (filas.length > 0) {
    const { error: errUpsert } = await sb
      .from("precios_items")
      .upsert(filas, { onConflict: "item,origen" });
    if (errUpsert) return NextResponse.json({ error: errUpsert.message }, { status: 500 });
  }

  const conPrecio = new Set(filas.map((f) => f.item));
  return NextResponse.json({
    actualizados: filas.length,
    sin_precio: materiales.filter((m) => !conPrecio.has(m)),
  });
}
