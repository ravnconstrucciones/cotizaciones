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
 * Ordena proyectos: aprobados primero, luego por cant_items DESC.
 * Dentro de cada grupo, los empates se rompen por created_at DESC (más nuevo primero).
 */
export function ordenarProyectos(rows: ProyectoRow[]): ProyectoRow[] {
  return [...rows].sort((a, b) => {
    const apA = a.presupuesto_aprobado ? 1 : 0;
    const apB = b.presupuesto_aprobado ? 1 : 0;
    if (apB !== apA) return apB - apA; // aprobados primero
    if (b.cant_items !== a.cant_items) return b.cant_items - a.cant_items;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** Clasifica un proyecto como "aprobado", "con_items" o "borrador". */
export function clasificarProyecto(
  row: Pick<ProyectoRow, "presupuesto_aprobado" | "cant_items">
): "aprobado" | "con_items" | "borrador" {
  if (row.presupuesto_aprobado) return "aprobado";
  if (row.cant_items > 0) return "con_items";
  return "borrador";
}
