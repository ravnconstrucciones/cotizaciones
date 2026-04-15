import { NextResponse } from "next/server";
import { parseNum, todayBuenosAires } from "@/lib/cashflow-compute";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string;
      usar_monto_proyectado?: boolean;
      monto_real?: number;
      fecha_real?: string;
    };
    const id = body.id?.trim();
    if (!id) {
      return NextResponse.json({ error: "id requerido." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: row, error: e0 } = await supabase
      .from("cashflow_items")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (e0 || !row) {
      return NextResponse.json(
        { error: e0?.message ?? "Ítem no encontrado." },
        { status: 404 }
      );
    }

    const tipo = row.tipo === "egreso" ? "egreso" : "ingreso";
    const estado = estadoDesdeTipo(tipo);
    const hoy = todayBuenosAires();

    let montoReal: number;
    let fechaReal: string;
    if (body.usar_monto_proyectado !== false) {
      montoReal = roundArs2(parseNum(row.monto_proyectado));
      fechaReal = body.fecha_real?.trim() || hoy;
    } else {
      montoReal = roundArs2(Number(body.monto_real));
      fechaReal = String(body.fecha_real ?? "").slice(0, 10);
    }

    if (!Number.isFinite(montoReal) || montoReal <= 0) {
      return NextResponse.json({ error: "monto_real inválido." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaReal)) {
      return NextResponse.json({ error: "fecha_real inválida." }, { status: 400 });
    }

    const { error: eUpd } = await supabase
      .from("cashflow_items")
      .update({
        monto_real: montoReal,
        fecha_real: fechaReal,
        estado,
      })
      .eq("id", id)
      .is("deleted_at", null);

    if (eUpd) {
      return NextResponse.json({ error: eUpd.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item_id: id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
