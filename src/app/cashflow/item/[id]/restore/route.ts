import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo } from "@/lib/dinero-sync";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("cashflow_items")
      .update({ deleted_at: null })
      .eq("id", id)
      .not("deleted_at", "is", null)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "No hay movimiento anulado con ese id." },
        { status: 404 }
      );
    }

    // Espejo Dinero (Fase 2): best-effort, jamás rompe la operación original.
    await sincronizarEspejo(supabase, "cashflow_items", id).catch((e) =>
      console.error("[dinero espejo]", e)
    );

    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
