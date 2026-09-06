/**
 * Lógica pura de ordenamiento de proyectos para la vista "TODAS".
 * Separada del endpoint para poder testearla con Vitest sin mocks de Supabase.
 */

export type ProyectoRow = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
  presupuesto_aprobado: boolean | null;
  created_at: string;
  cant_items: number;
  cant_gastos: number;
};

/**
 * Ordena por creación, del último proyecto al primero.
 */
export function ordenarProyectos(rows: ProyectoRow[]): ProyectoRow[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

/** Clasifica un proyecto como "aprobado", "con_items" o "borrador". */
export function clasificarProyecto(
  row: Pick<ProyectoRow, "presupuesto_aprobado" | "cant_items">
): "aprobado" | "con_items" | "borrador" {
  if (row.presupuesto_aprobado) return "aprobado";
  if (row.cant_items > 0) return "con_items";
  return "borrador";
}
