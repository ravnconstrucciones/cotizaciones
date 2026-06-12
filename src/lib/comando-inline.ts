/**
 * Detección PURA del caso inline de la barra de comando (spec §4.1:
 * "crea un trabajo en la cola o resuelve inline lo simple").
 * Tanda actual: SOLO "anotá/anota X" → tarea directa en `tareas`.
 * Los demás casos inline son tanda futura (dudas abiertas del plan).
 */

export type ComandoInline =
  | { inline: true; accion: "tarea"; texto: string }
  | { inline: false };

// [aá] = "a" o "á" precompuesta, con escape unicode (paste-safe entre editores).
// El flag `i` cubre "Anotá"/"ANOTA". `\s+(.+)` exige texto después del verbo
// (sin texto no hay tarea que crear: se encola como cualquier otra orden).
const RE_ANOTAR = /^anot[aá]\s+(.+)$/i;

export function parseComandoInline(prompt: string): ComandoInline {
  const m = prompt.trim().match(RE_ANOTAR);
  if (m) {
    const texto = m[1].trim();
    if (texto) return { inline: true, accion: "tarea", texto };
  }
  return { inline: false };
}
