import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/presupuestos/[id] — borra un presupuesto (caso: limpiar los de
 * muestra que ensucian la galería). Borrado FÍSICO y en orden seguro:
 *  1) nulea las FKs nullable que apuntan al presupuesto (cotizaciones, tareas,
 *     cotizador_lecciones) — preservan su info, solo sueltan el vínculo.
 *  2) borra los hijos NOT NULL sin cascade (obra_archivos, obra_avances) +
 *     presupuestos_items (tabla vieja sin cascade conocido).
 *  3) borra el presupuesto → cascade se lleva presupuestos_gastos, cashflow_obras
 *     y los cierres (esos sí tienen ON DELETE CASCADE).
 * Service role (bypasea RLS) — lo dispara Eze desde el tablero.
 */
export async function DELETE(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();

  // 1) Soltar FKs nullable (no se pierde la info, solo el vínculo).
  for (const [tabla, col] of [
    ["cotizaciones", "presupuesto_id"],
    ["tareas", "presupuesto_id"],
    ["cotizador_lecciones", "obra_presupuesto_id"],
  ] as const) {
    const { error } = await sb.from(tabla).update({ [col]: null }).eq(col, id);
    if (error) {
      return NextResponse.json(
        { error: `soltando ${tabla}: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // 2) Borrar hijos que bloquean (NOT NULL, sin cascade) + items.
  for (const tabla of ["obra_archivos", "obra_avances", "presupuestos_items"] as const) {
    const { error } = await sb.from(tabla).delete().eq("presupuesto_id", id);
    // presupuestos_items podría no existir en algún entorno: ignorar "no existe".
    if (error && !/does not exist|relation .* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: `borrando ${tabla}: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // 3) Borrar el presupuesto (cascade → presupuestos_gastos, cashflow_obras, cierres).
  const { data, error } = await sb
    .from("presupuestos")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Presupuesto no encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
