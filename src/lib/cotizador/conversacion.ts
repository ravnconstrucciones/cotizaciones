/**
 * Hilo de conversación de una cotización (mesa de revisión, iteración 4).
 *
 * Lógica PURA (testeada con Vitest): mezcla el trabajo de origen, los
 * trabajos derivados (re-cotizaciones por corrección / consultas) y los
 * eventos que referencian la cotización en una sola línea de tiempo.
 * La ruta /api/cotizaciones/[id]/conversacion hace las queries y delega acá.
 */

export type AutorMensaje = "eze" | "sistema" | "fable" | "codex";

export type MensajeHilo = {
  id: string;
  fecha: string;
  autor: AutorMensaje;
  texto: string;
  /** Marca corta de contexto: "WhatsApp", "pregunta", "corrección", etc. */
  etiqueta: string;
};

export type TrabajoHilo = {
  id: string;
  creado_at: string;
  actualizado_at: string;
  tipo: string;
  origen: string;
  estado: string;
  prompt: string;
  contexto: Record<string, unknown> | null;
  resultado: Record<string, unknown> | null;
};

export type EventoHilo = {
  id: string;
  creado_at: string;
  origen: string;
  tipo: string;
  titulo: string;
  contenido: Record<string, unknown> | null;
  destino_id: string | null;
};

const ETIQUETA_ORIGEN: Record<string, string> = {
  whatsapp: "WhatsApp",
  tablero: "Tablero",
};

function esTexto(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Mensajes que aporta UN trabajo: prompt → pregunta → respuestas → resumen. */
function mensajesDeTrabajo(t: TrabajoHilo, esOrigen: boolean): MensajeHilo[] {
  const ctx = t.contexto ?? {};
  const out: MensajeHilo[] = [];

  // El texto "de Eze": la corrección o consulta literal si existe; si no, el prompt.
  const correccion = ctx["correccion"];
  const mensajeConsulta = ctx["mensaje"];
  if (esTexto(correccion)) {
    out.push({
      id: `t-${t.id}-eze`,
      fecha: t.creado_at,
      autor: "eze",
      texto: correccion,
      etiqueta: "corrección",
    });
  } else if (esTexto(mensajeConsulta)) {
    out.push({
      id: `t-${t.id}-eze`,
      fecha: t.creado_at,
      autor: "eze",
      texto: mensajeConsulta,
      etiqueta: "consulta",
    });
  } else if (esOrigen && esTexto(t.prompt)) {
    out.push({
      id: `t-${t.id}-eze`,
      fecha: t.creado_at,
      autor: "eze",
      texto: t.prompt,
      etiqueta: ETIQUETA_ORIGEN[t.origen] ?? t.origen,
    });
  }

  const pregunta = ctx["pregunta"];
  if (esTexto(pregunta)) {
    out.push({
      id: `t-${t.id}-pregunta`,
      fecha: t.actualizado_at,
      autor: "sistema",
      texto: pregunta,
      etiqueta: "pregunta del sistema",
    });
  }

  const respuestas = Array.isArray(ctx["respuestas"]) ? ctx["respuestas"] : [];
  respuestas.forEach((r, i) => {
    const rr = (r ?? {}) as Record<string, unknown>;
    if (!esTexto(rr["texto"])) return;
    out.push({
      id: `t-${t.id}-r${i}`,
      fecha: esTexto(rr["ts"]) ? (rr["ts"] as string) : t.actualizado_at,
      autor: "eze",
      texto: rr["texto"] as string,
      etiqueta: "respuesta",
    });
  });

  const resumen = (t.resultado ?? {})["resumen"];
  if (esTexto(resumen)) {
    out.push({
      id: `t-${t.id}-resumen`,
      fecha: t.actualizado_at,
      autor: "sistema",
      texto: resumen,
      etiqueta: t.tipo === "cotizar" ? "resumen de mesa" : "respuesta del sistema",
    });
  }

  return out;
}

export function construirHilo(args: {
  trabajoOrigenId: string | null;
  trabajos: TrabajoHilo[];
  eventos: EventoHilo[];
}): MensajeHilo[] {
  const { trabajoOrigenId, trabajos, eventos } = args;
  const out: MensajeHilo[] = [];
  const idsTrabajos = new Set(trabajos.map((t) => t.id));

  for (const t of trabajos) {
    out.push(...mensajesDeTrabajo(t, t.id === trabajoOrigenId));
  }

  for (const ev of eventos) {
    const contenido = ev.contenido ?? {};
    const trabajoRef = contenido["trabajo_id"];
    // Dedupe: los eventos espejo de trabajos ya renderizados (trabajo_creado,
    // cotizacion_correccion, conversacion_consulta…) repetirían el mensaje.
    if (typeof trabajoRef === "string" && idsTrabajos.has(trabajoRef)) continue;
    if (ev.destino_id && idsTrabajos.has(ev.destino_id)) continue;

    const autor: AutorMensaje =
      ev.origen === "whatsapp" || ev.origen === "tablero" ? "eze" : "sistema";
    const motivo = contenido["motivo"];
    out.push({
      id: `e-${ev.id}`,
      fecha: ev.creado_at,
      autor,
      texto: esTexto(motivo) ? `${ev.titulo} — "${motivo}"` : ev.titulo,
      etiqueta: ev.tipo.replaceAll("_", " "),
    });
  }

  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Fila de cotizacion_mensajes tal como la lee la API (hilo nuevo, mesa conversacional). */
export type MensajeNuevoRow = {
  id: string;
  autor: string;
  texto: string;
  adjuntos: unknown;
  meta: Record<string, unknown> | null;
  creado_at: string;
};

const AUTORES_VALIDOS: ReadonlyArray<AutorMensaje> = ["eze", "sistema", "fable", "codex"];

/** Mapea filas de cotizacion_mensajes al formato del hilo. Autor raro cae a sistema. */
export function mensajesDeTabla(filas: MensajeNuevoRow[]): MensajeHilo[] {
  const out: MensajeHilo[] = [];
  for (const f of filas) {
    const adjuntos = Array.isArray(f.adjuntos) ? f.adjuntos.length : 0;
    if (!esTexto(f.texto) && adjuntos === 0) continue;
    const autor = (AUTORES_VALIDOS as readonly string[]).includes(f.autor)
      ? (f.autor as AutorMensaje)
      : "sistema";
    const tipo = f.meta?.["tipo"];
    out.push({
      id: `m-${f.id}`,
      fecha: f.creado_at,
      autor,
      texto: esTexto(f.texto)
        ? f.texto
        : `${adjuntos} foto${adjuntos === 1 ? "" : "s"} del proyecto`,
      etiqueta: esTexto(tipo) ? tipo : "charla",
    });
  }
  return out;
}

/** Mezcla el hilo legacy (trabajos+eventos) con el nuevo (tabla) en una línea de tiempo. */
export function mezclarHilos(...hilos: MensajeHilo[][]): MensajeHilo[] {
  return hilos.flat().sort((a, b) => a.fecha.localeCompare(b.fecha));
}
