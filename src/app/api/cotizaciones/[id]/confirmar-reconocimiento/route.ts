import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { validarRecetaCandidata } from "@/lib/cotizador/candidata";
import { cotizar, IMPREVISTOS_DEFAULT_PCT } from "@/lib/cotizador/cotizar";
import {
  preciosParaConfirmacion,
  validarReferencia,
  type ReferenciaPrecio,
} from "@/lib/cotizador/confirmacion";
import type { PrecioItemRow } from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/cotizaciones/[id]/confirmar-reconocimiento — el acto que convierte
 * la propuesta confirmada por Eze en cotización de verdad (puerta de entrada,
 * spec 2026-08-17).
 *
 * Crea la receta CANDIDATA (validada: cada cantidad con origen, lo ambiguo en
 * preguntas_abiertas) y pasa la cotización borrador → en_revision con su
 * receta_id. El guard `trg_cotizaciones_guard` queda satisfecho POR DISEÑO:
 * la receta existe antes del cambio de estado.
 *
 * Los precios no los trae la lectura: acá los pone el motor, fusionando el
 * cache `precios_items` con las referencias fechadas que la ola investigó.
 * Lo que queda sin precio cae como sin_precio a la cola del visor.
 *
 * Esta credencial NO puede aprobar, emitir ni tocar plata (allowlist).
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    receta?: unknown;
    parametros?: unknown;
    zona?: unknown;
    precios_referencia?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  // ── Validación de forma antes de tocar la base ────────────────────────────
  const validada = validarRecetaCandidata(body.receta);
  if (!validada.ok) {
    return NextResponse.json(
      { error: "La receta candidata no pasa la ley 1", violaciones: validada.violaciones },
      { status: 400 }
    );
  }
  const receta = validada.receta;

  const parametros =
    body.parametros && typeof body.parametros === "object" && !Array.isArray(body.parametros)
      ? (body.parametros as Record<string, number | string>)
      : {};

  const referencias: ReferenciaPrecio[] = [];
  for (const cruda of Array.isArray(body.precios_referencia) ? body.precios_referencia : []) {
    const ref = validarReferencia(cruda);
    if ("error" in ref) return NextResponse.json({ error: ref.error }, { status: 400 });
    referencias.push(ref);
  }
  const zona = typeof body.zona === "string" && body.zona.trim() ? body.zona.trim() : null;

  // ── La cotización tiene que ser un borrador ───────────────────────────────
  const sb = createSupabaseAdminClient();
  const { data: cot, error: errCot } = await sb
    .from("cotizaciones")
    .select("id, estado, receta_id")
    .eq("id", id)
    .maybeSingle();
  if (errCot) return NextResponse.json({ error: errCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  if (cot.estado !== "borrador") {
    return NextResponse.json(
      { error: "Esta cotización ya está confirmada — el reconocimiento no la toca." },
      { status: 409 }
    );
  }

  // ── Precios: cache global + referencias de la ola ─────────────────────────
  const nombres = receta.etapas.flatMap((e) => e.items.map((i) => i.nombre));
  const { data: cacheRows, error: errCache } = await sb
    .from("precios_items")
    .select("*")
    .in("item", nombres);
  if (errCache) return NextResponse.json({ error: errCache.message }, { status: 500 });
  const precios = preciosParaConfirmacion(
    nombres,
    (cacheRows ?? []) as PrecioItemRow[],
    referencias
  );

  // ── El motor corre ANTES de escribir nada: si revienta, no queda basura ───
  let calculada;
  try {
    calculada = cotizar({
      receta,
      parametros,
      precios,
      imprevistos_pct: IMPREVISTOS_DEFAULT_PCT,
      zona: zona ?? undefined,
      dudas: receta.preguntas_abiertas ?? [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "El motor no pudo cotizar la candidata" },
      { status: 400 }
    );
  }

  // ── Escritura: receta primero, cotización después ─────────────────────────
  const { data: recetaRow, error: errReceta } = await sb
    .from("recetas")
    .insert({
      nombre: receta.nombre,
      titulo: receta.titulo,
      estado: "candidata",
      parametros: receta.parametros,
      etapas: receta.etapas,
      checklist: receta.checklist,
      fuentes: receta.fuentes,
      version: receta.version,
      preguntas_abiertas: receta.preguntas_abiertas ?? [],
    })
    .select("id")
    .single();
  if (errReceta) return NextResponse.json({ error: errReceta.message }, { status: 500 });

  const { data: actualizada, error: errUpd } = await sb
    .from("cotizaciones")
    .update({
      estado: "en_revision",
      receta_id: recetaRow.id,
      zona,
      desglose: calculada.desglose,
      revision: calculada.revision,
      total_min: calculada.total_min,
      total_max: calculada.total_max,
    })
    .eq("id", id)
    .eq("estado", "borrador")
    .select("id");
  if (errUpd || !actualizada || actualizada.length === 0) {
    // La cotización cambió de estado en el medio (o la base rechazó): la
    // receta recién creada quedaría huérfana — se limpia, best effort, y se
    // dice la verdad. Reintentar es seguro: nada quedó a medias.
    await sb.from("recetas").delete().eq("id", recetaRow.id);
    return NextResponse.json(
      {
        error:
          errUpd?.message ??
          "La cotización dejó de ser borrador mientras confirmabas — recargá.",
      },
      { status: errUpd ? 500 : 409 }
    );
  }

  const sinPrecio = calculada.desglose.items
    .filter((i) => i.sin_precio)
    .map((i) => i.nombre);

  return NextResponse.json({
    ok: true,
    receta_id: recetaRow.id,
    total_min: calculada.total_min,
    total_max: calculada.total_max,
    sin_precio: sinPrecio,
  });
}
