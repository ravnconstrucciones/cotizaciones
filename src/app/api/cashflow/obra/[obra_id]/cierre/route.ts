import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ obra_id: string }> };

export async function GET(_req: Request, ctx: Params) {
  try {
    const { obra_id } = await ctx.params;
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("cashflow_cierres_obra")
      .select("id, payload, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ cierre: null });
    }
    return NextResponse.json({
      cierre: {
        id: data.id,
        created_at: data.created_at,
        payload: data.payload,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
