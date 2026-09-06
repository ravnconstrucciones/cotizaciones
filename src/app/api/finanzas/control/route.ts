import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Revisión fechada: no sustituye al ledger ni acredita reintegros estimados.
export async function GET() {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb.from("eventos")
      .select("id, creado_at, contenido")
      .eq("tipo", "revision_financiera_integral")
      .eq("estado", "procesado")
      .order("creado_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return NextResponse.json({ error: "No se pudo leer la revisión financiera." }, { status: 500 });
    return NextResponse.json({ revision: data ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la revisión financiera." }, { status: 500 });
  }
}
