import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cotizar } from "@/lib/cotizador/cotizar";
import {
  aplicarReferencias,
  validarReferencia,
  type ReferenciaPrecio,
} from "@/lib/cotizador/confirmacion";
import {
  desgloseVigente,
  nombresDeReceta,
  preciosDeFuente,
} from "@/lib/cotizador/mesa-merge";
import type {
  AjustesMesa,
  CotizacionRow,
  Desglose,
  Receta,
  Revision,
} from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cotizaciones/[id]/referencias — la ola de PRECIOS alimenta el
 * tablero (pedido de Eze 17/08: "no me tira un solo precio").
 *
 * Recibe referencias fechadas investigadas EN VIVO (fuente + fecha, jamás de
 * memoria), las funde sobre los precios del desglose vigente con la misma
 * regla de la confirmación (gana la fecha más nueva; el slot `eze` es
 * intocable), re-corre el motor server-side y persiste desglose y totales.
 * Los ítems que siguen sin precio vuelven listados: nada se rellena.
 *
 * Credencial: la de ESCRITURA del Cotizador (middleware). No aprueba, no
 * emite, no toca plata — solo precios de investigación sobre borrador o
 * en_revision.
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { referencias?: unknown } | null;
  if (!body || !Array.isArray(body.referencias) || body.referencias.length === 0) {
    return NextResponse.json({ error: "Mandá referencias: [{nombre, valor, fuente, fecha, origen}]" }, { status: 400 });
  }

  const referencias: ReferenciaPrecio[] = [];
  for (const cruda of body.referencias) {
    const ref = validarReferencia(cruda);
    if ("error" in ref) return NextResponse.json({ error: ref.error }, { status: 400 });
    referencias.push(ref);
  }

  const sb = createSupabaseAdminClient();
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (errCot) return NextResponse.json({ error: errCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const cotizacion = cot as CotizacionRow;
  if (cotizacion.estado !== "en_revision" && cotizacion.estado !== "borrador") {
    return NextResponse.json(
      { error: "Las referencias solo entran en borrador o en revisión." },
      { status: 409 }
    );
  }

  const desglose: Desglose = desgloseVigente(cotizacion.desglose);
  const nombres = nombresDeReceta(desglose);

  // Un nombre que la receta no conoce no se aplica en silencio: se devuelve
  // para que quien investigó sepa qué quedó afuera (típico: la ola nombró el
  // ítem distinto de como quedó en la receta).
  const enReceta = referencias.filter((ref) => nombres.has(ref.nombre));
  const ignoradas = referencias.filter((ref) => !nombres.has(ref.nombre)).map((r) => r.nombre);
  if (enReceta.length === 0) {
    return NextResponse.json(
      { error: `Ninguna referencia coincide con un ítem de la receta. Sin aplicar: ${ignoradas.join(", ")}` },
      { status: 422 }
    );
  }

  let receta: Receta | null = null;
  if (cotizacion.receta_id) {
    const { data: recetaRow, error: errReceta } = await sb
      .from("recetas")
      .select("*")
      .eq("id", cotizacion.receta_id)
      .maybeSingle();
    if (errReceta) return NextResponse.json({ error: errReceta.message }, { status: 500 });
    if (!recetaRow) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    receta = recetaRow as Receta;
  }
  if (!receta) {
    return NextResponse.json(
      { error: "La cotización no tiene receta todavía: confirmá el reconocimiento primero." },
      { status: 409 }
    );
  }

  // Mismas fuentes que la hoja viva (sin el slot eze — lo re-inyectan los
  // ajustes) + las referencias frescas, y el motor re-corre server-side.
  const precios = preciosDeFuente(desglose);
  const aplicadas = aplicarReferencias(precios, enReceta);

  const ajustes: AjustesMesa = {
    items: [...(desglose.ajustes?.items ?? [])],
    manuales: [...(desglose.ajustes?.manuales ?? [])],
  };
  const revisionPrevia = (cotizacion.revision ?? null) as Revision | null;

  let calculada;
  try {
    calculada = cotizar({
      receta,
      parametros: desglose.parametros,
      precios,
      extras: desglose.extras,
      imprevistos_pct: desglose.totales.imprevistos_pct,
      zona: cotizacion.zona ?? undefined,
      dudas: revisionPrevia?.dudas ?? [],
      ajustes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "El motor no pudo re-cotizar con las referencias" },
      { status: 500 }
    );
  }

  const { data: actualizada, error: errUpd } = await sb
    .from("cotizaciones")
    .update({
      desglose: calculada.desglose,
      revision: calculada.revision,
      total_min: calculada.total_min,
      total_max: calculada.total_max,
    })
    .eq("id", id)
    .in("estado", ["borrador", "en_revision"])
    .select("id");
  if (errUpd || !actualizada || actualizada.length === 0) {
    return NextResponse.json(
      { error: errUpd?.message ?? "La cotización cambió de estado mientras se aplicaban los precios — recargá." },
      { status: errUpd ? 500 : 409 }
    );
  }

  // El cerebro se alimenta solo: cada precio investigado con fuente fechada
  // entra también al cache global. Best effort — si el cache rebota, el
  // desglose ya quedó bien y se dice la verdad en la respuesta.
  const revisadoAt = new Date().toISOString();
  const { error: errCache } = await sb.from("precios_items").upsert(
    enReceta.map((ref) => ({
      item: ref.nombre,
      origen: ref.origen,
      valor: ref.valor,
      fuente: ref.fuente,
      fecha: ref.fecha,
      revisado_at: revisadoAt,
    })),
    { onConflict: "item,origen" }
  );

  const sinPrecio = calculada.desglose.items.filter((i) => i.sin_precio).map((i) => i.nombre);

  return NextResponse.json({
    ok: true,
    aplicadas,
    ignoradas,
    sin_precio: sinPrecio,
    total_min: calculada.total_min,
    total_max: calculada.total_max,
    ...(errCache ? { advertencia: `El cache de precios no se actualizó: ${errCache.message}` } : {}),
  });
}
