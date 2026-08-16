import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cotizar } from "@/lib/cotizador/cotizar";
import {
  DESGLOSE_VACIO,
  RECETA_VACIA,
  desgloseVigente,
  esError,
  esNumeroPositivo,
  fusionarAjusteItem,
  hoyIso,
  nombresDeReceta,
  preciosDeFuente,
  validarManual,
  FUENTE_EZE,
} from "@/lib/cotizador/mesa-merge";
import type {
  AjustesMesa,
  CotizacionRow,
  Desglose,
  Receta,
  Revision,
  TipoItem,
  Unidad,
} from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Body del PATCH — exactamente UNA operación por request (la hoja edita de a una). */
type BodyPatch = {
  /** Editar un ítem de receta: precio (número literal, null = quitar corrección),
   *  cantidad (null = volver a la fórmula), activo (false = fuera del alcance). */
  ajuste?: {
    nombre: string;
    precio?: number | null;
    cantidad?: number | null;
    activo?: boolean;
  };
  /** Agregar un ítem manual (no viene de la receta). */
  manual?: {
    nombre: string;
    rubro: string;
    tipo: TipoItem;
    unidad: Unidad;
    cantidad: number;
    precio?: number;
    notas?: string;
  };
  /** Quitar un ítem manual por nombre. */
  quitar_manual?: string;
};

/**
 * PATCH /api/cotizaciones/[id]/desglose — la hoja viva (Tramo B).
 *
 * El scaffold vacío, la receta sintética y las validaciones viven en
 * `mesa-merge.ts`: los comparte con el pase del expediente (POST .../pase),
 * que escribe el mismo estado de otra forma (completo, de una).
 *
 * Funde la edición con desglose.ajustes, re-corre el motor server-side
 * (cotizar.ts — el código suma, no la IA ni el browser) y persiste desglose,
 * revisión y totales frescos. Regla de oro: un precio corregido por Eze se
 * escribe además a precios_items (origen 'eze') — la mesa calibra al cotizador.
 * Solo en estado borrador o en_revision.
 */
export async function PATCH(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as BodyPatch | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const ops = [body.ajuste, body.manual, body.quitar_manual].filter((x) => x != null);
  if (ops.length !== 1) {
    return NextResponse.json(
      { error: "Mandá exactamente una operación: ajuste, manual o quitar_manual" },
      { status: 400 }
    );
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
      { error: "La hoja viva solo edita en borrador o en revisión" },
      { status: 409 }
    );
  }
  // Sin desglose todavía (cotización nueva) → arranca del scaffold vacío en
  // memoria; el motor lo llena con lo que traiga esta operación.
  const desglose: Desglose = desgloseVigente(cotizacion.desglose);

  // Sin receta_id todavía → receta sintética vacía (ver comentario arriba).
  // Solo se consulta `recetas` cuando la cotización ya tiene una vinculada.
  let receta: Receta = RECETA_VACIA;
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

  // ── Fundir la operación con los ajustes persistidos ────────────────────────
  const ajustes: AjustesMesa = {
    items: [...(desglose.ajustes?.items ?? [])],
    manuales: [...(desglose.ajustes?.manuales ?? [])],
  };
  const nombresReceta = nombresDeReceta(desglose);
  /** Se upsertea a precios_items al final (solo si la corrida salió bien). */
  let precioParaCache: { item: string; valor: number } | null = null;
  let precioAQuitarDeCache: string | null = null;

  if (body.ajuste) {
    const a = body.ajuste;
    if (typeof a.nombre !== "string" || !nombresReceta.has(a.nombre)) {
      return NextResponse.json({ error: `Ítem desconocido: ${a.nombre}` }, { status: 400 });
    }
    if (a.precio != null && !esNumeroPositivo(a.precio)) {
      return NextResponse.json({ error: "precio debe ser un número > 0" }, { status: 400 });
    }
    if (a.cantidad != null && !esNumeroPositivo(a.cantidad)) {
      return NextResponse.json({ error: "cantidad debe ser un número > 0" }, { status: 400 });
    }
    // Semántica de merge: campo presente pisa; null explícito limpia el override.
    if ("precio" in a) {
      if (a.precio == null) precioAQuitarDeCache = a.nombre;
      else precioParaCache = { item: a.nombre, valor: a.precio };
    }
    ajustes.items = fusionarAjusteItem(ajustes.items!, a);
  }

  if (body.manual) {
    const m = body.manual;
    const manual = validarManual(m, (nombre) =>
      nombresReceta.has(nombre) || ajustes.manuales!.some((x) => x.nombre === nombre)
    );
    if (esError(manual)) {
      return NextResponse.json({ error: manual.error }, { status: 400 });
    }
    ajustes.manuales = [...ajustes.manuales!, manual];
    if (m.precio != null) precioParaCache = { item: manual.nombre, valor: m.precio };
  }

  if (body.quitar_manual != null) {
    const antes = ajustes.manuales!.length;
    ajustes.manuales = ajustes.manuales!.filter((x) => x.nombre !== body.quitar_manual);
    if (ajustes.manuales.length === antes) {
      return NextResponse.json(
        { error: `No hay ítem manual "${body.quitar_manual}"` },
        { status: 400 }
      );
    }
  }

  // ── Re-correr el motor con las MISMAS fuentes + ajustes frescos ────────────
  // Los precios de fuente se reconstruyen del desglose vigente SIN el slot eze:
  // el precio Eze lo re-inyectan los ajustes (si se limpió, no debe resucitar).
  const precios = preciosDeFuente(desglose);

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
      { error: e instanceof Error ? e.message : "Error al re-correr el motor" },
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
    .in("estado", ["borrador", "en_revision"]) // guard de carrera: si se aprobó en el medio, no pisar
    .select("id");
  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });
  if (!actualizada || actualizada.length === 0) {
    return NextResponse.json(
      { error: "La cotización cambió de estado mientras editabas — recargá la mesa" },
      { status: 409 }
    );
  }

  // ── Regla de oro: el precio corregido calibra al cotizador ────────────────
  // Best-effort DESPUÉS de persistir la cotización: si el cache falla, la hoja
  // ya quedó bien y el error se loguea (no se le esconde el laburo a Eze).
  if (precioParaCache) {
    const { error: errCache } = await sb.from("precios_items").upsert(
      {
        item: precioParaCache.item,
        origen: "eze",
        valor: precioParaCache.valor,
        fuente: FUENTE_EZE,
        fecha: hoyIso(),
        revisado_at: new Date().toISOString(),
      },
      { onConflict: "item,origen" }
    );
    if (errCache) console.error("[desglose] precios_items upsert:", errCache.message);
  }
  if (precioAQuitarDeCache) {
    const { error: errDel } = await sb
      .from("precios_items")
      .delete()
      .eq("item", precioAQuitarDeCache)
      .eq("origen", "eze");
    if (errDel) console.error("[desglose] precios_items delete:", errDel.message);
  }

  return NextResponse.json({
    ok: true,
    total_min: calculada.total_min,
    total_max: calculada.total_max,
  });
}
