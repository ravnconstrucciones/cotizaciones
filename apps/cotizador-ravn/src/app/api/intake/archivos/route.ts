import { NextRequest } from "next/server";
import { subirArchivo } from "../../../../adapters/app-ravn-write-adapter";
import { tallerJson, requireQuoteId } from "../../../../taller/http";
import { intakeErrorResponse } from "../respuestas";

export const dynamic = "force-dynamic";

// Vercel corta bodies en ~4,5 MB: esta ruta es el camino corto para archivos
// chicos; los grandes van por firmar + PUT directo a Storage + confirmar.
const MAX_BYTES = 4 * 1024 * 1024;

/** POST /api/intake/archivos?quote= (multipart: file) — proxy al adjuntar de App RAVN. */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return tallerJson({ error: "Falta el archivo." }, 400);
    }
    if (file.size > MAX_BYTES) {
      return tallerJson(
        { error: "Más de 4 MB: subilo por el camino directo (firmar + confirmar)." },
        413
      );
    }
    await subirArchivo(quoteId, file, file.name);
    return tallerJson({ ok: true });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
