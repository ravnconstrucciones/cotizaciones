import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/adn/sin-clasificar — imágenes que entraron por WhatsApp y quedaron
 * en Archivados sin destino (vista ADN, iteración 4): eventos estado=archivado
 * cuyo contenido trae media (foto/archivo de WhatsApp) o imagen_path (copia
 * que el bot subió al bucket `referencias`).
 *
 * Si hay imagen_path se firma URL (1 h) y la grilla la muestra de verdad;
 * si solo hay media de WhatsApp (id efímero de Graph, sin token acá) la UI
 * muestra la tarjeta con placeholder — en ambos casos el destino es
 * resolverla en /archivados.
 */

const BUCKET = "referencias";
const EXPIRA_S = 3600;

type ContenidoMedia = {
  media?: { id?: string; mime?: string | null; tipo_wa?: string | null } | null;
  imagen_path?: string | null;
  texto?: string | null;
};

export async function GET() {
  const sb = createSupabaseAdminClient();

  const { data, error } = await sb
    .from("eventos")
    .select("id, creado_at, titulo, contenido")
    .eq("estado", "archivado")
    .or("contenido->media.not.is.null,contenido->>imagen_path.not.is.null")
    .order("creado_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []).map((e) => {
    const c = (e.contenido ?? {}) as ContenidoMedia;
    return {
      id: e.id as string,
      creado_at: e.creado_at as string,
      titulo: e.titulo as string,
      texto: typeof c.texto === "string" ? c.texto : null,
      imagen_path:
        typeof c.imagen_path === "string" && c.imagen_path.trim()
          ? c.imagen_path.trim()
          : null,
      tipo_media: c.media?.tipo_wa ?? null,
      imagen_url: null as string | null,
    };
  });

  const paths = filas
    .map((f) => f.imagen_path)
    .filter((p): p is string => p !== null);
  if (paths.length > 0) {
    const { data: firmadas, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRA_S);
    if (signErr) {
      console.error("[/api/adn/sin-clasificar] signed urls:", signErr.message);
    } else if (firmadas) {
      const urlPorPath = new Map<string, string>();
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
      }
      for (const fila of filas) {
        if (fila.imagen_path) fila.imagen_url = urlPorPath.get(fila.imagen_path) ?? null;
      }
    }
  }

  return NextResponse.json({ sin_clasificar: filas });
}
