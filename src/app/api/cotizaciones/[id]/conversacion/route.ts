import { NextResponse } from "next/server";
import { rechazar, TransicionInvalida } from "@/lib/cotizador/estado";
import type { Desglose, EstadoCotizacion } from "@/lib/cotizador/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  construirHilo,
  type EventoHilo,
  type TrabajoHilo,
} from "@/lib/cotizador/conversacion";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Conversación de UNA cotización (mesa de revisión, iteración 4).
 *
 * GET: arma el hilo cronológico mezclando
 *   - el trabajo de origen (prompt de Eze → pregunta del sistema →
 *     respuestas → resumen de mesa),
 *   - los trabajos derivados (re-cotizaciones por corrección y consultas
 *     que referencian esta cotización por contexto),
 *   - los eventos cuyo destino o contenido apuntan a la cotización.
 *
 * POST { mensaje }: EL canal de diálogo de Eze con el sistema sobre ESTA
 * cotización. Si está en_revision aplica el MISMO mecanismo que el
 * "CORREGIR <id-corto>: ..." de WhatsApp (rechaza + lección + re-encola
 * tipo cotizar con contexto.correccion/cotizacion_anterior); si ya está
 * cerrada encola un trabajo tipo consulta. Siempre registra evento.
 */

export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id, titulo, estado, trabajo_id")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  // Trabajo de origen + derivados (corrección/consulta) en una sola query.
  const filtroTrabajos = [
    `contexto->>cotizacion_anterior.eq.${id}`,
    `contexto->>cotizacion_id.eq.${id}`,
    ...(cot.trabajo_id ? [`id.eq.${cot.trabajo_id}`] : []),
  ].join(",");
  const { data: trabajos, error: eTra } = await sb
    .from("trabajos_cola")
    .select("id, creado_at, actualizado_at, tipo, origen, estado, prompt, contexto, resultado")
    .or(filtroTrabajos)
    .order("creado_at", { ascending: true })
    .limit(500);
  if (eTra) return NextResponse.json({ error: eTra.message }, { status: 500 });

  const { data: eventos, error: eEv } = await sb
    .from("eventos")
    .select("id, creado_at, origen, tipo, titulo, contenido, destino_id")
    .or(`destino_id.eq.${id},contenido->>cotizacion_id.eq.${id}`)
    .order("creado_at", { ascending: true })
    .limit(200);
  if (eEv) return NextResponse.json({ error: eEv.message }, { status: 500 });

  const mensajes = construirHilo({
    trabajoOrigenId: cot.trabajo_id,
    trabajos: (trabajos ?? []) as TrabajoHilo[],
    eventos: (eventos ?? []) as EventoHilo[],
  });

  const res = NextResponse.json({ mensajes });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}

export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { mensaje?: string };
  const mensaje = String(body.mensaje ?? "").trim();
  if (!mensaje) return NextResponse.json({ error: "mensaje requerido." }, { status: 400 });
  if (mensaje.length > 4000) {
    return NextResponse.json({ error: "mensaje demasiado largo (máx. 4000)." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id, titulo, estado, desglose")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const estado = cot.estado as EstadoCotizacion;

  // ── en_revision → mecanismo CORREGIR (idéntico al del bot de WhatsApp) ──
  if (estado === "en_revision") {
    let cambio: { estado: "rechazada"; motivo_rechazo: string };
    try {
      cambio = rechazar(estado, mensaje);
    } catch (e) {
      const status = e instanceof TransicionInvalida ? 409 : 400;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error" },
        { status }
      );
    }

    // Guard de carrera: solo rechaza si sigue en revisión (mismo patrón que /rechazar).
    const { data: upd, error: eUpd } = await sb
      .from("cotizaciones")
      .update(cambio)
      .eq("id", id)
      .eq("estado", "en_revision")
      .select("id");
    if (eUpd) return NextResponse.json({ error: eUpd.message }, { status: 500 });
    if (!upd || upd.length === 0) {
      // El guard no afectó filas: alguien la movió entre el GET y este POST.
      // Re-leemos el estado real para que el front muestre dónde quedó.
      const { data: actual } = await sb
        .from("cotizaciones")
        .select("estado")
        .eq("id", id)
        .maybeSingle();
      const estadoActual = (actual?.estado as EstadoCotizacion | undefined) ?? null;
      return NextResponse.json(
        {
          error: estadoActual
            ? `La cotización ya no está en revisión (ahora está "${estadoActual}") — recargá la mesa.`
            : "La cotización ya no está en revisión (cambió de estado) — recargá la mesa.",
          estado_actual: estadoActual,
        },
        { status: 409 }
      );
    }

    // Lección del rechazo (loop de mejora §6.5). Best-effort, no frena el flujo.
    const recetaNombre = (cot.desglose as Desglose | null)?.receta_nombre ?? null;
    const { error: eLec } = await sb.from("cotizador_lecciones").insert({
      tipo: "rechazo",
      receta_nombre: recetaNombre,
      cotizacion_id: id,
      leccion: `Corrección de Eze desde la mesa ("${cot.titulo}"): ${mensaje}`,
      ajuste: null,
    });
    if (eLec) console.error("[conversacion] lección no insertada:", eLec.message);

    const { data: trabajo, error: eTra } = await sb
      .from("trabajos_cola")
      .insert({
        tipo: "cotizar",
        origen: "tablero",
        prompt: `Re-cotizar "${cot.titulo}" aplicando esta corrección de Eze: ${mensaje}`,
        contexto: { correccion: mensaje, cotizacion_anterior: id },
      })
      .select("id")
      .single();
    if (eTra) {
      return NextResponse.json(
        { error: `La cotización quedó rechazada pero la re-cotización NO se encoló: ${eTra.message}` },
        { status: 500 }
      );
    }

    const { error: eEv } = await sb.from("eventos").insert({
      origen: "tablero",
      tipo: "cotizacion_correccion",
      estado: "procesado",
      titulo: `corrección desde la mesa: ${cot.titulo}`,
      contenido: { cotizacion_id: id, motivo: mensaje, trabajo_id: trabajo.id },
      destino_tabla: "cotizaciones",
      destino_id: id,
    });
    if (eEv) console.error("[conversacion] evento no registrado:", eEv.message);

    return NextResponse.json({ ok: true, modo: "correccion", trabajo_id: trabajo.id });
  }

  // ── cualquier otro estado → consulta sobre la cotización ──
  const { data: trabajo, error: eTra } = await sb
    .from("trabajos_cola")
    .insert({
      tipo: "consulta",
      origen: "tablero",
      prompt: `Consulta sobre la cotización "${cot.titulo}" (id ${id}, estado ${estado}): ${mensaje}`,
      contexto: { cotizacion_id: id, mensaje },
    })
    .select("id")
    .single();
  if (eTra) return NextResponse.json({ error: eTra.message }, { status: 500 });

  const { error: eEv } = await sb.from("eventos").insert({
    origen: "tablero",
    tipo: "conversacion_consulta",
    estado: "procesado",
    titulo: `consulta sobre cotización: ${cot.titulo}`,
    contenido: { cotizacion_id: id, mensaje, trabajo_id: trabajo.id },
    destino_tabla: "cotizaciones",
    destino_id: id,
  });
  if (eEv) console.error("[conversacion] evento no registrado:", eEv.message);

  return NextResponse.json({ ok: true, modo: "consulta", trabajo_id: trabajo.id });
}
