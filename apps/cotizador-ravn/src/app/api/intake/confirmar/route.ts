import { NextRequest } from "next/server";
import { confirmarReconocimiento } from "../../../../adapters/app-ravn-write-adapter";
import { validarPropuesta } from "../../../../bridge/intake-contract";
import { tallerJson, requireQuoteId } from "../../../../taller/http";
import { intakeStore } from "../../../../taller/intake-store";
import { recetaDesdePropuesta } from "../../../../taller/reconocimiento";
import { intakeErrorResponse } from "../respuestas";

export const dynamic = "force-dynamic";

/**
 * POST /api/intake/confirmar?quote= — la confirmación de Eze: la propuesta
 * (editada en el panel) se valida, se traduce a receta candidata y viaja a
 * App RAVN, que crea la receta y pasa la cotización a en_revision con los
 * precios del motor. Recién acá deja de ser un borrador vacío de alcance.
 */
export async function POST(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    const cuerpo = (await request.json().catch(() => null)) as {
      propuesta?: unknown;
      zona?: unknown;
    } | null;
    if (!cuerpo) return tallerJson({ error: "La confirmación llegó sin datos." }, 400);

    const validada = validarPropuesta(cuerpo.propuesta);
    if (!validada.ok) {
      return tallerJson({ error: `La propuesta no cierra: ${validada.motivo}` }, 400);
    }
    const zona = typeof cuerpo.zona === "string" && cuerpo.zona.trim() ? cuerpo.zona.trim() : null;

    const payload = recetaDesdePropuesta(validada.propuesta, quoteId, zona);
    const resultado = await confirmarReconocimiento(quoteId, payload);

    // Best-effort DESPUÉS del éxito (molde de la calibración del pase): si el
    // estado local del intake no se pudo marcar, el laburo real ya entró y el
    // error solo se loguea — no se le esconde la confirmación a Eze.
    try {
      await intakeStore().marcarConfirmada(quoteId);
    } catch (error) {
      console.error("[intake/confirmar] marcarConfirmada:", error);
    }

    return tallerJson({
      ok: true,
      receta_id: resultado.recetaId,
      total_min: resultado.totalMin,
      total_max: resultado.totalMax,
      sin_precio: resultado.sinPrecio,
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
