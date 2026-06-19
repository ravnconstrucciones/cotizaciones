import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTADOS = ["borrador", "en_revision", "aprobada", "rechazada", "documento_emitido"];
const BUCKET = "obra-archivos";
const PORTADA_EXPIRA_S = 60 * 30;

type FilaLista = {
  id: string;
  creado_at: string;
  titulo: string;
  zona: string | null;
  estado: string;
  total_min: number | null;
  total_max: number | null;
  presupuesto_id: string | null;
  trabajo_id: string | null;
  foto_portada_path: string | null;
};

/**
 * GET /api/cotizaciones[?estado=en_revision] — galería de tarjetas.
 * Trae la portada firmada (foto_portada_url) y la cantidad de propuestas
 * adjuntas (archivos_count) para que la tarjeta sepa si hay PROPUESTA.
 */
export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const estado = req.nextUrl.searchParams.get("estado");
  let q = sb
    .from("cotizaciones")
    .select(
      "id, creado_at, titulo, zona, estado, total_min, total_max, presupuesto_id, trabajo_id, foto_portada_path"
    )
    .order("creado_at", { ascending: false })
    .limit(200);
  if (estado && ESTADOS.includes(estado)) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as FilaLista[];

  // Portadas: una sola firma batch del bucket privado.
  const portadaPorPath = new Map<string, string>();
  const portadaPaths = filas
    .map((f) => f.foto_portada_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (portadaPaths.length > 0) {
    const { data: firmadas } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(portadaPaths, PORTADA_EXPIRA_S);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && f.path) portadaPorPath.set(f.path, f.signedUrl);
    }
  }

  // Conteo de propuestas por cotización (una query, contado en memoria).
  const countPorCotizacion = new Map<string, number>();
  if (filas.length > 0) {
    const { data: archivos } = await sb
      .from("cotizacion_archivos")
      .select("cotizacion_id")
      .in(
        "cotizacion_id",
        filas.map((f) => f.id)
      );
    for (const a of (archivos ?? []) as Array<{ cotizacion_id: string }>) {
      countPorCotizacion.set(a.cotizacion_id, (countPorCotizacion.get(a.cotizacion_id) ?? 0) + 1);
    }
  }

  const cotizaciones = filas.map((f) => ({
    ...f,
    foto_portada_url: f.foto_portada_path
      ? portadaPorPath.get(f.foto_portada_path) ?? null
      : null,
    archivos_count: countPorCotizacion.get(f.id) ?? 0,
  }));

  const res = NextResponse.json({ cotizaciones });
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
