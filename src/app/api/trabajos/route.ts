import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { tituloTrabajo, validarNuevoTrabajo } from "@/lib/trabajos-validate";

/**
 * Barra de comando del tablero → cola de trabajos.
 * POST: inserta en `trabajos_cola` (origen 'tablero', estado default 'pendiente')
 *       + evento espejo en `eventos` para el feed Actividad.
 * GET: últimos 10 trabajos (la UI vive escucha cambios por Realtime).
 * Auth: el middleware global ya exige sesión para /api/*.
 */

export async function POST(req: NextRequest) {
  const v = validarNuevoTrabajo(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: trabajo, error } = await sb
    .from("trabajos_cola")
    .insert({
      tipo: v.data.tipo,
      origen: "tablero",
      prompt: v.data.prompt,
      contexto: v.data.contexto,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { error: evError } = await sb.from("eventos").insert({
    origen: "tablero",
    tipo: "trabajo_creado",
    estado: "procesado",
    titulo: tituloTrabajo(v.data.tipo, v.data.prompt),
    contenido: { trabajo_id: trabajo.id, tipo: v.data.tipo, prompt: v.data.prompt },
    destino_tabla: "trabajos_cola",
    destino_id: trabajo.id,
  });
  if (evError) {
    // El trabajo ya quedó en cola: el evento espejo no es razón para fallar el request.
    console.error("[/api/trabajos] insert eventos:", evError.message);
  }

  return NextResponse.json({ trabajo });
}

export async function GET() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("trabajos_cola")
    .select("*")
    .order("creado_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const res = NextResponse.json({ trabajos: data ?? [] });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}
