import { NextResponse } from "next/server";
import { QuoteWriteError } from "../../../adapters/app-ravn-write-adapter";
import { QuoteReadError } from "../../../adapters/app-ravn-read-adapter";
import { tallerErrorResponse } from "../../../taller/http";
import { TallerError } from "../../../taller/store";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

const STATUS_WRITE: Record<string, number> = {
  configuration_error: 503,
  timeout: 504,
  network_error: 502,
  rejected: 400,
  conflict: 409,
  upstream_error: 502,
  invalid_response: 502,
};

const STATUS_READ: Record<string, number> = {
  configuration_error: 503,
  timeout: 504,
  network_error: 502,
  upstream_error: 502,
  invalid_response: 502,
  no_active_quote: 404,
};

/**
 * Las rutas del intake tocan tres dominios (write adapter, read adapter y el
 * store del taller) y el navegador tiene que recibir SIEMPRE el motivo real en
 * castellano con el status del dominio — nunca un 500 mudo.
 */
export function intakeErrorResponse(error: unknown): NextResponse {
  if (error instanceof QuoteWriteError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: STATUS_WRITE[error.code] ?? 502, headers: NO_STORE }
    );
  }
  if (error instanceof QuoteReadError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: STATUS_READ[error.code] ?? 502, headers: NO_STORE }
    );
  }
  if (error instanceof TallerError) return tallerErrorResponse(error);
  const mensaje =
    error instanceof Error && error.message ? error.message : "La puerta no pudo completar la operación.";
  return NextResponse.json({ error: mensaje }, { status: 502, headers: NO_STORE });
}
