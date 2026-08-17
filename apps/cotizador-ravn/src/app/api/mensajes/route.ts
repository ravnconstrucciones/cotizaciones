import { NextRequest } from "next/server";
import { dejarMensaje } from "../../../adapters/app-ravn-write-adapter";
import { tallerJson, requireQuoteId } from "../../../taller/http";
import { isPersistableQuoteId } from "../../../taller/types";
import { intakeErrorResponse } from "../intake/respuestas";

export const dynamic = "force-dynamic";

/** Mismo tope que App RAVN: un mensaje de charla, no un documento. */
const MAX_TEXTO = 4000;

/**
 * POST /api/mensajes?quote= — conversación operativa (17/08): el composer del
 * visor escribe de verdad. El mensaje de Eze persiste en el hilo REAL de App
 * RAVN (cotizacion_mensajes, autor eze) ANTES de que se despache nada — mismo
 * orden inquebrantable que la puerta de entrada — y la respuesta trae la ola
 * de charla armada para que el NAVEGADOR se la entregue al bridge (que vive en
 * la Mac de Eze, no acá). Sin bridge, el mensaje queda guardado igual.
 */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    if (!isPersistableQuoteId(quoteId)) {
      return tallerJson(
        { error: "Esta cotización es una demostración: la conversación real no aplica." },
        409
      );
    }

    const cuerpo = (await request.json().catch(() => null)) as { texto?: unknown } | null;
    const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";
    if (!texto) {
      return tallerJson({ error: "El mensaje llegó vacío." }, 400);
    }
    if (texto.length > MAX_TEXTO) {
      return tallerJson({ error: `El mensaje es demasiado largo (máx. ${MAX_TEXTO}).` }, 400);
    }

    const { id } = await dejarMensaje(quoteId, texto);
    return tallerJson(
      {
        mensajeId: id,
        wave: { kind: "charla", cotizacionId: quoteId, mensajeId: id, texto },
      },
      201
    );
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
