import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parsearDirectiva } from "../../src/lib/puente/protocolo";
import { correrFable } from "./motor-fable";
import { correrCodex } from "./motor-codex";

/**
 * puente-cotizador — el motor local de la mesa de cotización (spec 2026-07-25).
 * Escucha cotizacion_mensajes por Realtime, corre Fable (Claude Code) con
 * sesión por cotización y Codex para búsquedas, y publica las respuestas.
 * Late a puente_latidos cada 30 s. Barrido al arrancar y cada 60 s (mensajes
 * que llegaron con el puente caído).
 */

const DIR = join(process.env.HOME ?? "", ".ravn-puente");
const LATIDO_MS = 30_000;
const BARRIDO_MS = 60_000;

type MensajeRow = {
  id: string;
  cotizacion_id: string;
  autor: string;
  texto: string;
  adjuntos: Array<{ archivo_id?: string; storage_path?: string; titulo?: string }>;
  meta: Record<string, unknown>;
  creado_at: string;
};

const sb: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let sistema = "";
const sesiones = new Map<string, string>(); // cotizacion_id → claude session_id
const procesados = new Set<string>(); // ids de mensajes ya atendidos (persistido)
const colas = new Map<string, Promise<void>>(); // serialización por cotización

async function cargarEstadoLocal() {
  await mkdir(DIR, { recursive: true });
  // URL relativa al módulo: funciona igual bajo tsx desde cualquier cwd.
  sistema = await readFile(new URL("./prompt-sistema.md", import.meta.url), "utf8");
  try {
    const crudo = JSON.parse(await readFile(join(DIR, "sesiones.json"), "utf8"));
    Object.entries(crudo).forEach(([k, v]) => sesiones.set(k, String(v)));
  } catch {
    // primera corrida: no existe todavía
  }
  try {
    const crudo = JSON.parse(await readFile(join(DIR, "procesados.json"), "utf8"));
    (crudo as string[]).forEach((id) => procesados.add(id));
  } catch {
    // primera corrida: no existe todavía
  }
}

async function guardarEstadoLocal() {
  await writeFile(join(DIR, "sesiones.json"), JSON.stringify(Object.fromEntries(sesiones)));
  await writeFile(join(DIR, "procesados.json"), JSON.stringify([...procesados].slice(-2000)));
}

async function publicar(
  cotizacionId: string,
  autor: "fable" | "codex" | "sistema",
  texto: string,
  meta: Record<string, unknown>
) {
  const { error } = await sb
    .from("cotizacion_mensajes")
    .insert({ cotizacion_id: cotizacionId, autor, texto, meta });
  if (error) console.error("[puente] publicar:", error.message);
}

