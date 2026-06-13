import {
  parseNum,
  totalesProyectados,
  totalesReales,
  type CashflowItemRow,
} from "@/lib/cashflow-compute";
import { correrContrasteObra } from "@/lib/cotizador/contraste-obra";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cierre de obra (CERRAR OBRA del cockpit). Setea obras.finalizada_at → la obra
 * sale de las activas (deja de figurar en home y en el filtro Activas, queda en
 * "Todas"). Persiste el snapshot proyectado vs real en cashflow_cierres_obra y
 * dispara el loop de oro del cotizador (contraste, best-effort).
 *
 * Compartido por POST /api/cashflow/obra/[obra_id]/finalizar (cierre desde
 * cashflow) y POST /api/obras/[id]/finalizar (cierre desde la galería/orbital).
 * Una sola implementación: el comportamiento no puede divergir entre entradas.
 */

type DbItem = {
  id: string;
  obra_id: string;
  tipo: string;
  categoria: string;
  descripcion: string;
  monto_proyectado: string | number;
  fecha_proyectada: string;
  monto_real: string | number | null;
  fecha_real: string | null;
  estado: string;
  notas: string;
};

function mapItem(r: DbItem): CashflowItemRow {
  return {
    id: r.id,
    obra_id: r.obra_id,
    tipo: r.tipo === "egreso" ? "egreso" : "ingreso",
    categoria: r.categoria,
    descripcion: r.descripcion ?? "",
    monto_proyectado: parseNum(r.monto_proyectado),
    fecha_proyectada: String(r.fecha_proyectada).slice(0, 10),
    monto_real: r.monto_real == null ? null : parseNum(r.monto_real),
    fecha_real: r.fecha_real ? String(r.fecha_real).slice(0, 10) : null,
    estado: r.estado ?? "",
    notas: r.notas ?? "",
  };
}

export type ResultadoFinalizar =
  | { ok: true; cierre: Record<string, unknown>; lecciones_contraste: unknown }
  | { ok: false; status: number; error: string };

/**
 * Finaliza una obra por su obra_id (uuid de la tabla obras).
 * Idempotencia: si ya está finalizada devuelve error 409.
 */
export async function finalizarObra(
  supabase: SupabaseClient,
  obraId: string
): Promise<ResultadoFinalizar> {
  const { data: obra, error: eObra } = await supabase
    .from("obras")
    .select("id, presupuesto_id, finalizada_at")
    .eq("id", obraId)
    .maybeSingle();

  if (eObra || !obra) {
    return { ok: false, status: 404, error: eObra?.message ?? "Obra no encontrada." };
  }
  if ((obra as { finalizada_at?: string | null }).finalizada_at) {
    return { ok: false, status: 409, error: "La obra ya está finalizada." };
  }

  const presupuestoId = String((obra as { presupuesto_id: string }).presupuesto_id);

  const { data: presRow } = await supabase
    .from("presupuestos")
    .select("libreta_caja_empresa")
    .eq("id", presupuestoId)
    .maybeSingle();
  if ((presRow as { libreta_caja_empresa?: boolean } | null)?.libreta_caja_empresa) {
    return {
      ok: false,
      status: 400,
      error: "La libreta de empresa no se finaliza como obra de cliente.",
    };
  }

  const { data: rawItems, error: eItems } = await supabase
    .from("cashflow_items")
    .select(
      "id, obra_id, tipo, categoria, descripcion, monto_proyectado, fecha_proyectada, monto_real, fecha_real, estado, notas"
    )
    .eq("obra_id", obraId)
    .is("deleted_at", null);

  if (eItems) {
    return { ok: false, status: 500, error: eItems.message };
  }

  const itemsFull = (rawItems ?? []).map((r) => mapItem(r as DbItem));

  const proj = totalesProyectados(itemsFull);
  const real = totalesReales(itemsFull);
  const diffArs = real.neto - proj.neto;
  const diffPct =
    Math.abs(proj.neto) > 0.01
      ? Math.round((diffArs / Math.abs(proj.neto)) * 10000) / 100
      : 0;
  const gano = real.neto >= 0;
  const etiqueta = gano ? "GANÓ" : "PERDIÓ";

  const categorias = new Set<string>();
  for (const it of itemsFull) categorias.add(it.categoria);

  const por_categoria: Record<
    string,
    { presupuestado: number; real: number; tipo: "ingreso" | "egreso" }
  > = {};
  for (const cat of categorias) {
    const sample = itemsFull.find((i) => i.categoria === cat);
    por_categoria[cat] = {
      presupuestado: 0,
      real: 0,
      tipo: sample?.tipo === "egreso" ? "egreso" : "ingreso",
    };
  }
  for (const it of itemsFull) {
    const b = por_categoria[it.categoria];
    if (!b) continue;
    b.tipo = it.tipo;
    b.presupuestado += it.monto_proyectado;
    if (it.monto_real != null) b.real += it.monto_real;
  }

  const payload = {
    generado_en: new Date().toISOString(),
    margen_proyectado_ars: proj.neto,
    margen_real_ars: real.neto,
    diferencia_ars: diffArs,
    diferencia_pct: diffPct,
    etiqueta,
    monto_resultado_abs: Math.abs(real.neto),
    por_categoria,
    totales: {
      ingresos_proyectados: proj.ingresos,
      egresos_proyectados: proj.egresos,
      ingresos_reales: real.ingresos,
      egresos_reales: real.egresos,
    },
  };

  const { error: eIns } = await supabase.from("cashflow_cierres_obra").insert({
    obra_id: obraId,
    presupuesto_id: presupuestoId,
    payload,
  });
  if (eIns) {
    return { ok: false, status: 500, error: eIns.message };
  }

  const { error: eFin } = await supabase
    .from("obras")
    .update({ finalizada_at: new Date().toISOString() })
    .eq("id", obraId);

  if (eFin) {
    return { ok: false, status: 500, error: eFin.message };
  }

  // Loop de oro del cotizador (Frente D): contraste cotizado vs gastado real.
  // Best-effort — nunca bloquea el cierre de la obra.
  const lecciones = await correrContrasteObra(supabase, presupuestoId);

  return { ok: true, cierre: payload, lecciones_contraste: lecciones };
}
