import { NextRequest } from "next/server";
import { firmarSubida } from "../../../../../adapters/app-ravn-write-adapter";
import { tallerJson, requireQuoteId } from "../../../../../taller/http";
import { intakeErrorResponse } from "../../respuestas";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake/archivos/firmar?quote= — paso 1 de la subida directa para
 * archivos grandes: App RAVN firma, el navegador hace PUT del archivo a
 * `upload_url` (Storage, sin pasar por Vercel) y después confirma.
 */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const body = (await request.json().catch(() => ({}))) as {
      nombre?: unknown;
      size?: unknown;
      contentType?: unknown;
    };
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return tallerJson({ error: "Falta el nombre del archivo." }, 400);
    const size = typeof body.size === "number" ? body.size : 0;
    const contentType =
      typeof body.contentType === "string" && body.contentType
        ? body.contentType
        : "application/octet-stream";

    const firma = await firmarSubida(quoteId, { nombre, size, contentType });

    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
    if (!supabaseUrl) {
      return tallerJson({ error: "Falta SUPABASE_URL para armar la URL de subida." }, 503);
    }
    const upload_url = `${supabaseUrl}/storage/v1/object/upload/sign/obra-archivos/${firma.path}?token=${encodeURIComponent(firma.token)}`;
    return tallerJson({ ok: true, path: firma.path, upload_url, max_bytes: firma.maxBytes });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
