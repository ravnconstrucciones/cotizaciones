import type { SupabaseClient } from "@supabase/supabase-js";

const CORRELATIVO_INICIAL = 40;

type PresupuestoCorrelativoRow = {
  numero_correlativo: number | null;
};

/**
 * Resuelve el número correlativo comercial del presupuesto.
 * - Si existe columna `numero_correlativo` y el registro ya tiene valor, lo devuelve.
 * - Si está vacío, intenta MAX+1 (o 40 si no hay ninguno con valor) y persiste en la fila.
 * - Si la columna no existe o el update falla, usa orden por fecha + id (índice 0 → 40, 1 → 41, …).
 */
export async function resolveNumeroComercial(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<number> {
  const { data: selfRow, error: selfErr } = await supabase
    .from("presupuestos")
    .select("numero_correlativo")
    .eq("id", presupuestoId)
    .maybeSingle();

  if (selfErr) {
    return correlativoPorRanking(supabase, presupuestoId);
  }

  const self = selfRow as PresupuestoCorrelativoRow | null;
  if (
    self?.numero_correlativo != null &&
    Number.isFinite(Number(self.numero_correlativo))
  ) {
    return Number(self.numero_correlativo);
  }

  const { data: maxRow, error: maxErr } = await supabase
    .from("presupuestos")
    .select("numero_correlativo")
    .not("numero_correlativo", "is", null)
    .order("numero_correlativo", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) {
    return correlativoPorRanking(supabase, presupuestoId);
  }

  const maxVal = (maxRow as PresupuestoCorrelativoRow | null)?.numero_correlativo;
  const next =
    maxVal != null && Number.isFinite(Number(maxVal))
      ? Number(maxVal) + 1
      : CORRELATIVO_INICIAL;

  const { error: updErr } = await supabase
    .from("presupuestos")
    .update({ numero_correlativo: next })
    .eq("id", presupuestoId)
    .is("numero_correlativo", null);

  if (!updErr) {
    return next;
  }

  return correlativoPorRanking(supabase, presupuestoId);
}

async function correlativoPorRanking(
  supabase: SupabaseClient,
  presupuestoId: string
): Promise<number> {
  const { data: all, error } = await supabase
    .from("presupuestos")
    .select("id, fecha")
    .order("fecha", { ascending: true })
    .order("id", { ascending: true });

  if (error || !all?.length) {
    return CORRELATIVO_INICIAL;
  }

  const idx = all.findIndex((p) => String(p.id) === presupuestoId);
  if (idx < 0) {
    return CORRELATIVO_INICIAL;
  }

  return CORRELATIVO_INICIAL + idx;
}

export function prefijoPlantillaComercial(
  plantilla: "negro" | "beige" | "verde"
): "P1" | "P2" | "P3" {
  if (plantilla === "beige") return "P2";
  if (plantilla === "verde") return "P3";
  return "P1";
}

export function formatNumeroComercialHumano(
  prefijo: "P1" | "P2" | "P3",
  numero: number
): string {
  const n = Number.isFinite(numero) ? Math.max(0, Math.floor(numero)) : CORRELATIVO_INICIAL;
  return `${prefijo}-${String(n).padStart(5, "0")}`;
}
