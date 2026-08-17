/**
 * Contrato de la PROPUESTA DE RECONOCIMIENTO (puerta de entrada, spec
 * 2026-08-17). Lo comparten el bridge (que valida lo que devuelve la ola
 * antes de persistirlo), el panel del visor y la traducción a receta
 * candidata. La ley acá es la misma del motor: cada dato con origen; lo
 * ambiguo es pregunta, nunca número inventado.
 */

export type PropuestaOrigen = {
  fuente: string; // "lo dice la OT, p.2" / "deducido de la foto 1"
  confianza: "verificado" | "estimado";
};

export type PropuestaPrecioReferencia = {
  valor: number;
  fuente: string; // sitio o tarifario donde se VIO el precio
  fecha: string; // YYYY-MM-DD
  origen: "sismat" | "internet";
};

export type PropuestaItem = {
  nombre: string;
  tipo: "material" | "mano_de_obra" | "maquinaria";
  modalidad?: "alquiler" | "propia";
  artefacto?: boolean;
  unidad: string; // se valida contra UNIDADES del motor en la traducción
  cantidad: number;
  origen: PropuestaOrigen;
  precio_referencia?: PropuestaPrecioReferencia;
  notas?: string;
};

export type PropuestaRubro = {
  nombre: string;
  items: PropuestaItem[];
  dias_min?: number;
  dias_max?: number;
  cuadrilla?: number;
};

export type PropuestaReconocimiento = {
  titulo: string;
  resumen: string;
  parametros: Array<{ nombre: string; etiqueta: string; valor: number | string }>;
  rubros: PropuestaRubro[];
  preguntas_abiertas: string[];
  fuentes: Array<{ titulo: string; tipo: "obra" | "internet" | "tarifario"; url?: string; fecha: string }>;
};

function esTexto(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function esNumeroPositivo(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}
function esFechaIso(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function validarPropuesta(
  v: unknown
): { ok: true; propuesta: PropuestaReconocimiento } | { ok: false; motivo: string } {
  const p = v as PropuestaReconocimiento;
  const mal = (motivo: string) => ({ ok: false as const, motivo });
  if (!p || typeof p !== "object") return mal("la propuesta no es un objeto");
  if (!esTexto(p.titulo)) return mal("falta titulo");
  if (typeof p.resumen !== "string") return mal("falta resumen");
  if (!Array.isArray(p.parametros)) return mal("parametros debe ser lista");
  for (const par of p.parametros) {
    if (!esTexto(par?.nombre) || !esTexto(par?.etiqueta)) return mal("parámetro sin nombre/etiqueta");
    if (typeof par.valor !== "number" && typeof par.valor !== "string") {
      return mal(`parámetro "${par.nombre}" sin valor`);
    }
  }
  if (!Array.isArray(p.rubros) || p.rubros.length === 0) return mal("sin rubros");
  for (const rubro of p.rubros) {
    if (!esTexto(rubro?.nombre)) return mal("rubro sin nombre");
    if (!Array.isArray(rubro.items) || rubro.items.length === 0) {
      return mal(`rubro "${rubro.nombre}" sin ítems`);
    }
    for (const campo of ["dias_min", "dias_max", "cuadrilla"] as const) {
      if (rubro[campo] != null && !esNumeroPositivo(rubro[campo])) {
        return mal(`rubro "${rubro.nombre}": ${campo} inválido`);
      }
    }
    for (const item of rubro.items) {
      const ref = `"${item?.nombre ?? "?"}" (${rubro.nombre})`;
      if (!esTexto(item?.nombre)) return mal(`ítem sin nombre en "${rubro.nombre}"`);
      if (item.tipo !== "material" && item.tipo !== "mano_de_obra" && item.tipo !== "maquinaria") {
        return mal(`${ref}: tipo inválido`);
      }
      if (item.tipo === "maquinaria" && item.modalidad !== "alquiler" && item.modalidad !== "propia") {
        return mal(`${ref}: maquinaria sin modalidad (alquiler | propia)`);
      }
      if (item.tipo !== "maquinaria" && item.modalidad != null) {
        return mal(`${ref}: modalidad solo en maquinaria`);
      }
      if (item.artefacto != null && (typeof item.artefacto !== "boolean" || item.tipo !== "material")) {
        return mal(`${ref}: artefacto solo en materiales`);
      }
      if (!esTexto(item.unidad)) return mal(`${ref}: sin unidad`);
      if (!esNumeroPositivo(item.cantidad)) return mal(`${ref}: cantidad inválida`);
      if (
        !esTexto(item?.origen?.fuente) ||
        (item.origen.confianza !== "verificado" && item.origen.confianza !== "estimado")
      ) {
        return mal(`${ref}: sin origen (fuente + confianza) — un dato sin fuente es un invento`);
      }
      const pr = item.precio_referencia;
      if (pr != null) {
        if (
          !esNumeroPositivo(pr.valor) ||
          !esTexto(pr.fuente) ||
          !esFechaIso(pr.fecha) ||
          (pr.origen !== "sismat" && pr.origen !== "internet")
        ) {
          return mal(
            `${ref}: precio_referencia inválido (valor > 0, fuente, fecha YYYY-MM-DD, origen sismat|internet)`
          );
        }
      }
    }
  }
  if (!Array.isArray(p.preguntas_abiertas) || !p.preguntas_abiertas.every(esTexto)) {
    return mal("preguntas_abiertas debe ser lista de textos (vacía si no quedó ninguna duda)");
  }
  if (!Array.isArray(p.fuentes) || p.fuentes.length === 0) return mal("sin fuentes");
  for (const f of p.fuentes) {
    if (!esTexto(f?.titulo) || !esFechaIso(f?.fecha)) return mal("fuente sin titulo o fecha");
    // Tipo fuera del enum → "obra": la ley 1 exige título y fecha reales; el
    // tipo es clasificación. Una ola entera no se tira porque el modelo
    // escribió "cliente" o "texto" — el título dice de dónde salió igual.
    // (Pasó en la primera ola real, 17/08: "Texto de Eze" con tipo inventado.)
    if (f.tipo !== "obra" && f.tipo !== "internet" && f.tipo !== "tarifario") {
      f.tipo = "obra";
    }
  }
  return { ok: true, propuesta: p };
}

/** Saca el primer bloque ```json … ``` (o el texto entero si ES json). */
export function extraerJson(texto: string): unknown | null {
  const cercado = texto.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  const candidato = cercado ? cercado[1] : texto.trim();
  try {
    return JSON.parse(candidato);
  } catch {
    return null;
  }
}
