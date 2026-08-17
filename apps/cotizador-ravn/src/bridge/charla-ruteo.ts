/**
 * Ruteo de la charla por marcadores (pedidos de Eze 17/08): la última línea de
 * la respuesta de Fable puede ser una señal para el sistema, nunca texto que
 * Eze deba leer. Quien decide es Fable en la ola de charla; acá solo se
 * extrae el marcador — es protocolo entre el prompt y el bridge.
 *
 * - En momento reconocimiento: una pregunta se contesta rápido en el hilo; un
 *   dato de obra o cambio de alcance relanza el reconocimiento completo
 *   (`RELANZAR_RECONOCIMIENTO`).
 * - En momento charla (tablero armándose): si Eze pide números que el
 *   expediente no tiene, la charla contesta y encadena la ola de precios
 *   (`INVESTIGAR_PRECIOS`) — lo conversado alimenta el tablero, no se queda
 *   en texto.
 */

export const MARCADOR_RELANZAR = "RELANZAR_RECONOCIMIENTO";
export const MARCADOR_PRECIOS = "INVESTIGAR_PRECIOS";

export type RuteoCharla = {
  texto: string;
  relanzar: boolean;
  investigarPrecios: boolean;
};

/**
 * Separa el marcador de la respuesta de la charla. Solo vale como ÚLTIMA
 * línea no vacía (sola, o envuelta en `[]`/`**` si el modelo la decoró);
 * mencionado en el medio del texto no rutea nada.
 */
export function extraerRuteo(crudo: string): RuteoCharla {
  const lineas = String(crudo ?? "").split("\n");
  let ultima = lineas.length - 1;
  while (ultima >= 0 && lineas[ultima].trim() === "") ultima -= 1;
  if (ultima < 0) return { texto: "", relanzar: false, investigarPrecios: false };
  const candidata = lineas[ultima].trim().replace(/^[[*\s]+|[\]*\s.]+$/g, "");
  if (candidata !== MARCADOR_RELANZAR && candidata !== MARCADOR_PRECIOS) {
    return {
      texto: lineas.slice(0, ultima + 1).join("\n").trim(),
      relanzar: false,
      investigarPrecios: false,
    };
  }
  return {
    texto: lineas.slice(0, ultima).join("\n").trim(),
    relanzar: candidata === MARCADOR_RELANZAR,
    investigarPrecios: candidata === MARCADOR_PRECIOS,
  };
}

/** Compat: la firma original, para quien solo pregunta por el relanzamiento. */
export function extraerRelanzamiento(crudo: string): { texto: string; relanzar: boolean } {
  const { texto, relanzar } = extraerRuteo(crudo);
  return { texto, relanzar };
}
