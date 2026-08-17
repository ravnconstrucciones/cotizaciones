import { NextRequest } from "next/server";
import { loadQuoteArchivos } from "../../../adapters/app-ravn-read-adapter";
import { crearIntake } from "../../../adapters/app-ravn-write-adapter";
import { tallerJson, requireQuoteId } from "../../../taller/http";
import { intakeStore } from "../../../taller/intake-store";
import { isPersistableQuoteId } from "../../../taller/types";
import { intakeErrorResponse } from "./respuestas";

export const dynamic = "force-dynamic";

/**
 * GET /api/intake?quote= — el estado de la puerta para esa cotización: la fila
 * del intake (estado + propuesta) y los archivos adjuntos con URL firmada.
 */
export async function GET(request: NextRequest) {
  try {
    const quoteId = requireQuoteId(request.nextUrl.searchParams.get("quote"));
    if (!isPersistableQuoteId(quoteId)) {
      return tallerJson({ intake: null, archivos: [] });
    }
    const [intake, archivos] = await Promise.all([
      intakeStore().leer(quoteId),
      loadQuoteArchivos(quoteId),
    ]);
    return tallerJson({ intake, archivos });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}

/**
 * POST /api/intake — nace la cotización: borrador en App RAVN (persistencia
 * inmediata, paso 2 del spec) + fila de intake con el texto de Eze.
 */
export async function POST(request: NextRequest) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return intakeErrorResponse(new Error("La puerta llegó sin datos."));
  }
  const datos = cuerpo as { titulo?: unknown; texto?: unknown } | null;
  const titulo = typeof datos?.titulo === "string" ? datos.titulo.trim() : "";
  const texto = typeof datos?.texto === "string" ? datos.texto.trim() : "";
  if (!titulo) {
    return tallerJson({ error: "Falta el título del laburo." }, 400);
  }

  try {
    const { id } = await crearIntake(titulo);
    try {
      await intakeStore().crear(id, texto || null);
    } catch (error) {
      // El borrador YA existe en App RAVN: eso no se esconde. Se devuelve el
      // id con la advertencia real para que el visor lo abra igual.
      const motivo = error instanceof Error ? error.message : "estado del intake sin persistir";
      return tallerJson(
        {
          cotizacionId: id,
          advertencia: `El borrador quedó creado pero el intake no se pudo registrar (${motivo}). Reintentá desde la cotización.`,
        },
        201
      );
    }
    return tallerJson({ cotizacionId: id }, 201);
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