async function yaRespondido(mensajeId: string): Promise<boolean> {
  if (procesados.has(mensajeId)) return true;
  const { data } = await sb
    .from("cotizacion_mensajes")
    .select("id")
    .eq("meta->>respuesta_a", mensajeId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Contexto corto de la cotización para el primer turno de una sesión. */
async function contextoCotizacion(id: string): Promise<string> {
  const { data } = await sb
    .from("cotizaciones")
    .select("id, titulo, estado, zona, total_min, total_max, ficha")
    .eq("id", id)
    .maybeSingle();
  if (!data) return `Cotización ${id} (no encontrada).`;
  return `Cotización id=${data.id} · "${data.titulo}" · estado=${data.estado} · zona=${data.zona ?? "s/d"} · total=${data.total_min ?? "s/d"}–${data.total_max ?? "s/d"} · ficha=${JSON.stringify(data.ficha)}`;
}

async function turnoFable(cotizacionId: string, prompt: string): Promise<ReturnType<typeof parsearDirectiva>> {
  const sesionPrevia = sesiones.get(cotizacionId) ?? null;
  const encabezado = sesionPrevia ? "" : `${await contextoCotizacion(cotizacionId)}\n\n`;
  const r = await correrFable({ prompt: encabezado + prompt, sistema, sesionPrevia });
  if (r.sessionId) sesiones.set(cotizacionId, r.sessionId);
  return parsearDirectiva(r.texto);
}

async function procesarMensaje(m: MensajeRow) {
  if (await yaRespondido(m.id)) return;
  procesados.add(m.id);
  await guardarEstadoLocal();

  const esAdjuntos = m.autor === "sistema";
  const prompt = esAdjuntos
    ? `Eze soltó ${m.adjuntos.length} foto(s) del proyecto en la mesa (paths en el bucket obra-archivos: ${m.adjuntos.map((a) => a.storage_path).join(", ")}). Pedile por GET /api/cotizaciones/${m.cotizacion_id}/archivos las URLs firmadas, miralas (Read de imágenes por URL no — bajalas con curl a /tmp y leelas) y comentá qué ves que afecte la cotización.`
    : m.texto;

  try {
    // Turno 1: Fable responde (y decide si hay búsqueda).
    const d1 = await turnoFable(m.cotizacion_id, prompt);
    await publicar(m.cotizacion_id, "fable", d1.mensaje, { tipo: "charla", respuesta_a: m.id });

    if (d1.busqueda) {
      // Doble búsqueda en paralelo: Codex y Fable, cada uno por su lado.
      const [codexTexto, d2] = await Promise.all([
        correrCodex(d1.busqueda),
        turnoFable(
          m.cotizacion_id,
          `Hacé AHORA tu búsqueda: "${d1.busqueda}". SISMAT local + internet (WebSearch). Devolvé en "mensaje" tus valores con fuente y fecha; "busqueda" null.`
        ),
      ]);
      await publicar(m.cotizacion_id, "fable", d2.mensaje, { tipo: "busqueda", respuesta_a: m.id });
      await publicar(
        m.cotizacion_id,
        "codex",
        codexTexto ?? "Codex no respondió a tiempo — va solo la búsqueda de Fable.",
        { tipo: codexTexto ? "busqueda" : "aviso", respuesta_a: m.id }
      );

      // Turno de consolidación: la charla entre los tres.
      const d3 = await turnoFable(
        m.cotizacion_id,
        `Codex trajo esto:\n---\n${codexTexto ?? "(falló/timeout)"}\n---\nConsolidá con lo tuyo: coincidencias, diferencias y qué banda tomás (con fuente). APLICÁ los cambios a la cotización con curl (desglose ítem por ítem, y actualizá el documento-borrador). "busqueda" null.`
      );
      await publicar(m.cotizacion_id, "fable", d3.mensaje, { tipo: "charla", respuesta_a: m.id });
    }
  } catch (e) {
    console.error("[puente] procesarMensaje:", e);
    await publicar(m.cotizacion_id, "sistema", "El motor tuvo un problema con este mensaje — probá de nuevo.", {
      tipo: "aviso",
      respuesta_a: m.id,
    });
  }
}

/** Serializa por cotización: los mensajes de una misma mesa van en orden. */
function encolar(m: MensajeRow) {
  if (m.autor !== "eze" && m.autor !== "sistema") return;
  if (m.autor === "sistema" && (m.meta?.["tipo"] ?? "") !== "adjuntos") return;
  const previa = colas.get(m.cotizacion_id) ?? Promise.resolve();
  colas.set(m.cotizacion_id, previa.then(() => procesarMensaje(m)));
}

async function barrido() {
  const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await sb
    .from("cotizacion_mensajes")
    .select("*")
    .in("autor", ["eze", "sistema"])
    .gte("creado_at", desde)
    .order("creado_at", { ascending: true })
    .limit(200);
  if (error) return console.error("[puente] barrido:", error.message);
  for (const m of (data ?? []) as MensajeRow[]) {
    if (!procesados.has(m.id)) encolar(m);
  }
}

async function main() {
  await cargarEstadoLocal();

  setInterval(() => {
    void sb.from("puente_latidos").upsert({ id: "puente-cotizador", visto_at: new Date().toISOString() });
  }, LATIDO_MS);

  sb.channel("puente-cotizador")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "cotizacion_mensajes" },
      (payload) => encolar(payload.new as MensajeRow)
    )
    .subscribe((estado) => console.log("[puente] realtime:", estado));

  await barrido();
  setInterval(() => void barrido(), BARRIDO_MS);
  console.log("[puente] vivo — escuchando cotizacion_mensajes");
}

void main();
