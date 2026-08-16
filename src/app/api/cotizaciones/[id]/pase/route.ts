import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cotizar } from "@/lib/cotizador/cotizar";
import {
  ORIGENES,
  RECETA_VACIA,
  ajustesDelPase,
  desgloseVigente,
  esError,
  esNumeroPositivo,
  hoyIso,
  nombresDeReceta,
  preciosDeFuente,
  validarManual,
  FUENTE_EZE,
  type ManualEntrante,
  type PrecioCerrado,
} from "@/lib/cotizador/mesa-merge";
import type {
  CotizacionRow,
  ItemManualMesa,
  Receta,
  Revision,
} from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Body del pase: el estado COMPLETO del taller. Lo que no viene, deja de
 * existir en la cotización — de ahí sale la idempotencia y el "el taller manda".
 */
type BodyPase = {
  /** El número que fijó Eze con el dial. `null` lo borra. */
  precio_propuesta?: number | null;
  /** Reemplaza `ajustes.manuales` entero. */
  manuales?: ManualEntrante[];
  /** Reemplaza los `precio_eze` enteros. */
  precios_cerrados?: PrecioCerrado[];
};

/**
 * POST /api/cotizaciones/[id]/pase — el pase del expediente.
 *
 * El Cotizador standalone es el TALLER: ahí vive la maquinaria (fuentes,
 * desvíos, veredictos, dial de margen) y nada de eso se muda. Lo que viaja a la
 * OFICINA es el EXTRACTO: el número final y el desglose rubro por rubro. Al
 * aprobar, ese desglose se siembra como plan de compra de la obra
 * (`importarPlanDesdeCotizacion`) y contra él la app cruza compras y MO reales
 * — por eso el extracto no es decoración: sin él la obra nace con la lista de
 * compras incompleta.
 *
 * NO viaja una sola línea de texto: título, alcance y notas son del flujo de
 * diagnóstico, no del cotizador (regla de Eze, 16/08).
 *
 * A diferencia de la hoja viva (PATCH .../desglose, una operación por request),
 * acá entra todo junto: UNA corrida del motor y UNA escritura. Un taller con 8
 * ítems y 12 precios serían 20 requests por la otra puerta, y un corte a la
 * mitad dejaría el desglose sin su precio.
 *
 * Lo que este endpoint NO puede hacer, por diseño: aprobar, emitir, crear obra
 * o tocar plata. Eso es de la oficina y su credencial no llega hasta ahí.
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as BodyPase | null;
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  // ── Validación de forma, antes de tocar la base ───────────────────────────
  const manualesEntrantes = body.manuales ?? [];
  const cerradosEntrantes = body.precios_cerrados ?? [];
  if (!Array.isArray(manualesEntrantes) || !Array.isArray(cerradosEntrantes)) {
    return NextResponse.json(
      { error: "manuales y precios_cerrados deben ser listas" },
      { status: 400 }
    );
  }

  const precioPropuesta = body.precio_propuesta ?? null;
  if (
    precioPropuesta !== null &&
    !(typeof precioPropuesta === "number" && Number.isFinite(precioPropuesta) && precioPropuesta >= 0)
  ) {
    return NextResponse.json(
      { error: "precio_propuesta inválido (número ≥ 0, o null para borrarlo)" },
      { status: 400 }
    );
  }

  for (const cerrado of cerradosEntrantes) {
    if (typeof cerrado?.nombre !== "string" || !cerrado.nombre.trim()) {
      return NextResponse.json({ error: "precio cerrado sin nombre" }, { status: 400 });
    }
    if (!esNumeroPositivo(cerrado.valor)) {
      return NextResponse.json(
        { error: `precio cerrado inválido en "${cerrado.nombre}" (número > 0)` },
        { status: 400 }
      );
    }
    if (!ORIGENES.includes(cerrado.origen)) {
      return NextResponse.json(
        { error: `origen inválido en "${cerrado.nombre}": ${cerrado.origen}` },
        { status: 400 }
      );
    }
  }

  const nombresCerrados = cerradosEntrantes.map((c) => c.nombre);
  if (new Set(nombresCerrados).size !== nombresCerrados.length) {
    return NextResponse.json(
      { error: "hay un ítem con el precio cerrado dos veces" },
      { status: 400 }
    );
  }

  // ── La cotización ──────────────────────────────────────────────────────────
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
      {
        error:
          "Esta cotización ya está aprobada o emitida — el pase no la toca. Ajustala en la mesa de revisión.",
      },
      { status: 409 }
    );
  }

  const desglose = desgloseVigente(cotizacion.desglose);

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

  // ── Validación contra el desglose real ────────────────────────────────────
  const nombresReceta = nombresDeReceta(desglose);

  const manuales: ItemManualMesa[] = [];
  for (const entrante of manualesEntrantes) {
    const manual = validarManual(entrante, (nombre) =>
      nombresReceta.has(nombre) || manuales.some((x) => x.nombre === nombre)
    );
    if (esError(manual)) {
      return NextResponse.json({ error: manual.error }, { status: 400 });
    }
    manuales.push(manual);
  }

  // Un precio cerrado siempre apunta a un ítem de receta: el de un ítem a mano
  // viaja en `manuales[].precio`, no por acá. Confundirlos dejaría el precio
  // colgado de un ajuste que el motor nunca aplica.
  const nombresManuales = new Set(manuales.map((m) => m.nombre));
  for (const cerrado of cerradosEntrantes) {
    if (nombresReceta.has(cerrado.nombre)) continue;
    const motivo = nombresManuales.has(cerrado.nombre)
      ? `"${cerrado.nombre}" es un ítem a mano: su precio va en manuales[], no en precios_cerrados[]`
      : `Ítem desconocido: ${cerrado.nombre}`;
    return NextResponse.json({ error: motivo }, { status: 400 });
  }

  // ── Una corrida del motor con el estado completo ──────────────────────────
  const ajustes = ajustesDelPase(desglose, desglose.ajustes, manuales, cerradosEntrantes);
  const revisionPrevia = (cotizacion.revision ?? null) as Revision | null;

  let calculada;
  try {
    calculada = cotizar({
      receta,
      parametros: desglose.parametros,
      precios: preciosDeFuente(desglose),
      extras: desglose.extras,
      imprevistos_pct: desglose.totales.imprevistos_pct,
      zona: cotizacion.zona ?? undefined,
      dudas: revisionPrevia?.dudas ?? [],
      ajustes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al correr el motor" },
      { status: 500 }
    );
  }

  // ── Una escritura: extracto y número entran juntos o no entra nada ────────
  // Guard de carrera con el mismo patrón del repo: el .in() restringe el UPDATE
  // y el .select() verifica filas afectadas — 0 filas es 409, nunca éxito
  // fantasma.
  const { data: actualizada, error: errUpd } = await sb
    .from("cotizaciones")
    .update({
      desglose: calculada.desglose,
      revision: calculada.revision,
      total_min: calculada.total_min,
      total_max: calculada.total_max,
      precio_propuesta: precioPropuesta,
    })
    .eq("id", id)
    .in("estado", ["borrador", "en_revision"])
    .select("id");
  if (errUpd) return NextResponse.json({ error: errUpd.message }, { status: 500 });
  if (!actualizada || actualizada.length === 0) {
    return NextResponse.json(
      { error: "La cotización cambió de estado mientras pasabas — recargá el laboratorio" },
      { status: 409 }
    );
  }

  // ── Calibración: SÓLO el número propio de Eze ─────────────────────────────
  // Decisión del 16/08: el precio cerrado viaja con su origen real y sólo el
  // que puso Eze a mano califica para `precios_items`. Cerrar un ítem con el
  // valor de SISMAT no lo inscribe en la base como precio propio.
  //
  // Nunca borra: `precios_items` es cache global por ítem, no por cotización.
  // Un pase que hoy no cierra un ítem no puede tumbar lo que se aprendió en
  // otro laburo.
  // El precio de un ítem a mano también es número propio de Eze (lo tipeó él),
  // así que califica igual — es lo mismo que hace la hoja viva. Que la misma
  // acción calibre distinto según por qué puerta entró sería la divergencia
  // que el módulo compartido existe para evitar.
  const paraCalibrar: PrecioCerrado[] = [
    ...cerradosEntrantes.filter((c) => c.origen === "eze"),
    ...manuales
      .filter((m) => m.precio != null)
      .map((m) => ({ nombre: m.nombre, valor: m.precio!.valor, origen: "eze" as const })),
  ];
  if (paraCalibrar.length > 0) {
    const ahora = new Date().toISOString();
    const fecha = hoyIso();
    const { error: errCache } = await sb.from("precios_items").upsert(
      paraCalibrar.map((c) => ({
        item: c.nombre,
        origen: "eze" as const,
        valor: c.valor,
        fuente: FUENTE_EZE,
        fecha,
        revisado_at: ahora,
      })),
      { onConflict: "item,origen" }
    );
    // Best-effort DESPUÉS de persistir: si el cache falla, el pase ya quedó
    // bien y el error se loguea — no se le esconde el laburo a Eze.
    if (errCache) console.error("[pase] precios_items upsert:", errCache.message);
  }

  return NextResponse.json({
    ok: true,
    total_min: calculada.total_min,
    total_max: calculada.total_max,
    precio_propuesta: precioPropuesta,
    aplicados: {
      manuales: manuales.length,
      precios: cerradosEntrantes.length,
      calibrados: paraCalibrar.length,
    },
  });
}
