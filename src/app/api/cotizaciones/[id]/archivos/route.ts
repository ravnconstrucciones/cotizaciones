import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Propuestas de una cotización (cara PROPUESTA de la tarjeta /cotizaciones).
 *
 * GET  /api/cotizaciones/[id]/archivos
 *      Lista cotizacion_archivos y firma el bucket privado `obra-archivos`
 *      (url, 1 h). Si una firma falla, la fila sale con url null y la UI la
 *      ignora — nunca rompe.
 *
 * POST /api/cotizaciones/[id]/archivos  (multipart: file, tipo?, titulo?)
 *      Sube un archivo a propuestas/{cotizacion_id}/{ts}.{ext} e inserta la
 *      fila en cotizacion_archivos.
 *
 * El middleware exige sesión en /api/*, por eso el admin client es seguro acá
 * (mismo patrón que /api/obra-archivos).
 */

const BUCKET = "obra-archivos";
const EXPIRA_S = 3600;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB: una propuesta (PDF/imagen).

type Params = { params: Promise<{ id: string }> };

type Fila = {
  id: string;
  cotizacion_id: string;
  tipo: string;
  titulo: string | null;
  storage_path: string | null;
  creado_at: string;
};

export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const cotizacionId = String(id ?? "").trim();
  if (!cotizacionId) {
    return NextResponse.json({ error: "cotizacion_id requerido." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizacion_archivos")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .order("creado_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as Fila[];
  const paths = filas
    .map((f) => f.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  const urlPorPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRA_S);
    if (signErr) {
      console.error("[/api/cotizaciones/[id]/archivos] signed urls:", signErr.message);
    } else if (firmadas) {
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
      }
    }
  }

  const archivos = filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    titulo: f.titulo,
    creado_at: f.creado_at,
    url: f.storage_path ? urlPorPath.get(f.storage_path) ?? null : null,
  }));

  const res = NextResponse.json({ archivos });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const cotizacionId = String(id ?? "").trim();
    if (!cotizacionId) {
      return NextResponse.json({ error: "cotizacion_id requerido." }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo supera los 25 MB." }, { status: 413 });
    }

    const tipoRaw = form.get("tipo");
    const tipo = typeof tipoRaw === "string" && tipoRaw.trim() ? tipoRaw.trim() : "propuesta";
    const tituloRaw = form.get("titulo");
    const titulo = typeof tituloRaw === "string" && tituloRaw.trim() ? tituloRaw.trim() : null;

    const sb = createSupabaseAdminClient();

    // La cotización tiene que existir (FK + verificación temprana).
    const { data: cot, error: eCot } = await sb
      .from("cotizaciones")
      .select("id")
      .eq("id", cotizacionId)
      .maybeSingle();
    if (eCot || !cot) {
      return NextResponse.json(
        { error: eCot?.message ?? "Cotización no encontrada." },
        { status: 404 }
      );
    }

    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `propuestas/${cotizacionId}/${Date.now()}.${ext || "pdf"}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: eUp } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (eUp) {
      return NextResponse.json({ error: eUp.message }, { status: 500 });
    }

    const { data: fila, error: eIns } = await sb
      .from("cotizacion_archivos")
      .insert({ cotizacion_id: cotizacionId, tipo, titulo, storage_path: path })
      .select("id, tipo, titulo, creado_at")
      .single();
    if (eIns) {
      // Rollback del archivo si no pudimos persistir la fila.
      await sb.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: eIns.message }, { status: 500 });
    }

    const { data: signed } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(path, EXPIRA_S);

    return NextResponse.json({
      ok: true,
      archivo: {
        id: fila.id,
        tipo: fila.tipo,
        titulo: fila.titulo,
        creado_at: fila.creado_at,
        url: signed?.signedUrl ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
