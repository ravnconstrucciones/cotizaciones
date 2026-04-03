import { createClient } from "@/lib/supabase/client";

/**
 * Marca el presupuesto como con PDF generado (historial “solo terminados”).
 * Requiere columna `pdf_generado boolean` en `presupuestos`.
 */
export async function marcarPdfGenerado(
  presupuestoId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("presupuestos")
      .update({ pdf_generado: true })
      .eq("id", presupuestoId);
    return { error: error?.message ?? null };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "No se pudo actualizar el presupuesto.",
    };
  }
}
