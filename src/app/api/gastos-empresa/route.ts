import { NextResponse } from "next/server";
import { armarMesEmpresa, type GastoEmpresaRow } from "@/lib/gastos-empresa";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * GASTOS DE EMPRESA — datos del calendario de /empresa.
 *
 * GET ?mes=YYYY-MM (default: mes actual en Argentina) → MesEmpresa: día por
 * día + desglose por categoría canónica. La matemática vive en
 * src/lib/gastos-empresa.ts (pura, testeada); acá solo se juntan las filas.
 *
 * Service_role (bypass RLS), detrás del middleware de sesión.
 */

function mesActualAR(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pedido = url.searchParams.get("mes");
  const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : mesActualAR();

  const [anio, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio!, m!, 0)).getUTCDate();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("gastos_empresa")
    .select("id, fecha, concepto, monto, moneda, categoria")
    .gte("fecha", `${mes}-01`)
    .lte("fecha", `${mes}-${String(ultimo).padStart(2, "0")}`)
    .order("fecha", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(armarMesEmpresa(mes, (data ?? []) as GastoEmpresaRow[]));
}
