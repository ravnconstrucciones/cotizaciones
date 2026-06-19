import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/cotizaciones/[id]/portada — subir/cambiar la FOTO DE PORTADA de la
 * cotización (cara de tarjeta de /cotizaciones, espejo de /obras/[id]/portada).
 *
 * [id] = cotizacion_id. Recibe multipart con `file`. Sube al bucket privado
 * `obra-archivos` (mismo bucket que las obras), actualiza
 * cotizaciones.foto_portada_path y borra la portada anterior (best-effort).
 * Devuelve una signed URL para que la card se actualice al instante.
 */

const BUCKET = "obra-archivos";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB: una foto, no un video.
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

type Params = { params: Promise<{ id: string }> };

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
      return NextResponse.json({ error: "La imagen supera los 8 MB." }, { status: 413 });
    }
    if (file.type && !TIPOS_OK.includes(file.type)) {
      return NextResponse.json({ error: "Formato no soportado (usá JPG/PNG/WEBP)." }, { status: 415 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: cot, error: eCot } = await supabase
      .from("cotizaciones")
      .select("id, foto_portada_path")
      .eq("id", cotizacionId)
      .maybeSingle();
    if (eCot || !cot) {
      return NextResponse.json(
        { error: eCot?.message ?? "Cotización no encontrada." },
        { status: 404 }
      );
    }
    const pathPrevio = (cot as { foto_portada_path: string | null }).foto_portada_path;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `portadas-cotizacion/${cotizacionId}/${Date.now()}.${ext || "jpg"}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: eUp } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });
    if (eUp) {
      return NextResponse.json({ error: eUp.message }, { status: 500 });
    }

    const { error: eUpd } = await supabase
      .from("cotizaciones")
      .update({ foto_portada_path: path })
      .eq("id", cotizacionId);
    if (eUpd) {
      // Rollback del archivo si no pudimos persistir el path.
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: eUpd.message }, { status: 500 });
    }

    // Borra la portada anterior (best-effort; no rompe si falla).
    if (pathPrevio && pathPrevio !== path) {
      await supabase.storage.from(BUCKET).remove([pathPrevio]).catch(() => {});
    }

    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 30);

    return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
