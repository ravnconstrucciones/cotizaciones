import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/cotizaciones/intake — la puerta de entrada del Cotizador.
 *
 * Crea SOLO un borrador vacío de alcance (guard `trg_cotizaciones_guard`:
 * borrador no exige receta). No acepta estado, desglose ni totales: la única
 * forma de que esta cotización se active es confirmar el reconocimiento, que
 * crea la receta candidata. A diferencia de POST /api/cotizaciones (sesión),
 * esta ruta está allowlisteada para la credencial de escritura del Cotizador
 * y por eso su superficie es mínima a propósito.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { titulo?: unknown } | null;
  const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";
  if (!titulo) return NextResponse.json({ error: "titulo requerido" }, { status: 400 });
  if (titulo.length > 200) {
    return NextResponse.json({ error: "titulo demasiado largo (máx. 200)" }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .insert({
      titulo,
      estado: "borrador",
      ficha: { origen: "puerta-cotizador" },
      desglose: {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
