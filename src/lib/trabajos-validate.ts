import { TIPOS_TRABAJO, type TipoTrabajo } from "@/types/centro-mando";

export type NuevoTrabajo = {
  tipo: TipoTrabajo;
  prompt: string;
  contexto: Record<string, unknown>;
};

const PROMPT_MAX = 4000;

/** Validación pura del body de POST /api/trabajos (testeada con Vitest). */
export function validarNuevoTrabajo(
  body: unknown
): { ok: true; data: NuevoTrabajo } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body inválido: se espera un objeto JSON." };
  }
  const b = body as Record<string, unknown>;

  const tipo = typeof b.tipo === "string" ? b.tipo : "";
  if (!(TIPOS_TRABAJO as readonly string[]).includes(tipo)) {
    return {
      ok: false,
      error: `tipo inválido: debe ser uno de ${TIPOS_TRABAJO.join(", ")}.`,
    };
  }

  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return { ok: false, error: "prompt requerido." };
  if (prompt.length > PROMPT_MAX) {
    return { ok: false, error: `prompt demasiado largo (máx. ${PROMPT_MAX}).` };
  }

  const contexto =
    b.contexto && typeof b.contexto === "object" && !Array.isArray(b.contexto)
      ? (b.contexto as Record<string, unknown>)
      : {};

  return { ok: true, data: { tipo: tipo as TipoTrabajo, prompt, contexto } };
}

/** Título corto del evento espejo que la barra de comando deja en `eventos`. */
export function tituloTrabajo(tipo: TipoTrabajo, prompt: string): string {
  const corto = prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  return `[${tipo}] ${corto}`;
}
