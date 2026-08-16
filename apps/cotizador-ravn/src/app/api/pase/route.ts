import { NextRequest } from "next/server";
import { loadQuoteWorkspace } from "../../../adapters/app-ravn-read-adapter";
import {
  pasarExpediente,
  QuoteWriteError,
} from "../../../adapters/app-ravn-write-adapter";
import { tallerJson } from "../../../taller/http";
import { tallerStore } from "../../../taller/store";
import { isPersistableQuoteId } from "../../../taller/types";
import { construirPase, type RubroDelExpediente } from "../../../taller/pase";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

const STATUS: Record<string, number> = {
  configuration_error: 503,
  timeout: 504,
  network_error: 502,
  rejected: 400,
  conflict: 409,
  upstream_error: 502,
  invalid_response: 502,
};

function errorJson(mensaje: string, status: number) {
  return Response.json({ error: mensaje }, { status, headers: NO_STORE });
}

/**
 * POST /api/pase — el laboratorio deja el extracto y el número en App RAVN.
 *
 * El navegador manda lo mínimo: qué cotización y qué precio fijó Eze con el
 * dial. El EXTRACTO no se lo pide al cliente: se deriva acá de lo persistido
 * (la mesa en la base del taller + el expediente que devuelve App RAVN), así
 * lo que viaja es lo que realmente quedó guardado y no lo que dice tener una
 * pantalla abierta hace media hora.
 */
export async function POST(request: NextRequest) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return errorJson("El pase llegó sin datos.", 400);
  }

  const datos = cuerpo as { quote?: unknown; precioPropuesta?: unknown } | null;
  const quoteId = typeof datos?.quote === "string" ? datos.quote.trim() : "";
  if (!quoteId) {
    return errorJson("Falta la cotización que se está pasando.", 400);
  }
  if (!isPersistableQuoteId(quoteId)) {
    return errorJson(
      "Esta es la vista de prueba: no hay una cotización real a la que pasarle el expediente.",
      409
    );
  }

  const precioCrudo = datos?.precioPropuesta ?? null;
  const precioPropuesta =
    precioCrudo === null
      ? null
      : typeof precioCrudo === "number" && Number.isFinite(precioCrudo) && precioCrudo >= 0
        ? precioCrudo
        : undefined;
  if (precioPropuesta === undefined) {
    return errorJson("El precio a pasar tiene que ser un número.", 400);
  }

  try {
    const [workspace, taller] = await Promise.all([
      loadQuoteWorkspace(quoteId),
      tallerStore().read(quoteId),
    ]);

    const rubros: RubroDelExpediente[] = workspace.snapshot.batches.map((batch) => ({
      id: batch.id,
      etapa: batch.etapa,
      itemNames: batch.itemNames,
    }));

    const { payload, descartados } = construirPase({ rubros, taller, precioPropuesta });
    const resultado = await pasarExpediente(quoteId, payload);

    return tallerJson({ ok: true, ...resultado, descartados });
  } catch (error) {
    if (error instanceof QuoteWriteError) {
      return errorJson(error.message, STATUS[error.code] ?? 502);
    }
    // Lectura del expediente o de la mesa: el pase no salió, y decirlo importa
    // más que el detalle técnico.
    const mensaje =
      error instanceof Error && error.message
        ? error.message
        : "No se pudo armar el pase.";
    return errorJson(mensaje, 502);
  }
}
