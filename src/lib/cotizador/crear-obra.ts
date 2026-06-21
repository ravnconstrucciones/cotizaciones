import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Loop de oro": al aprobar una cotización sin obra vinculada, la convierte en
 * un proyecto real (presupuesto + obra) que aparece en la galería /obras bajo
 * ACTIVAS (obra sin finalizar).
 *
 * Atomicidad: no hay RPC/transacción en este repo, así que ordenamos las
 * operaciones para minimizar inconsistencia y compensamos a mano:
 *   1) presupuesto  → si falla, no se creó nada (abortamos).
 *   2) obra         → si falla, borramos el presupuesto huérfano (rollback).
 *   3) archivos     → best-effort: si falla, la obra ya existe igual; se loguea.
 *   4) cotización.presupuesto_id → cierra el loop.
 *
 * El estado 'aprobada' de la cotización ya quedó persistido ANTES de llamar a
 * esto (es la acción explícita de Eze y nunca debe quedar bloqueada por un fallo
 * de creación de obra). Por eso esta función NUNCA tira: ante un error devuelve
 * { obra_id: null } y la cotización queda aprobada pero sin obra (estado válido,
 * re-vinculable a mano desde la mesa).
 */

type CotizacionParaObra = {
  id: string;
  titulo: string;
  zona: string | null;
  total_min: number | null;
  total_max: number | null;
  ficha: Record<string, unknown> | null;
  foto_portada_path: string | null;
};

type Resultado = { presupuesto_id: string; obra_id: string } | { presupuesto_id: null; obra_id: null };

/** Tipo 'propuesta' en la cotización → 'presupuesto' en la obra; el resto pasa igual. */
function mapearTipoArchivo(tipo: string): string {
  return tipo === "propuesta" ? "presupuesto" : tipo;
}

/** Saca el cliente de la ficha jsonb si algún día lo trae; hoy no existe → null. */
function clienteDeFicha(ficha: Record<string, unknown> | null): string | null {
  if (!ficha) return null;
  const v = ficha.cliente ?? ficha.nombre_cliente ?? ficha.nombre;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function crearObraDesdeCotizacion(
  sb: SupabaseClient,
  cot: CotizacionParaObra,
  importeFinal?: number
): Promise<Resultado> {
  const vacio: Resultado = { presupuesto_id: null, obra_id: null };

  // 1) presupuesto
  const { data: pres, error: ePres } = await sb
    .from("presupuestos")
    .insert({
      nombre_obra: cot.titulo,
      nombre_cliente: clienteDeFicha(cot.ficha),
      domicilio: cot.zona,
      estado: "Aprobado",
      presupuesto_aprobado: true,
    })
    .select("id")
    .single();
  if (ePres || !pres) {
    console.error("[crearObraDesdeCotizacion] presupuesto:", ePres?.message);
    return vacio;
  }

  // 2) obra
  const monto =
    typeof importeFinal === "number" && Number.isFinite(importeFinal) && importeFinal > 0
      ? importeFinal
      : cot.total_max ?? cot.total_min ?? null;

  const { data: obra, error: eObra } = await sb
    .from("obras")
    .insert({
      presupuesto_id: pres.id,
      monto_total_a_cobrar_ars: monto,
      foto_portada_path: cot.foto_portada_path,
    })
    .select("id")
    .single();
  if (eObra || !obra) {
    console.error("[crearObraDesdeCotizacion] obra:", eObra?.message);
    // Rollback del presupuesto huérfano.
    await sb.from("presupuestos").delete().eq("id", pres.id);
    return vacio;
  }

  // 3) archivos (best-effort: la obra ya existe, esto solo le suma los documentos)
  const { data: archivos, error: eArch } = await sb
    .from("cotizacion_archivos")
    .select("tipo, titulo, storage_path")
    .eq("cotizacion_id", cot.id);
  if (eArch) {
    console.error("[crearObraDesdeCotizacion] leer cotizacion_archivos:", eArch.message);
  } else if (archivos && archivos.length > 0) {
    const filas = archivos.map((a) => ({
      presupuesto_id: pres.id,
      tipo: mapearTipoArchivo(a.tipo as string),
      titulo: a.titulo as string | null,
      storage_path: a.storage_path as string | null,
    }));
    const { error: eIns } = await sb.from("obra_archivos").insert(filas);
    if (eIns) console.error("[crearObraDesdeCotizacion] copiar archivos:", eIns.message);
  }

  // 4) cerrar el loop: la cotización ahora apunta a su presupuesto/obra.
  const { error: eLink } = await sb
    .from("cotizaciones")
    .update({ presupuesto_id: pres.id })
    .eq("id", cot.id);
  if (eLink) {
    // La obra existe y es válida; solo no quedó el vínculo inverso. Lo logueamos
    // (re-vinculable a mano) en vez de hacer rollback de un proyecto ya creado.
    console.error("[crearObraDesdeCotizacion] vincular cotizacion:", eLink.message);
  }

  return { presupuesto_id: pres.id, obra_id: obra.id };
}
