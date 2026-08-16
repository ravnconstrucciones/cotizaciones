import { NextRequest } from "next/server";
import { requireQuoteId, tallerErrorResponse, tallerJson } from "../../../../taller/http";
import { TallerError, tallerStore } from "../../../../taller/store";

export const dynamic = "force-dynamic";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cerrar un ítem desde la tarjeta: qué precio usa y con qué valor. */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.itemKey !== "string" || typeof body.origin !== "string") {
      throw new TallerError("invalid_input", "La decisión llegó sin ítem o sin origen de precio.");
    }

    const raw = body.value;
    const value =
      raw === null || raw === undefined
        ? null
        : typeof raw === "number" && Number.isFinite(raw)
          ? raw
          : undefined;
    if (value === undefined) {
      throw new TallerError("invalid_input", "El valor de la decisión no es un número.");
    }

    return tallerJson(
      await tallerStore().saveDecision(quoteId, body.itemKey, body.origin, value)
    );
  } catch (error) {
    return tallerErrorResponse(error);
  }
}

/** Reabrir: el ítem vuelve a la cola. */
export async function DELETE(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const itemKey = request.nextUrl.searchParams.get("item");
    if (!itemKey) throw new TallerError("invalid_input", "Falta el ítem que se quiere reabrir.");
    await tallerStore().clearDecision(quoteId, itemKey);
    return tallerJson({ ok: true });
  } catch (error) {
    return tallerErrorResponse(error);
  }
}
