import { NextRequest } from "next/server";
import { loadQuoteArchivos } from "../../../../adapters/app-ravn-read-adapter";
import { tallerJson, requireQuoteId } from "../../../../taller/http";
import { intakeStore } from "../../../../taller/intake-store";
import { intakeErrorResponse } from "../respuestas";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake/ola?quote= — arma el pedido de la ola de intake para que el
 * NAVEGADOR se lo entregue al bridge (que vive en la Mac de Eze, no acá).
 * El server junta lo persistido — el texto del intake y las URLs firmadas de
 * los archivos — así la ola trabaja sobre lo guardado, no sobre una pantalla.
 * Si el estado era `error`, relanzar lo limpia.
 */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const [intake, archivos] = await Promise.all([
      intakeStore().leer(quoteId),
      loadQuoteArchivos(quoteId),
    ]);
    if (!intake) {
      return tallerJson({ error: "Esta cotización no tiene intake: no hay nada que desmenuzar." }, 409);
    }
    const conUrl = archivos.filter(
      (a): a is typeof a & { url: string } => typeof a.url === "string" && a.url.length > 0
    );
    const texto = intake.texto ?? "";
    if (!texto && conUrl.length === 0) {
      return tallerJson({ error: "No hay ni texto ni archivos legibles que desmenuzar." }, 409);
    }
    if (intake.estado === "error") {
      await intakeStore().relanzar(quoteId);
    }
    return tallerJson({
      wave: {
        kind: "intake",
        cotizacionId: quoteId,
        texto,
        archivos: conUrl.map((a) => ({ titulo: a.titulo ?? "archivo", url: a.url })),
      },
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
