import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const supabase = createSupabaseServerClient();
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
    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
