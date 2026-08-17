/**
 * Ruteo de la charla en momento reconocimiento (pedido de Eze 17/08): una
 * pregunta se contesta rápido en el hilo; un dato de obra o cambio de alcance
 * relanza el reconocimiento completo. Quien decide es Fable en la ola de
 * charla: si el mensaje trae dato/alcance, cierra su respuesta con una última
 * línea que dice exactamente el marcador. Acá se lo extrae — el marcador es
 * protocolo entre el prompt y el bridge, nunca texto que Eze deba leer.
 */

export const MARCADOR_RELANZAR = "RELANZAR_RECONOCIMIENTO";

/**
 * Separa el marcador de relanzamiento de la respuesta de la charla. Solo vale
 * como ÚLTIMA línea no vacía (sola, o envuelta en `[]`/`**` si el modelo la
 * decoró); mencionado en el medio del texto no rutea nada.
 */
export function extraerRelanzamiento(crudo: string): { texto: string; relanzar: boolean } {
  const lineas = String(crudo ?? "").split("\n");
  let ultima = lineas.length - 1;
  while (ultima >= 0 && lineas[ultima].trim() === "") ultima -= 1;
  if (ultima < 0) return { texto: "", relanzar: false };
  const candidata = lineas[ultima].trim().replace(/^[[*\s]+|[\]*\s.]+$/g, "");
  if (candidata !== MARCADOR_RELANZAR) {
    return { texto: lineas.slice(0, ultima + 1).join("\n").trim(), relanzar: false };
  }
  return { texto: lineas.slice(0, ultima).join("\n").trim(), relanzar: true };
}
