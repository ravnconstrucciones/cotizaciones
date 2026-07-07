import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo, type TablaEspejo } from "@/lib/dinero-sync";

const TABLAS: TablaEspejo[] = [
  "presupuestos_gastos", "cashflow_items", "gastos_empresa",
  "gastos_personales", "retiros_socio", "transferencias",
];

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const tabla = body?.tabla as TablaEspejo;
  const id = String(body?.id ?? "");
  if (!TABLAS.includes(tabla) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "tabla o id inválidos" }, { status: 400 });
  }
  try {
    const r = await sincronizarEspejo(createSupabaseAdminClient(), tabla, id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[api/dinero/espejo]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
