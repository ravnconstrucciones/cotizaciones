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

  const filas = (data ?? [])
    .map((e) => {
      const c = (e.contenido ?? {}) as ContenidoMedia;
      const id = typeof e.id === "string" ? e.id : "";
      return {
        id,
        creado_at: typeof e.creado_at === "string" ? e.creado_at : "",
        titulo: typeof e.titulo === "string" ? e.titulo : "",
        texto: typeof c.texto === "string" ? c.texto : null,
        imagen_path:
          typeof c.imagen_path === "string" && c.imagen_path.trim()
            ? c.imagen_path.trim()
            : null,
        tipo_media: c.media?.tipo_wa ?? null,
        imagen_url: null as string | null,
      };
    })
    // Una fila sin id no se puede resolver ni clavear en la grilla → se descarta.
    .filter((f) => f.id !== "");

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
      let fallidas = 0;
      for (const f of firmadas) {
        // createSignedUrls puede fallar parcialmente: cada entrada trae su
        // propio `error`. Las que fallaron quedan fuera del mapa (url null en
        // la UI) y se cuentan para dejar rastro sin romper el resto.
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
        else fallidas++;
      }
      if (fallidas > 0) {
        console.warn(
          `[/api/adn/sin-clasificar] ${fallidas}/${paths.length} firmas fallaron (se sirven con placeholder)`
        );
      }
      for (const fila of filas) {
        if (fila.imagen_path) fila.imagen_url = urlPorPath.get(fila.imagen_path) ?? null;
      }
    }
  }

  const res = NextResponse.json({ sin_clasificar: filas });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}
