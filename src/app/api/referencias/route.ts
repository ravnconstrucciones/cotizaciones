import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/referencias?tipo=filosofia|estetica&limit=N
 * Lista la tabla `referencias` (desc por creado_at) y firma las imágenes del
 * bucket privado `referencias` (signed URLs, 1 h). Si una firma falla, la fila
 * sale con imagen_url: null y la UI muestra placeholder — nunca rompe.
 */

const BUCKET = "referencias";
const EXPIRA_S = 3600;

export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();

  const tipo = req.nextUrl.searchParams.get("tipo");
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;

  let q = sb
    .from("referencias")
    .select("*")
    .order("creado_at", { ascending: false })
    .limit(limit);
  if (tipo === "filosofia" || tipo === "estetica") q = q.eq("tipo", tipo);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = data ?? [];
  const paths = filas
    .map((r) => r.imagen_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  const urlPorPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRA_S);
    if (signErr) {
      console.error("[/api/referencias] signed urls:", signErr.message);
    } else if (firmadas) {
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
      }
    }
  }

  const referencias = filas.map((r) => ({
    ...r,
    imagen_url: r.imagen_path ? urlPorPath.get(r.imagen_path) ?? null : null,
  }));

  return NextResponse.json({ referencias });
}
