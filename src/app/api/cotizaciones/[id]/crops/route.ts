import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CROP_MAX_BYTES, pathCropItem } from "@/lib/cotizador/crops";

/**
 * Recortes del render por ítem (Tramo B ítem 5). El render base de la
 * cotización es su foto de portada (foto_portada_path); cada recorte vive en
 * cotizacion_archivos con tipo 'crop_item' + item_nombre (único por ítem).
 *
 * GET    /api/cotizaciones/[id]/crops
 *        → { render_url, crops: { [item_nombre]: url } } (signed URLs, 1 h).
 *
 * POST   /api/cotizaciones/[id]/crops  (multipart: file, item_nombre)
 *        Sube el recorte (ya cortado en el browser) y reemplaza el anterior
 *        del mismo ítem si existía.
 *
 * DELETE /api/cotizaciones/[id]/crops  (json: { item_nombre })
 *        Quita el recorte del ítem (fila + archivo).
 *
 * El middleware exige sesión en /api/*, por eso el admin client es seguro acá
 * (mismo patrón que /portada y /archivos).
 */

const BUCKET = "obra-archivos";
const EXPIRA_S = 3600;
const TIPOS_OK = ["image/jpeg", "image/png", "image/webp"];

type Params = { params: Promise<{ id: string }> };

type FilaCrop = { id: string; item_nombre: string | null; storage_path: string | null };

async function cotizacionValida(id: string) {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("cotizaciones")
    .select("id, foto_portada_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return { sb, foto_portada_path: (data as { foto_portada_path: string | null }).foto_portada_path };
}

export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const cotizacionId = String(id ?? "").trim();
  if (!cotizacionId) {
    return NextResponse.json({ error: "cotizacion_id requerido." }, { status: 400 });
  }
  const cot = await cotizacionValida(cotizacionId);
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
  const { sb } = cot;

  const { data, error } = await sb
    .from("cotizacion_archivos")
    .select("id, item_nombre, storage_path")
    .eq("cotizacion_id", cotizacionId)
    .eq("tipo", "crop_item");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as FilaCrop[];
  const paths = filas
    .map((f) => f.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (cot.foto_portada_path) paths.push(cot.foto_portada_path);

  const urlPorPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRA_S);
    if (signErr) {
      console.error("[/api/cotizaciones/[id]/crops] signed urls:", signErr.message);
    } else if (firmadas) {
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
      }
    }
  }

  const crops: Record<string, string> = {};
  for (const f of filas) {
    if (!f.item_nombre || !f.storage_path) continue;
    const url = urlPorPath.get(f.storage_path);
    if (url) crops[f.item_nombre] = url;
  }

  const res = NextResponse.json({
    render_url: cot.foto_portada_path ? (urlPorPath.get(cot.foto_portada_path) ?? null) : null,
    crops,
  });
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
    const itemRaw = form.get("item_nombre");
    const itemNombre = typeof itemRaw === "string" ? itemRaw.trim() : "";
    if (!itemNombre) {
      return NextResponse.json({ error: "Falta item_nombre." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }
    if (file.size > CROP_MAX_BYTES) {
      return NextResponse.json({ error: "El recorte supera los 8 MB." }, { status: 413 });
    }
    if (file.type && !TIPOS_OK.includes(file.type)) {
      return NextResponse.json({ error: "Formato no soportado (JPG/PNG/WEBP)." }, { status: 415 });
    }

    const cot = await cotizacionValida(cotizacionId);
    if (!cot) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
    const { sb } = cot;

    // Recorte previo del mismo ítem (para reemplazarlo).
    const { data: previas } = await sb
      .from("cotizacion_archivos")
      .select("id, storage_path")
      .eq("cotizacion_id", cotizacionId)
      .eq("tipo", "crop_item")
      .eq("item_nombre", itemNombre);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = pathCropItem(cotizacionId, itemNombre, ext, Date.now());

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: eUp } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });
    if (eUp) return NextResponse.json({ error: eUp.message }, { status: 500 });

    // Reemplazo: borra la fila previa ANTES del insert (índice único por ítem).
    const idsPrevios = (previas ?? []).map((p) => p.id as string);
    if (idsPrevios.length > 0) {
      await sb.from("cotizacion_archivos").delete().in("id", idsPrevios);
    }

    const { error: eIns } = await sb.from("cotizacion_archivos").insert({
      cotizacion_id: cotizacionId,
      tipo: "crop_item",
      titulo: itemNombre,
      item_nombre: itemNombre,
      storage_path: path,
    });
    if (eIns) {
      // Rollback del archivo si no pudimos persistir la fila.
      await sb.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: eIns.message }, { status: 500 });
    }

    // Archivos previos: best-effort, ya no los referencia nadie.
    const pathsPrevios = (previas ?? [])
      .map((p) => p.storage_path as string | null)
      .filter((p): p is string => !!p && p !== path);
    if (pathsPrevios.length > 0) {
      await sb.storage.from(BUCKET).remove(pathsPrevios).catch(() => {});
    }

    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, EXPIRA_S);
    return NextResponse.json({ ok: true, item_nombre: itemNombre, url: signed?.signedUrl ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const cotizacionId = String(id ?? "").trim();
    if (!cotizacionId) {
      return NextResponse.json({ error: "cotizacion_id requerido." }, { status: 400 });
    }
    const body = (await req.json().catch(() => null)) as { item_nombre?: string } | null;
    const itemNombre = typeof body?.item_nombre === "string" ? body.item_nombre.trim() : "";
    if (!itemNombre) {
      return NextResponse.json({ error: "Falta item_nombre." }, { status: 400 });
    }

    const cot = await cotizacionValida(cotizacionId);
    if (!cot) return NextResponse.json({ error: "Cotización no encontrada." }, { status: 404 });
    const { sb } = cot;

    const { data: filas, error } = await sb
      .from("cotizacion_archivos")
      .select("id, storage_path")
      .eq("cotizacion_id", cotizacionId)
      .eq("tipo", "crop_item")
      .eq("item_nombre", itemNombre);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (filas ?? []).map((f) => f.id as string);
    if (ids.length > 0) {
      const { error: eDel } = await sb.from("cotizacion_archivos").delete().in("id", ids);
      if (eDel) return NextResponse.json({ error: eDel.message }, { status: 500 });
    }
    const paths = (filas ?? [])
      .map((f) => f.storage_path as string | null)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      await sb.storage.from(BUCKET).remove(paths).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
