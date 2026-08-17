import { NextRequest } from "next/server";
import { requireQuoteId, tallerErrorResponse, tallerJson } from "../../../../taller/http";
import { TallerError, tallerStore } from "../../../../taller/store";
import { parsePostulanteDraft } from "../../../../taller/types";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Un presupuesto de MO más sobre la mesa. Entra sin elegir. */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const draft = parsePostulanteDraft(await request.json().catch(() => null));
    if (!draft) {
      throw new TallerError(
        "invalid_input",
        "El postulante llegó incompleto: hacen falta proveedor, precio y fecha."
      );
    }
    return tallerJson(await tallerStore().addPostulante(quoteId, draft), 201);
  } catch (error) {
    return tallerErrorResponse(error);
  }
}

/**
 * "El que me cobran a mí". `id: null` desmarca el rubro y el costo vuelve a la
 * investigación.
 */
export async function PATCH(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.batchId !== "string" || !body.batchId.trim()) {
      throw new TallerError("invalid_input", "Falta el rubro del postulante.");
    }
    const id = body.id;
    if (id !== null && (typeof id !== "string" || !id.trim())) {
      throw new TallerError("invalid_input", "El postulante elegido llegó sin identificador.");
    }

    await tallerStore().elegirPostulante(quoteId, body.batchId, id);
    return tallerJson({ ok: true });
  } catch (error) {
    return tallerErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new TallerError("invalid_input", "Falta el postulante que se quiere sacar.");
    await tallerStore().dropPostulante(quoteId, id);
    return tallerJson({ ok: true });
  } catch (error) {
    return tallerErrorResponse(error);
  }
}
