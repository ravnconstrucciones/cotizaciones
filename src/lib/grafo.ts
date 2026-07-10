import { fetchCompartido } from "@/lib/fetch-compartido";

/**
 * Grafo de conocimiento del vault (graphify) — tipos y fetch compartido.
 *
 * La data viene de /api/grafo (bucket privado `grafo` en Storage), con el
 * layout YA calculado en la Mac (exportar-app.py): acá nadie corre física,
 * solo se dibuja. Coordenadas cuantizadas a 0-4095.
 */

/** [x, y, grado, comunidad, label] */
export type NodoGrafo = [number, number, number, number, string];
/** [índice source, índice target] sobre `nodos` */
export type AristaGrafo = [number, number];

export type GrafoVault = {
  actualizado: string;
  stats: { nodos: number; aristas: number; comunidades: number };
  /** id de comunidad → etiqueta en español (solo las no-finas). */
  comunidades: Record<string, string>;
  nodos: NodoGrafo[];
  aristas: AristaGrafo[];
};

export const COORD_MAX = 4095;

function esGrafo(b: unknown): b is GrafoVault {
  const g = b as GrafoVault;
  return (
    !!g &&
    Array.isArray(g.nodos) &&
    Array.isArray(g.aristas) &&
    typeof g.stats === "object"
  );
}

export async function fetchGrafo(): Promise<GrafoVault | null> {
  const r = await fetchCompartido("/api/grafo");
  if (!r.ok || !esGrafo(r.body)) return null;
  return r.body;
}

/** Las N comunidades con más nodos (para leyenda y coloreo estable). */
export function comunidadesTop(
  g: GrafoVault,
  n: number
): Array<{ id: number; label: string; nodos: number }> {
  const conteo = new Map<number, number>();
  for (const nodo of g.nodos) {
    conteo.set(nodo[3], (conteo.get(nodo[3]) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .filter(([id]) => g.comunidades[String(id)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, cant]) => ({
      id,
      label: g.comunidades[String(id)],
      nodos: cant,
    }));
}
