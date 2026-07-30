import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ESTADOS = ["borrador", "listo", "enviado", "cotizado"] as const;
const BUCKET = "obra-archivos";
const EXPIRA_S = 60 * 30;

type Params = { params: Promise<{ id: string }> };

/** GET /api/diagnosticos/[id] — el diagnóstico completo, con fotos firmadas. */
export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb.from("diagnosticos").select("*").eq("id", id).single();
  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // Las fotos de las secciones son storage_paths del bucket privado: se firman
  // acá para que el cliente nunca vea el path crudo.
  const paths = pathsDeContenido(data.contenido);
  if (data.foto_portada_path) paths.push(data.foto_portada_path as string);
  const firmadaPorPath: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: firmadas } = await sb.storage.from(BUCKET).createSignedUrls(paths, EXPIRA_S);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && f.path) firmadaPorPath[f.path] = f.signedUrl;
    }
  }

  return NextResponse.json({ diagnostico: data, urls: firmadaPorPath });
}

/** PATCH /api/diagnosticos/[id] — edición desde el tablero o desde la Mac. */
export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { actualizado_at: new Date().toISOString() };
  if (typeof body.titulo === "string" && body.titulo.trim()) patch.titulo = body.titulo.trim();
  if (typeof body.direccion === "string") patch.direccion = body.direccion.trim() || null;
  if (typeof body.cliente === "string") patch.cliente = body.cliente.trim() || null;
  if (typeof body.relevamiento === "string") patch.relevamiento = body.relevamiento;
  if (body.contenido && typeof body.contenido === "object") patch.contenido = body.contenido;
  if (body.presupuesto_id !== undefined) patch.presupuesto_id = body.presupuesto_id || null;
  if (typeof body.estado === "string") {
    if (!(ESTADOS as readonly string[]).includes(body.estado)) {
      return NextResponse.json({ error: `estado inválido: ${body.estado}` }, { status: 400 });
    }
    patch.estado = body.estado;
  }

  const sb = createSupabaseAdminClient();
  const { error } = await sb.from("diagnosticos").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Junta los storage_path de las fotos que cuelgan de las secciones. */
function pathsDeContenido(contenido: unknown): string[] {
  const out: string[] = [];
  if (!contenido || typeof contenido !== "object") return out;
  const secciones = (contenido as { secciones?: unknown }).secciones;
  if (!Array.isArray(secciones)) return out;
  for (const s of secciones) {
    const fotos = (s as { fotos?: unknown })?.fotos;
    if (!Array.isArray(fotos)) continue;
    for (const f of fotos) if (typeof f === "string" && f.trim()) out.push(f.trim());
  }
  return out;
}
