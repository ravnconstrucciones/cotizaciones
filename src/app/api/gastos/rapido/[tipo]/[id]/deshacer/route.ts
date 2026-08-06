import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  respuestaDeshacerRpc,
  type ResultadoDeshacerRpc,
  type TipoGastoRapido,
} from "@/lib/gastos-rapidos";

type Params = { params: Promise<{ tipo: string; id: string }> };

const TIPOS = new Set<TipoGastoRapido>(["obra", "empresa", "personal"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, ctx: Params) {
  const { tipo, id } = await ctx.params;
  if (!TIPOS.has(tipo as TipoGastoRapido) || !UUID_RE.test(id)) {
    return NextResponse.json(
      { ok: false, error: "Tipo o id inválido" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await createSupabaseAdminClient().rpc(
      "gasto_rapido_deshacer",
      { p_tipo: tipo, p_id: id }
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const respuesta = respuestaDeshacerRpc(data as ResultadoDeshacerRpc);
    return NextResponse.json(respuesta.body, { status: respuesta.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al deshacer";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
