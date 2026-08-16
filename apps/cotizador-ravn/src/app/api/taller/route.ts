import { NextRequest } from "next/server";
import { requireQuoteId, tallerErrorResponse, tallerJson } from "../../../taller/http";
import { tallerStore } from "../../../taller/store";

export const dynamic = "force-dynamic";

/** Lo que Eze dejó sobre la mesa de esta cotización: ítems a mano y decisiones. */
export async function GET(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    return tallerJson(await tallerStore().read(quoteId));
  } catch (error) {
    return tallerErrorResponse(error);
  }
}
