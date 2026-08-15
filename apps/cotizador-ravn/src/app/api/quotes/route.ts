import { NextRequest, NextResponse } from "next/server";
import { loadQuoteWorkspace, QuoteReadError } from "../../../adapters";
import { createPreviewData } from "../../../domain";

export const dynamic = "force-dynamic";

function previewIsAllowed(request: NextRequest): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.COTIZADOR_PREVIEW_ENABLED === "1" &&
    request.nextUrl.searchParams.get("preview") === "1"
  );
}

function statusFor(error: QuoteReadError): number {
  switch (error.code) {
    case "no_active_quote":
      return 404;
    case "configuration_error":
      return 503;
    case "timeout":
    case "network_error":
    case "upstream_error":
    case "invalid_response":
      return 502;
  }
}

export async function GET(request: NextRequest) {
  try {
    const data = previewIsAllowed(request)
      ? createPreviewData()
      : await loadQuoteWorkspace(request.nextUrl.searchParams.get("quote") ?? undefined);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const readError =
      error instanceof QuoteReadError
        ? error
        : new QuoteReadError(
            "upstream_error",
            "No se pudo construir el estado observable de la cotización."
          );

    return NextResponse.json(
      { error: readError.message, code: readError.code },
      {
        status: statusFor(readError),
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      }
    );
  }
}
