import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTADOS = ["borrador", "listo", "enviado", "cotizado"] as const;
const BUCKET = "obra-archivos";
const PORTADA_EXPIRA_S = 60 * 30;

type FilaLista = {
  id: string;
  creado_at: string;
  actualizado_at: string;
  titulo: string;
  direccion: string | null;
  cliente: string | null;
  estado: string;
  presupuesto_id: string | null;
  cotizacion_id: string | null;
  foto_portada_path: string | null;
};

/**
 * GET /api/diagnosticos[?estado=listo] — galería de diagnósticos.
 * Espeja /api/cotizaciones: portadas firmadas en una sola llamada batch.
 */
export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const estado = req.nextUrl.searchParams.get("estado");
  let q = sb
    .from("diagnosticos")
    .select(
      "id, creado_at, actualizado_at, titulo, direccion, cliente, estado, presupuesto_id, cotizacion_id, foto_portada_path"
    )
    .order("creado_at", { ascending: false })
    .limit(200);
  if (estado && (ESTADOS as readonly string[]).includes(estado)) q = q.eq("estado", estado);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as FilaLista[];

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

  const diagnosticos = filas.map((f) => ({
    ...f,
    foto_portada_url: f.foto_portada_path
      ? portadaPorPath.get(f.foto_portada_path) ?? null
      : null,
  }));

  const res = NextResponse.json({ diagnosticos });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}

/**
 * POST /api/diagnosticos — crea un diagnóstico.
 * Lo usan el tablero (alta manual) y la Mac (puente/daemon) cuando termina de
 * procesar un relevamiento de `trabajos_cola`.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.titulo !== "string" || !body.titulo.trim()) {
    return NextResponse.json({ error: "titulo requerido" }, { status: 400 });
  }
  const estado = (ESTADOS as readonly string[]).includes(body.estado) ? body.estado : "borrador";
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("diagnosticos")
    .insert({
      titulo: body.titulo.trim(),
      direccion: typeof body.direccion === "string" ? body.direccion.trim() : null,
      cliente: typeof body.cliente === "string" ? body.cliente.trim() : null,
      estado,
      presupuesto_id: body.presupuesto_id ?? null,
      trabajo_id: body.trabajo_id ?? null,
      relevamiento: typeof body.relevamiento === "string" ? body.relevamiento : "",
      contenido: body.contenido ?? {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
