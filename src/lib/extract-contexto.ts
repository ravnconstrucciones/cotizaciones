/**
 * Contexto opcional para la extracción por audio de /gasto: la pantalla manda
 * sus obras y rubros (id + nombre) y el modelo elige de esa lista CERRADA.
 * Nada de lo que devuelva el modelo se acepta sin validar acá contra la lista
 * — un id inventado jamás llega al cliente.
 */

export type ItemContexto = { id: string; nombre: string };

export type ContextoExtraccion = {
  obras: ItemContexto[];
  rubros: ItemContexto[];
};

export type SeleccionContexto = {
  obra_id: string | null;
  rubro_id: string | null;
  tipo_gasto: "obra" | "empresa" | "personal" | null;
};

const MAX_ITEMS = 60;
const MAX_NOMBRE = 80;
const MAX_ID = 64;

function limpiarLista(raw: unknown): ItemContexto[] {
  if (!Array.isArray(raw)) return [];
  const out: ItemContexto[] = [];
  for (const it of raw.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== "object") continue;
    const { id, nombre } = it as Record<string, unknown>;
    if (typeof id !== "string" || typeof nombre !== "string") continue;
    const idOk = id.trim().slice(0, MAX_ID);
    const nombreOk = nombre.trim().slice(0, MAX_NOMBRE);
    if (!idOk || !nombreOk) continue;
    out.push({ id: idOk, nombre: nombreOk });
  }
  return out;
}

/** Campo form `contexto` (string JSON) → contexto validado, o null si no sirve. */
export function parseContexto(raw: unknown): ContextoExtraccion | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const obras = limpiarLista(o.obras);
  const rubros = limpiarLista(o.rubros);
  if (obras.length === 0 && rubros.length === 0) return null;
  return { obras, rubros };
}

/** Bloque que se suma al prompt de AUDIO cuando hay contexto. */
export function bloqueContextoPrompt(ctx: ContextoExtraccion): string {
  const lineas: string[] = [
    "",
    "Además devolvé estas claves en el mismo JSON:",
  ];
  if (ctx.obras.length > 0) {
    lineas.push(
      `- "obra_id": si el audio nombra una de estas obras (aunque la diga incompleta o con otra pronunciación), devolvé su id EXACTO tal cual figura; si no nombra ninguna, null. Obras: ${JSON.stringify(ctx.obras)}`
    );
  }
  if (ctx.rubros.length > 0) {
    lineas.push(
      `- "rubro_id": igual pero con estos rubros (el rubro puede deducirse de lo comprado, ej. "pintura" → rubro Pintura si existe): ${JSON.stringify(ctx.rubros)}`
    );
  }
  lineas.push(
    `- "tipo_gasto": "obra" si el gasto pertenece a una obra (nombrar una obra alcanza), "personal" si dice que es un gasto personal/propio, "empresa" si es de la empresa sin obra concreta, null si no se deduce.`
  );
  return lineas.join("\n");
}

/** Respuesta cruda del modelo → selección validada contra la lista cerrada. */
export function validarSeleccion(
  raw: Record<string, unknown>,
  ctx: ContextoExtraccion
): SeleccionContexto {
  const obra_id =
    typeof raw.obra_id === "string" &&
    ctx.obras.some((o) => o.id === raw.obra_id)
      ? raw.obra_id
      : null;
  const rubro_id =
    typeof raw.rubro_id === "string" &&
    ctx.rubros.some((r) => r.id === raw.rubro_id)
      ? raw.rubro_id
      : null;
  const tipo_gasto =
    raw.tipo_gasto === "obra" ||
    raw.tipo_gasto === "empresa" ||
    raw.tipo_gasto === "personal"
      ? raw.tipo_gasto
      : obra_id
        ? ("obra" as const)
        : null;
  return { obra_id, rubro_id, tipo_gasto };
}
