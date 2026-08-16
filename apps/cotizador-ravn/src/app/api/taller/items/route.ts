import { NextRequest } from "next/server";
import { requireQuoteId, tallerErrorResponse, tallerJson } from "../../../../taller/http";
import { TallerError, tallerStore } from "../../../../taller/store";
import { parseManualDraft } from "../../../../taller/types";

export const dynamic = "force-dynamic";

/** Alta de un ítem a mano dentro de un rubro. */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const draft = parseManualDraft(await request.json().catch(() => null));
    if (!draft) {
      throw new TallerError("invalid_input", "El ítem a mano llegó incompleto.");
    }
    return tallerJson(await tallerStore().addManualItem(quoteId, draft), 201);
  } catch (error) {
    return tallerErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const id = request.nextUrl.searchParams.get("id");
    if (!id) throw new TallerError("invalid_input", "Falta el ítem que se quiere sacar.");
    await tallerStore().dropManualItem(quoteId, id);
    return tallerJson({ ok: true });
  } catch (error) {
    return tallerErrorResponse(error);
  }
}
