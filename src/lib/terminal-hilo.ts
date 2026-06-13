import type { TrabajoCola } from "@/types/centro-mando";

/**
 * Lógica pura del módulo Terminal (chat con el Claude Code de la Mac).
 *
 * Modelo del hilo: cada mensaje de Eze es UN trabajo tipo 'consulta' en
 * `trabajos_cola` con contexto.hilo_id (uuid del hilo) + contexto.mensaje.
 * La respuesta de la Mac llega en resultado.texto cuando el daemon marca
 * estado='completado'. El hilo se arma ordenando los trabajos por creado_at
 * y proyectando pregunta/respuesta — sin tabla nueva, sin estado extra.
 */

export type MensajeTerminal = {
  /** id único de render: `${trabajo.id}-q` (pregunta) o `-r` (respuesta). */
  id: string;
  rol: "eze" | "mac";
  texto: string;
  /** ISO timestamp (creado_at para la pregunta, actualizado_at para la respuesta). */
  ts: string;
  /** Solo en mensajes de la Mac: true si el trabajo terminó en error. */
  esError?: boolean;
};

/** Trabajos pendiente/procesando = la Mac todavía no contestó ese mensaje. */
const ESTADOS_PENSANDO: ReadonlyArray<TrabajoCola["estado"]> = [
  "pendiente",
  "procesando",
];

function textoPregunta(t: TrabajoCola): string {
  const m = t.contexto?.mensaje;
  return typeof m === "string" && m.trim() ? m : t.prompt;
}

function textoRespuesta(t: TrabajoCola): string | null {
  const r = t.resultado;
  if (!r) return null;
  // Contrato del daemon (rama hilo): resultado.texto. Fallback resumen por
  // si un trabajo del hilo lo procesó la rama genérica vieja.
  const texto = r.texto ?? r.resumen;
  return typeof texto === "string" && texto.trim() ? texto : null;
}

/**
 * Proyecta los trabajos de un hilo (cualquier orden) al hilo de chat:
 * orden cronológico por creado_at, pregunta de Eze + respuesta de la Mac
 * cuando existe. Los errores aparecen como mensaje de la Mac marcado.
 */
export function armarHilo(trabajos: TrabajoCola[]): MensajeTerminal[] {
  const orden = [...trabajos].sort((a, b) =>
    a.creado_at.localeCompare(b.creado_at)
  );
  const mensajes: MensajeTerminal[] = [];
  for (const t of orden) {
    mensajes.push({
      id: `${t.id}-q`,
      rol: "eze",
      texto: textoPregunta(t),
      ts: t.creado_at,
    });
    if (t.estado === "error") {
      mensajes.push({
        id: `${t.id}-r`,
        rol: "mac",
        texto: t.error
          ? `El trabajo falló en la Mac: ${t.error}`
          : "El trabajo falló en la Mac. Probá de nuevo.",
        ts: t.actualizado_at,
        esError: true,
      });
      continue;
    }
    const respuesta = textoRespuesta(t);
    if (respuesta !== null && !ESTADOS_PENSANDO.includes(t.estado)) {
      mensajes.push({
        id: `${t.id}-r`,
        rol: "mac",
        texto: respuesta,
        ts: t.actualizado_at,
      });
    }
  }
  return mensajes;
}

/** ¿Hay algún mensaje del hilo que la Mac todavía está masticando? */
export function hayPensando(trabajos: TrabajoCola[]): boolean {
  return trabajos.some((t) => ESTADOS_PENSANDO.includes(t.estado));
}

// ── streaming en vivo ────────────────────────────────────────────────────────
// El daemon broadcastea por Supabase Realtime (topic `hilo:<hilo_id>`) el
// texto parcial acumulado mientras Claude escribe: evento "parcial" cada
// ~700ms y "fin" con el texto completo. Es efímero (cero escrituras a la
// base): la respuesta final persiste en trabajos_cola como siempre.

export type ParcialHilo = {
  /** id del trabajo de trabajos_cola que está generando esta respuesta. */
  trabajoId: string;
  /** Texto ACUMULADO (no delta) de la respuesta en curso. */
  texto: string;
};

/** Parsea el payload del broadcast "parcial"/"fin" del daemon. */
export function parsearParcial(payload: unknown): ParcialHilo | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const texto = typeof p.texto === "string" ? p.texto : "";
  const trabajoId = typeof p.trabajo_id === "string" ? p.trabajo_id : "";
  return texto.trim() && trabajoId ? { trabajoId, texto } : null;
}

/**
 * El parcial solo se muestra mientras SU trabajo siga pendiente/procesando:
 * cuando la tabla ya fijó la respuesta final (o el error), manda la tabla y
 * el parcial muere solo — sin estado extra que limpiar.
 */
export function parcialVigente(
  parcial: ParcialHilo | null,
  trabajos: TrabajoCola[]
): boolean {
  if (!parcial) return false;
  const t = trabajos.find((x) => x.id === parcial.trabajoId);
  return t !== undefined && ESTADOS_PENSANDO.includes(t.estado);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAJE_MAX = 4000;

export type NuevoMensajeTerminal = { hilo_id: string; mensaje: string };

/** Validación pura del body de POST /api/terminal (testeada con Vitest). */
export function validarMensajeTerminal(
  body: unknown
):
  | { ok: true; data: NuevoMensajeTerminal }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body inválido: se espera un objeto JSON." };
  }
  const b = body as Record<string, unknown>;

  const hilo = typeof b.hilo_id === "string" ? b.hilo_id.trim() : "";
  if (!UUID_RE.test(hilo)) {
    return { ok: false, error: "hilo_id inválido: se espera un uuid." };
  }

  const mensaje = typeof b.mensaje === "string" ? b.mensaje.trim() : "";
  if (!mensaje) return { ok: false, error: "mensaje requerido." };
  if (mensaje.length > MENSAJE_MAX) {
    return {
      ok: false,
      error: `mensaje demasiado largo (máx. ${MENSAJE_MAX}).`,
    };
  }

  return { ok: true, data: { hilo_id: hilo.toLowerCase(), mensaje } };
}

/** Umbral del latido: <3 min = la Mac está despierta (igual que el bot). */
const LATIDO_FRESCO_MS = 3 * 60 * 1000;

export type EstadoMac = "en_linea" | "dormida";

/** Lee sistema_estado.ultimo_latido → estado del indicador de la Mac. */
export function estadoMac(
  ultimoLatido: string | null | undefined,
  ahora: Date = new Date()
): EstadoMac {
  if (!ultimoLatido) return "dormida";
  const latido = new Date(ultimoLatido).getTime();
  if (Number.isNaN(latido)) return "dormida";
  return ahora.getTime() - latido < LATIDO_FRESCO_MS ? "en_linea" : "dormida";
}
