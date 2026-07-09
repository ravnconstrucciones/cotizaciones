/**
 * Validador de recetas CANDIDATAS (Capítulo 1, Caso B — la fábrica de recetas).
 *
 * Acá se hace cumplir la ley 1 en el punto de entrada: la IA (skill/agente)
 * PROPONE una receta, pero nada entra a la tabla sin que cada cantidad tenga
 * origen (fuente + confianza) y sin que las fórmulas evalúen de verdad con los
 * parámetros declarados. Lo que la IA no pudo determinar NO se rellena: va en
 * `preguntas_abiertas` y el panel lo muestra en rojo hasta que Eze lo conteste.
 */
import { evaluarFormula } from "./formula";
import type { FuenteReceta, ItemReceta, Receta, Unidad } from "./tipos";

const UNIDADES: Unidad[] = ["m2", "ml", "u", "kg", "l", "bolsa", "caja", "m3", "rollo", "dia", "global"];
const TIPOS_FUENTE: FuenteReceta["tipo"][] = ["fabricante", "seia", "internet", "tarifario", "obra"];

export type ResultadoValidacion =
  | { ok: true; receta: Receta }
  | { ok: false; violaciones: string[] };

export function validarRecetaCandidata(entrada: unknown): ResultadoValidacion {
  const violaciones: string[] = [];
  const r = entrada as Receta;

  if (!r || typeof r !== "object") return { ok: false, violaciones: ["la receta no es un objeto"] };
  if (typeof r.nombre !== "string" || !/^[a-z0-9-]+$/.test(r.nombre)) {
    violaciones.push("nombre debe ser slug de texto (minúsculas, números, guiones)");
  }
  if (typeof r.titulo !== "string" || r.titulo.trim() === "") violaciones.push("falta titulo (debe ser texto no vacío)");
  if (r.estado !== "candidata") violaciones.push("estado debe ser 'candidata' (los otros estados los asigna Eze al aprobar)");
  if (!Array.isArray(r.fuentes) || r.fuentes.length === 0) {
    violaciones.push("fuentes vacías: una candidata sin fuentes es un invento (ley 1)");
  } else {
    r.fuentes.forEach((fuente, i) => violaciones.push(...validarFuente(fuente, i)));
  }
  if (!Array.isArray(r.parametros)) violaciones.push("parametros debe ser lista");
  if (!Array.isArray(r.etapas) || r.etapas.length === 0) violaciones.push("sin etapas");
  if (!Array.isArray(r.preguntas_abiertas)) violaciones.push("preguntas_abiertas debe ser lista (puede ser vacía si no quedó ninguna duda)");

  // Fórmulas: se evalúan con todos los parámetros numéricos en 1 — si referencia
  // una variable que no es parámetro, evaluarFormula tira y la candidata rebota.
  const vars: Record<string, number> = {};
  for (const p of r.parametros ?? []) if (p?.tipo === "numero") vars[p.nombre] = 1;

  for (const etapa of r.etapas ?? []) {
    if (!etapa?.nombre) violaciones.push("etapa sin nombre");
    if (!Array.isArray(etapa?.items) || etapa.items.length === 0) {
      violaciones.push(`etapa "${etapa?.nombre ?? "?"}" sin ítems`);
      continue;
    }
    for (const item of etapa.items) violaciones.push(...validarItem(item, etapa.nombre, vars));
  }

  return violaciones.length > 0 ? { ok: false, violaciones } : { ok: true, receta: r };
}

/** Cada fuente de la receta debe traer título, tipo del enum y fecha real (ley 1). */
function validarFuente(fuente: FuenteReceta, i: number): string[] {
  const v: string[] = [];
  const n = i + 1;
  if (typeof fuente?.titulo !== "string" || fuente.titulo.trim() === "") {
    v.push(`fuente ${n}: falta titulo (debe ser texto no vacío)`);
  }
  if (typeof fuente?.tipo !== "string" || !TIPOS_FUENTE.includes(fuente.tipo)) {
    v.push(`fuente ${n}: tipo inválido (debe ser fabricante, seia, internet, tarifario u obra)`);
  }
  if (typeof fuente?.fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fuente.fecha)) {
    v.push(`fuente ${n}: fecha inválida (debe ser YYYY-MM-DD)`);
  }
  return v;
}

function validarItem(item: ItemReceta, etapa: string, vars: Record<string, number>): string[] {
  const v: string[] = [];
  const ref = `"${item?.nombre ?? "?"}" (${etapa})`;
  if (!item?.nombre) v.push(`ítem sin nombre en etapa "${etapa}"`);
  if (item?.tipo !== "material" && item?.tipo !== "mano_de_obra") v.push(`${ref}: tipo inválido`);
  if (!UNIDADES.includes(item?.unidad)) v.push(`${ref}: unidad inválida`);
  const fuenteOk = typeof item?.origen?.fuente === "string" && item.origen.fuente.trim() !== "";
  const confianzaOk = item?.origen?.confianza === "verificado" || item?.origen?.confianza === "estimado";
  if (!fuenteOk || !confianzaOk) {
    v.push(`${ref}: sin origen (fuente + confianza) — un número sin fuente es un invento (ley 1)`);
  }
  if (!item?.formula) {
    v.push(`${ref}: sin fórmula`);
  } else {
    try {
      evaluarFormula(item.formula, vars);
    } catch (e) {
      v.push(`${ref}: la fórmula no evalúa con los parámetros declarados (${e instanceof Error ? e.message : e})`);
    }
  }
  return v;
}
