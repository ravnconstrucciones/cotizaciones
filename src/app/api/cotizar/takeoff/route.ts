import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cotizar, FaltanParametrosError } from "@/lib/cotizador/cotizar";
import { combinarPrecios, revisadoPorItem } from "@/lib/cotizador/precios-cache";
import { itemsDeReceta } from "@/lib/cotizador/takeoff-helpers";
import type { PrecioItemRow, Receta } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

/**
 * POST /api/cotizar/takeoff — el corazón del panel exploratorio (Capa 3).
 * Receta + parámetros → desglose vivo con precios del cache fechado. NO crea
 * fila en `cotizaciones`: es exploración, el flujo formal sigue siendo la mesa.
 * Ítem sin precio en cache → sin_precio (pregunta visible) — ley 1.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { receta?: string; parametros?: Record<string, number | string> }
    | null;
  if (!body?.receta || typeof body.receta !== "string") {
    return NextResponse.json({ error: "receta (nombre) requerida" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: recetaRow, error } = await sb
    .from("recetas")
    .select("*")
    .eq("nombre", body.receta)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!recetaRow) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });

  const receta = recetaRow as unknown as Receta;
  const items = itemsDeReceta(receta);
  const { data: filas, error: errPrecios } = await sb
    .from("precios_items")
    .select("item, origen, valor, fuente, fecha, revisado_at")
    .in("item", items);
  if (errPrecios) return NextResponse.json({ error: errPrecios.message }, { status: 500 });

  const rows = (filas ?? []) as PrecioItemRow[];
  try {
    const calculo = cotizar({
      receta,
      parametros: body.parametros ?? {},
      precios: combinarPrecios(rows),
    });
    return NextResponse.json({ ...calculo, revisado: revisadoPorItem(rows) });
  } catch (e) {
    if (e instanceof FaltanParametrosError) {
      return NextResponse.json(
        { error: "faltan_parametros", faltan: e.faltan },
        { status: 400 }
      );
    }
    throw e;
  }
}
