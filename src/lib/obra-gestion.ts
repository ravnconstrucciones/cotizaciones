/**
 * Lógica pura de GESTIÓN DE OBRAS (módulo home + galería).
 *
 * El cockpit pregunta dos cosas por cada obra activa: "¿por dónde va?"
 * (estado + instancia + último avance) y "¿qué hago para avanzarla?"
 * (la próxima acción = el primer pendiente vinculado sin hacer).
 *
 * Todo acá es determinístico y sin I/O — se testea en aislamiento. Los datos
 * (avances, pendientes) los traen los endpoints; esta capa solo decide qué
 * mostrar. No renombrar campos: son espejo del contrato de /cashflow/resumen,
 * obra_avances y tareas.
 */

/** Estado operativo de una obra (deriva de finalizada_at / cobranza_cerrada_at). */
export type EstadoObra = "en_curso" | "finalizada" | "cobranza_cerrada";

export type EstadoObraVisual = { estado: EstadoObra; label: string; cls: string };

/**
 * Clasifica el estado de una obra según los flags del modelo.
 * Prioridad: cobranza cerrada (cian, terminó el ciclo de plata) →
 * finalizada (ámbar, obra cerrada) → en curso (verde, viva). La cobranza
 * cerrada gana porque es el estado más "terminal" de cara al negocio.
 */
export function clasificarEstadoObra(o: {
  finalizada: boolean;
  cobranza_cerrada?: boolean;
}): EstadoObraVisual {
  if (o.cobranza_cerrada)
    return { estado: "cobranza_cerrada", label: "Cobranza cerrada", cls: "text-cdm-accent" };
  if (o.finalizada)
    return { estado: "finalizada", label: "Finalizada", cls: "text-amber-300" };
  return { estado: "en_curso", label: "En curso", cls: "text-emerald-400" };
}

/** Una obra está activa (figura en home y filtro "Activas") si no está finalizada. */
export function esObraActiva(o: { finalizada: boolean }): boolean {
  return !o.finalizada;
}

export type AvanceLite = {
  presupuesto_id: string;
  texto: string;
  instancia: string | null;
  creado_at: string;
};

export type PendienteLite = {
  presupuesto_id: string | null;
  texto: string;
  creado_at: string;
};

export type SeguimientoObra = {
  /** Instancia actual: la del avance más reciente que declaró una. */
  instancia: string | null;
  /** Último avance (el más nuevo) — se pinta EN VERDE. */
  ultimoAvance: { texto: string; creadoAt: string } | null;
  cantAvances: number;
};

/**
 * Deriva el seguimiento de una obra a partir de SUS avances.
 * Acepta los avances en cualquier orden: ordena por creado_at desc adentro.
 */
export function derivarSeguimiento(
  presupuestoId: string,
  avances: AvanceLite[]
): SeguimientoObra {
  const deLaObra = avances
    .filter((a) => a.presupuesto_id === presupuestoId)
    .sort((a, b) => b.creado_at.localeCompare(a.creado_at));
  const ultimo = deLaObra[0] ?? null;
  return {
    instancia: deLaObra.find((a) => a.instancia?.trim())?.instancia?.trim() ?? null,
    ultimoAvance: ultimo ? { texto: ultimo.texto, creadoAt: ultimo.creado_at } : null,
    cantAvances: deLaObra.length,
  };
}

export type ProximaAccion = {
  /** Texto del próximo pendiente, o null si no hay ninguno. */
  texto: string | null;
  /** Mensaje listo para mostrar (incluye fallback cuando no hay pendiente). */
  display: string;
  /** true cuando hay una acción real (para pintarla distinto que el vacío). */
  hay: boolean;
};

export const SIN_PROXIMA_ACCION = "Sin próxima acción — cargá una.";

/**
 * LA PRÓXIMA ACCIÓN PARA AVANZAR la obra = el primer pendiente vinculado a esa
 * obra (tarea con presupuesto_id de la obra, estado pendiente), por orden de
 * creación (el más viejo primero — es lo que viene "trabándose" hace más).
 * Si no hay ninguno, devuelve el fallback que empuja a cargar uno.
 *
 * El filtro de estado="pendiente" se asume hecho aguas arriba (lo hace la
 * query), pero igual filtramos por presupuesto_id acá para que la función sea
 * autocontenida y testeable con una lista cruda de pendientes.
 */
export function proximaAccion(
  presupuestoId: string,
  pendientes: PendienteLite[]
): ProximaAccion {
  const deLaObra = pendientes
    .filter((t) => t.presupuesto_id === presupuestoId)
    .sort((a, b) => a.creado_at.localeCompare(b.creado_at));
  const primero = deLaObra[0] ?? null;
  if (!primero) return { texto: null, display: SIN_PROXIMA_ACCION, hay: false };
  return { texto: primero.texto, display: primero.texto, hay: true };
}
