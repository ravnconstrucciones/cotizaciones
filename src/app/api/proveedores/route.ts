import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Los flyers de proveedor los sube el bot al bucket privado `referencias`. */
const BUCKET = "referencias";
const FLYER_EXPIRA_S = 60 * 30;

type FilaProveedor = {
  id: string;
  nombre: string;
  rubro: string | null;
  telefonos: string[] | null;
  zona: string | null;
  notas: string | null;
  origen: string | null;
  imagen_path: string | null;
  created_at: string;
};

/**
 * GET /api/proveedores — agenda completa (solo activos), con el flyer firmado
 * (imagen_url) para la miniatura de la tarjeta. El filtrado por rubro/nombre
 * es client-side: la agenda es chica y así la búsqueda es instantánea.
 */
export async function GET() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("proveedores")
    .select("id, nombre, rubro, telefonos, zona, notas, origen, imagen_path, created_at")
    .eq("activo", true)
    .order("nombre", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as FilaProveedor[];

  // Flyers: una sola firma batch del bucket privado (patrón de /api/cotizaciones).
  const urlPorPath = new Map<string, string>();
  const paths = filas
    .map((f) => f.imagen_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    const { data: firmadas } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, FLYER_EXPIRA_S);
    for (const f of firmadas ?? []) {
      if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
    }
  }

  const proveedores = filas.map((f) => ({
    ...f,
    telefonos: Array.isArray(f.telefonos) ? f.telefonos : [],
    imagen_url: f.imagen_path ? urlPorPath.get(f.imagen_path) ?? null : null,
  }));

  const res = NextResponse.json({ proveedores });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}
