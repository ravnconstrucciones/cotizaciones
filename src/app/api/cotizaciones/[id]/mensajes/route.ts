import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  construirHilo,
  mensajesDeTabla,
  mezclarHilos,
  type EventoHilo,
  type MensajeNuevoRow,
  type TrabajoHilo,
} from "@/lib/cotizador/conversacion";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Latido más viejo que esto = motor desconectado (el puente late cada 30 s). */
const LATIDO_MAX_MS = 90_000;

/**
 * Hilo de la MESA CONVERSACIONAL (spec 2026-07-25): mezcla el hilo legacy
 * (trabajos_cola + eventos, construirHilo) con la tabla nueva
 * cotizacion_mensajes (tres voces: eze/fable/codex/sistema).
 * La ruta hermana /conversacion queda intacta para el flujo daemon.
 */
export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();

  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id, trabajo_id")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  const filtroTrabajos = [
    `contexto->>cotizacion_anterior.eq.${id}`,
    `contexto->>cotizacion_id.eq.${id}`,
    ...(cot.trabajo_id ? [`id.eq.${cot.trabajo_id}`] : []),
  ].join(",");

  const [trabajosR, eventosR, nuevosR, latidoR] = await Promise.all([
    sb
      .from("trabajos_cola")
      .select("id, creado_at, actualizado_at, tipo, origen, estado, prompt, contexto, resultado")
      .or(filtroTrabajos)
      .order("creado_at", { ascending: true })
      .limit(500),
    sb
      .from("eventos")
      .select("id, creado_at, origen, tipo, titulo, contenido, destino_id")
      .or(`destino_id.eq.${id},contenido->>cotizacion_id.eq.${id}`)
      .order("creado_at", { ascending: true })
      .limit(200),
    sb
      .from("cotizacion_mensajes")
      .select("id, autor, texto, adjuntos, meta, creado_at")
      .eq("cotizacion_id", id)
      .order("creado_at", { ascending: true })
      .limit(500),
    sb.from("puente_latidos").select("visto_at").eq("id", "puente-cotizador").maybeSingle(),
  ]);

  const err = trabajosR.error ?? eventosR.error ?? nuevosR.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const legacy = construirHilo({
    trabajoOrigenId: cot.trabajo_id,
    trabajos: (trabajosR.data ?? []) as TrabajoHilo[],
    eventos: (eventosR.data ?? []) as EventoHilo[],
  });
  const nuevos = mensajesDeTabla((nuevosR.data ?? []) as MensajeNuevoRow[]);

  const vistoAt = latidoR.data?.visto_at ? new Date(latidoR.data.visto_at).getTime() : 0;
  const motor_conectado = Date.now() - vistoAt < LATIDO_MAX_MS;

  return NextResponse.json({ mensajes: mezclarHilos(legacy, nuevos), motor_conectado });
}

type Adjunto = { archivo_id: string; storage_path: string; titulo?: string };

export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    texto?: string;
    adjuntos?: Adjunto[];
  };
  const texto = String(body.texto ?? "").trim();
  const adjuntos = Array.isArray(body.adjuntos)
    ? body.adjuntos.filter((a) => a && typeof a.archivo_id === "string")
    : [];
  if (!texto && adjuntos.length === 0) {
    return NextResponse.json({ error: "texto o adjuntos requeridos." }, { status: 400 });
  }
  if (texto.length > 4000) {
    return NextResponse.json({ error: "texto demasiado largo (máx. 4000)." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: cot, error: eCot } = await sb
    .from("cotizaciones")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (eCot) return NextResponse.json({ error: eCot.message }, { status: 500 });
  if (!cot) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });

  // Texto de Eze → charla que el puente responde. Solo fotos → mensaje de
  // sistema: informa al puente por el mismo canal Realtime (spec §Fotos).
  const fila =
    texto.length > 0
      ? { cotizacion_id: id, autor: "eze", texto, adjuntos, meta: { tipo: "charla" } }
      : { cotizacion_id: id, autor: "sistema", texto: "", adjuntos, meta: { tipo: "adjuntos" } };

  const { data, error } = await sb
    .from("cotizacion_mensajes")
    .insert(fila)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
