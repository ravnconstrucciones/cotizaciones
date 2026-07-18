import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo } from "@/lib/dinero-sync";

/**
 * Restaurar desde la papelera universal: reinserta la fila archivada en su
 * tabla original, des-anula el movimiento de Caja vinculado (si lo había) y
 * re-sincroniza el espejo del ledger. Solo tablas con espejo conocido.
 */

type Params = { params: Promise<{ id: string }> };

const TABLAS_PERMITIDAS = new Set(["presupuestos_gastos"]);

export async function POST(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseAdminClient();

    const { data: p, error } = await supabase
      .from("papelera_registros")
      .select("id, tabla, registro_id, registro")
      .eq("id", id)
      .is("restaurado_at", null)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!p) {
      return NextResponse.json(
        { error: "No hay registro en la papelera con ese id." },
        { status: 404 }
      );
    }
    if (!TABLAS_PERMITIDAS.has(p.tabla)) {
      return NextResponse.json(
        { error: `La tabla ${p.tabla} no se puede restaurar desde acá.` },
        { status: 400 }
      );
    }

    const registro = p.registro as Record<string, unknown>;
    // upsert: si la fila ya volvió por otro camino, no duplica.
    const { error: eIns } = await supabase.from(p.tabla).upsert(registro);
    if (eIns) {
      return NextResponse.json({ error: eIns.message }, { status: 500 });
    }

    // El gasto anulaba su egreso de Caja al borrarse — lo des-anulamos junto.
    const cfId =
      typeof registro.cashflow_item_id === "string" &&
      registro.cashflow_item_id.trim() !== ""
        ? registro.cashflow_item_id
        : null;
    if (cfId) {
      const { error: eCf } = await supabase
        .from("cashflow_items")
        .update({ deleted_at: null })
        .eq("id", cfId);
      if (eCf) {
        return NextResponse.json({ error: eCf.message }, { status: 500 });
      }
    }

    const { error: eMark } = await supabase
      .from("papelera_registros")
      .update({ restaurado_at: new Date().toISOString() })
      .eq("id", p.id);
    if (eMark) {
      return NextResponse.json({ error: eMark.message }, { status: 500 });
    }

    // Espejo Dinero: best-effort, jamás rompe la restauración.
    await sincronizarEspejo(supabase, p.tabla, p.registro_id).catch((e) =>
      console.error("[dinero espejo]", e)
    );
    if (cfId) {
      await sincronizarEspejo(supabase, "cashflow_items", cfId).catch((e) =>
        console.error("[dinero espejo]", e)
      );
    }

    return NextResponse.json({ ok: true, tabla: p.tabla, id: p.registro_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
