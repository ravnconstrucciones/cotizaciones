import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  BUCKET_ARCHIVOS,
  TIPOS_PORTADA_OK,
  armarPathSubida,
  maxBytesDeTipo,
} from "@/lib/cotizador/subida-directa";

/**
 * POST /api/cotizaciones/[id]/archivos/firmar — paso 1 de la subida directa.
 *
 * Body JSON: { nombre, tipo?, size?, contentType? }. Valida la cotización,
 * arma el path canónico y devuelve { path, token, max_bytes } para que el
 * navegador suba DIRECTO al bucket con uploadToSignedUrl (sin pasar por
 * Vercel, que corta los bodies en ~4,5 MB). La fila recién se crea en
 * /confirmar, cuando el objeto ya existe.
 *
 * El chequeo de `size` acá es de cortesía (mensaje prolijo antes de subir);
 * el techo REAL lo re-verifica /confirmar contra los metadatos del objeto.
 * El middleware exige sesión en /api/*, por eso el admin client es seguro.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const cotizacionId = String(id ?? "").trim();
    if (!cotizacionId) {
      return NextResponse.json({ error: "cotizacion_id requerido." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      nombre?: string;
      tipo?: string;
      size?: number;
      contentType?: string;
    };
    const nombre = String(body.nombre ?? "").trim();
    const tipo = typeof body.tipo === "string" && body.tipo.trim() ? body.tipo.trim() : "propuesta";
    if (!nombre) {
      return NextResponse.json({ error: "nombre requerido." }, { status: 400 });
    }

    const maxBytes = maxBytesDeTipo(tipo);
    if (typeof body.size === "number" && body.size > maxBytes) {
      return NextResponse.json(
        { error: `El archivo supera los ${Math.round(maxBytes / 1024 / 1024)} MB.` },
        { status: 413 }
      );
    }
    if (tipo === "portada" && body.contentType && !TIPOS_PORTADA_OK.includes(body.contentType)) {
      return NextResponse.json(
        { error: "Formato no soportado (usá JPG/PNG/WEBP)." },
        { status: 415 }
      );
    }

    const sb = createSupabaseAdminClient();
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

    const path = armarPathSubida({ cotizacionId, tipo, nombre, ts: Date.now() });
    const { data, error } = await sb.storage.from(BUCKET_ARCHIVOS).createSignedUploadUrl(path);
    if (error || !data?.token) {
      return NextResponse.json(
        { error: error?.message ?? "No se pudo firmar la subida." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, path: data.path, token: data.token, max_bytes: maxBytes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
