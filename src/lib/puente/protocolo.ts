/**
 * Protocolo puente ↔ Fable (mesa conversacional, spec 2026-07-25).
 * Fable responde SIEMPRE un JSON {mensaje, busqueda}. Este parser es
 * tolerante: fences, texto alrededor, JSON roto → nunca se pierde la
 * respuesta (fallback: todo el texto como mensaje).
 */

export type DirectivaFable = {
  /** Lo que se publica en el hilo como mensaje de Fable. */
  mensaje: string;
  /** Consigna de búsqueda de precios/datos (dispara la doble búsqueda) o null. */
  busqueda: string | null;
};

export function parsearDirectiva(salida: string): DirectivaFable {
  const crudo = salida.trim();
  const ini = crudo.indexOf("{");
  const fin = crudo.lastIndexOf("}");
  if (ini >= 0 && fin > ini) {
    try {
      const obj = JSON.parse(crudo.slice(ini, fin + 1)) as Record<string, unknown>;
      const mensaje = typeof obj["mensaje"] === "string" ? (obj["mensaje"] as string).trim() : "";
      const busquedaCruda = obj["busqueda"];
      const busqueda =
        typeof busquedaCruda === "string" && busquedaCruda.trim().length > 0
          ? busquedaCruda.trim()
          : null;
      if (mensaje) return { mensaje, busqueda };
      // JSON válido pero sin mensaje (o solo espacios): si trae búsqueda, no
      // la perdemos ni mostramos el JSON crudo en el hilo — mensaje
      // presentable y la búsqueda sigue disparando la doble búsqueda (fix
      // ronda 3, finding 1). Sin mensaje NI búsqueda, recién ahí cae al
      // fallback de abajo.
      if (busqueda) return { mensaje: `Voy a buscar: ${busqueda}`, busqueda };
    } catch {
      // JSON roto: cae al fallback.
    }
  }
  return { mensaje: crudo, busqueda: null };
}
