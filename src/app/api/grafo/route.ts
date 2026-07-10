import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/grafo — el grafo de conocimiento del vault (graphify), slim y con
 * layout precalculado. La fuente vive en el bucket privado `grafo`
 * (grafo-app.json, ~117 KB): lo genera exportar-app.py y lo sube
 * subir-a-app.sh desde ~/Obsidian/RAVN/graphify-out/ tras cada
 * `/graphify --update`. La app solo dibuja — nada de física en el cliente.
 *
 * Formato: { actualizado, stats, comunidades: {id→label},
 *   nodos: [[x,y,grado,comunidad,label], ...] (coords cuantizadas 0-4095),
 *   aristas: [[iSource,iTarget], ...] (índices sobre nodos) }
 */

const BUCKET = "grafo";
const ARCHIVO = "grafo-app.json";

export async function GET() {
  const sb = createSupabaseAdminClient();

  const { data, error } = await sb.storage.from(BUCKET).download(ARCHIVO);
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "No se pudo bajar el grafo" },
      { status: 500 }
    );
  }

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      "Content-Type": "application/json",
      // El grafo cambia solo cuando se corre --update en la Mac: 5 min de
      // cache privado alcanzan para que navegar la app no lo re-baje.
      "Cache-Control": "private, max-age=300",
    },
  });
}
