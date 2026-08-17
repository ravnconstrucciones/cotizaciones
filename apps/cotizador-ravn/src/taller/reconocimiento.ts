/**
 * Traducción propuesta (confirmada por Eze) → receta CANDIDATA.
 *
 * Decisiones del plan 2026-08-17:
 * - Rubro = etapa; el orden es el de la propuesta.
 * - Cantidades LITERALES como fórmula ("12"): la parametrización real es
 *   evolución posterior. evaluarFormula acepta literales, la candidata pasa.
 * - Unidad fuera del enum del motor cae a "u" con nota de traza (no se
 *   inventa una conversión).
 * - Los parámetros de la propuesta viajan como parámetros NO requeridos de la
 *   receta (traza de qué midió la ola), con su valor en `parametros`.
 */
import type { Receta, Unidad } from "../../../../src/lib/cotizador/tipos";
import type { PropuestaItem, PropuestaReconocimiento } from "../bridge/intake-contract";

const UNIDADES: Unidad[] = ["m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];

export type ReferenciaConfirmacion = {
  nombre: string;
  valor: number;
  fuente: string;
  fecha: string;
  origen: "sismat" | "internet";
};

export type ConfirmacionPayload = {
  receta: Receta;
  parametros: Record<string, number | string>;
  zona: string | null;
  precios_referencia: ReferenciaConfirmacion[];
};

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function unidadDelMotor(item: PropuestaItem): { unidad: Unidad; nota?: string } {
  if ((UNIDADES as string[]).includes(item.unidad)) return { unidad: item.unidad as Unidad };
  return { unidad: "u", nota: `unidad original de la propuesta: "${item.unidad}"` };
}

export function recetaDesdePropuesta(
  propuesta: PropuestaReconocimiento,
  cotizacionId: string,
  zona: string | null
): ConfirmacionPayload {
  const parametros: Record<string, number | string> = {};
  for (const par of propuesta.parametros) parametros[par.nombre] = par.valor;

  const precios_referencia: ReferenciaConfirmacion[] = [];

  const receta: Receta = {
    nombre: `puerta-${slug(propuesta.titulo)}-${cotizacionId.slice(0, 8)}`,
    titulo: propuesta.titulo,
    estado: "candidata",
    parametros: propuesta.parametros.map((par) => ({
      nombre: par.nombre,
      etiqueta: par.etiqueta,
      tipo: typeof par.valor === "number" ? ("numero" as const) : ("texto" as const),
      requerido: false,
    })),
    etapas: propuesta.rubros.map((rubro, i) => ({
      nombre: rubro.nombre,
      orden: i + 1,
      ...(rubro.dias_min != null ? { dias_min: rubro.dias_min } : {}),
      ...(rubro.dias_max != null ? { dias_max: rubro.dias_max } : {}),
      ...(rubro.cuadrilla != null ? { cuadrilla: rubro.cuadrilla } : {}),
      items: rubro.items.map((item) => {
        const { unidad, nota } = unidadDelMotor(item);
        if (item.precio_referencia) {
          precios_referencia.push({ nombre: item.nombre, ...item.precio_referencia });
        }
        const notas = [item.notas, nota].filter(Boolean).join(" · ");
        return {
          nombre: item.nombre,
          tipo: item.tipo,
          ...(item.modalidad ? { modalidad: item.modalidad } : {}),
          ...(item.artefacto ? { artefacto: true } : {}),
          unidad,
          formula: String(item.cantidad),
          origen: item.origen,
          ...(notas ? { notas } : {}),
        };
      }),
    })),
    checklist: [],
    fuentes: propuesta.fuentes.map((f) => ({
      titulo: f.titulo,
      tipo:
        f.tipo === "internet"
          ? ("internet" as const)
          : f.tipo === "tarifario"
            ? ("tarifario" as const)
            : ("obra" as const),
      ...(f.url ? { url: f.url } : {}),
      fecha: f.fecha,
    })),
    version: 1,
    preguntas_abiertas: propuesta.preguntas_abiertas,
  };

  return { receta, parametros, zona, precios_referencia };
}
