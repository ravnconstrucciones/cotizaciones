import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cotizar } from "@/lib/cotizador/cotizar";
import { RUBRO_POR_ID } from "@/lib/cotizador/rubros";
import type {
  AjusteItem,
  AjustesMesa,
  CotizacionRow,
  Desglose,
  ItemManualMesa,
  PrecioItem,
  Receta,
  Revision,
  TipoItem,
  Unidad,
} from "@/lib/cotizador/tipos";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UNIDADES: Unidad[] = ["m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];
const TIPOS: TipoItem[] = ["material", "mano_de_obra"];
const FUENTE_EZE = "Eze — mesa de revisión";

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

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function esNumeroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * PATCH /api/cotizaciones/[id]/desglose — la hoja viva (Tramo B).
 * Funde la edición con desglose.ajustes, re-corre el motor server-side
 * (cotizar.ts — el código suma, no la IA ni el browser) y persiste desglose,
 * revisión y totales frescos. Regla de oro: un precio corregido por Eze se
 * escribe además a precios_items (origen 'eze') — la mesa calibra al cotizador.
 * Solo en estado en_revision.
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
  if (cotizacion.estado !== "en_revision") {
    return NextResponse.json(
      { error: `La hoja solo se edita en revisión (estado actual: ${cotizacion.estado})` },
      { status: 409 }
    );
  }
  const desglose =
    cotizacion.desglose && "items" in cotizacion.desglose
      ? (cotizacion.desglose as Desglose)
      : null;
  if (!desglose) {
    return NextResponse.json({ error: "La cotización no tiene desglose" }, { status: 409 });
  }
  if (!cotizacion.receta_id) {
    return NextResponse.json(
      { error: "Sin receta vinculada no se puede re-correr el motor" },
      { status: 409 }
    );
  }

  const { data: recetaRow, error: errReceta } = await sb
    .from("recetas")
    .select("*")
    .eq("id", cotizacion.receta_id)
    .maybeSingle();
  if (errReceta) return NextResponse.json({ error: errReceta.message }, { status: 500 });
  if (!recetaRow) return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
  const receta = recetaRow as Receta;

  // ── Fundir la operación con los ajustes persistidos ────────────────────────
  const ajustes: AjustesMesa = {
    items: [...(desglose.ajustes?.items ?? [])],
    manuales: [...(desglose.ajustes?.manuales ?? [])],
  };
  const nombresReceta = new Set(
    desglose.items.filter((i) => !i.manual).map((i) => i.nombre)
  );
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
    const previo = ajustes.items!.find((x) => x.nombre === a.nombre);
    const nuevo: AjusteItem = { nombre: a.nombre, ...previo };
    // Semántica de merge: campo presente pisa; null explícito limpia el override.
    if ("precio" in a) {
      if (a.precio == null) {
        delete nuevo.precio_eze;
        precioAQuitarDeCache = a.nombre;
      } else {
        nuevo.precio_eze = { valor: a.precio, fuente: FUENTE_EZE, fecha: hoyIso() };
        precioParaCache = { item: a.nombre, valor: a.precio };
      }
    }
    if ("cantidad" in a) {
      if (a.cantidad == null) delete nuevo.cantidad;
      else nuevo.cantidad = a.cantidad;
    }
    if ("activo" in a && typeof a.activo === "boolean") {
      if (a.activo) delete nuevo.activo;
      else nuevo.activo = false;
    }
    const otros = ajustes.items!.filter((x) => x.nombre !== a.nombre);
    const vacio = nuevo.precio_eze == null && nuevo.cantidad == null && nuevo.activo !== false;
    ajustes.items = vacio ? otros : [...otros, nuevo];
  }

  if (body.manual) {
    const m = body.manual;
    const nombre = typeof m.nombre === "string" ? m.nombre.trim() : "";
    if (!nombre) return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
    if (!(m.rubro in RUBRO_POR_ID)) {
      return NextResponse.json({ error: `rubro inválido: ${m.rubro}` }, { status: 400 });
    }
    if (!TIPOS.includes(m.tipo)) {
      return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
    }
    if (!UNIDADES.includes(m.unidad)) {
      return NextResponse.json({ error: "unidad inválida" }, { status: 400 });
    }
    if (!esNumeroPositivo(m.cantidad)) {
      return NextResponse.json({ error: "cantidad debe ser un número > 0" }, { status: 400 });
    }
    if (m.precio != null && !esNumeroPositivo(m.precio)) {
      return NextResponse.json({ error: "precio debe ser un número > 0" }, { status: 400 });
    }
    const yaExiste =
      nombresReceta.has(nombre) || ajustes.manuales!.some((x) => x.nombre === nombre);
    if (yaExiste) {
      return NextResponse.json({ error: `Ya hay un ítem "${nombre}"` }, { status: 400 });
    }
    const manual: ItemManualMesa = {
      nombre,
      rubro: m.rubro,
      tipo: m.tipo,
      unidad: m.unidad,
      cantidad: m.cantidad,
      ...(m.precio != null
        ? { precio: { valor: m.precio, fuente: FUENTE_EZE, fecha: hoyIso() } }
        : {}),
      ...(m.notas ? { notas: m.notas } : {}),
    };
    ajustes.manuales = [...ajustes.manuales!, manual];
    if (m.precio != null) precioParaCache = { item: nombre, valor: m.precio };
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
  const precios: Record<string, PrecioItem> = {};
  for (const item of desglose.items) {
    if (item.manual) continue;
    const { sismat, internet, retail } = item.precios;
    precios[item.nombre] = {
      ...(sismat ? { sismat } : {}),
      ...(internet ? { internet } : {}),
      ...(retail ? { retail } : {}),
    };
  }

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
    .eq("estado", "en_revision") // guard de carrera: si se aprobó en el medio, no pisar
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
