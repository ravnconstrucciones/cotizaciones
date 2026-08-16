import { NextResponse } from "next/server";
import { TallerError, type TallerErrorCode } from "./store";

const STATUS: Record<TallerErrorCode, number> = {
  invalid_input: 400,
  not_persistable: 409,
  configuration_error: 503,
  timeout: 504,
  network_error: 502,
  upstream_error: 502,
  invalid_response: 502,
};

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function tallerJson(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: NO_STORE });
}

/**
 * Toda ruta del taller contesta igual: el código del dominio decide el status y
 * el mensaje ya viene en castellano, listo para mostrarse en la consola.
 */
export function tallerErrorResponse(error: unknown): NextResponse {
  const known =
    error instanceof TallerError
      ? error
      : new TallerError("upstream_error", "El taller no pudo completar la operación.");

  return NextResponse.json(
    { error: known.message, code: known.code },
    { status: STATUS[known.code], headers: NO_STORE }
  );
}

/** El id de cotización es obligatorio en toda operación del taller. */
export function requireQuoteId(value: string | null): string {
  if (!value || value.trim().length === 0) {
    throw new TallerError("invalid_input", "Falta la cotización sobre la que se está trabajando.");
  }
  return value;
}
