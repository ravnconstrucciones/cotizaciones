import { NextRequest } from "next/server";
import { confirmarSubida } from "../../../../../adapters/app-ravn-write-adapter";
import { tallerJson, requireQuoteId } from "../../../../../taller/http";
import { intakeErrorResponse } from "../../respuestas";

export const dynamic = "force-dynamic";

/** POST /api/intake/archivos/confirmar?quote= — paso 2: el objeto ya está en Storage. */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const body = (await request.json().catch(() => ({}))) as { path?: unknown; titulo?: unknown };
    const path = typeof body.path === "string" ? body.path.trim() : "";
    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    if (!path) return tallerJson({ error: "Falta el path firmado." }, 400);
    await confirmarSubida(quoteId, { path, titulo: titulo || path.split("/").pop() || "archivo" });
    return tallerJson({ ok: true });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
