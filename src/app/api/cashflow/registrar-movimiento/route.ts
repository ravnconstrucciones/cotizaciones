import { NextResponse } from "next/server";
import {
  estadoDesdeTipo,
  quickTipoAParametros,
  type QuickTipoRegistro,
} from "@/lib/cashflow-matching";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      obra_id?: string;
      quick_tipo?: string;
      descripcion?: string;
      monto_real?: number;
      fecha?: string;
    };
    const obraId = body.obra_id?.trim();
    const quick = body.quick_tipo as QuickTipoRegistro;
    const montoReal = roundArs2(Number(body.monto_real));
    const fecha = String(body.fecha ?? "").slice(0, 10);
    const descExtra = String(body.descripcion ?? "").trim();

    if (!obraId) {
      return NextResponse.json({ error: "obra_id requerido." }, { status: 400 });
    }
    if (!Number.isFinite(montoReal) || montoReal <= 0) {
      return NextResponse.json({ error: "monto_real inválido." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: "fecha inválida." }, { status: 400 });
    }

    const validQuick: QuickTipoRegistro[] = [
      "cobre_cliente",
      "pago_proveedor",
      "compra_material",
      "pago_mano_obra",
      "otro",
    ];
    if (!validQuick.includes(quick)) {
      return NextResponse.json({ error: "quick_tipo inválido." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id")
      .eq("id", obraId)
      .maybeSingle();
    if (eObra || !obra) {
      return NextResponse.json(
        { error: eObra?.message ?? "Obra no encontrada." },
        { status: 404 }
      );
    }

    const { tipo, categoriaNueva } = quickTipoAParametros(quick);
    const estado = estadoDesdeTipo(tipo);
    const descripcion =
      descExtra ||
      (quick === "cobre_cliente"
        ? "Cobro cliente"
        : quick === "compra_material"
          ? "Compra material"
          : quick === "pago_proveedor"
            ? "Pago proveedor"
            : quick === "pago_mano_obra"
              ? "Pago mano de obra"
              : "Movimiento");

    const { data: ins, error: eIns } = await supabase
      .from("cashflow_items")
      .insert({
        obra_id: obraId,
        tipo,
        categoria: categoriaNueva,
        descripcion,
        monto_proyectado: montoReal,
        fecha_proyectada: fecha,
        monto_real: montoReal,
        fecha_real: fecha,
        estado,
        notas: "REGISTRO_RAPIDO",
      })
      .select("id")
      .single();

    if (eIns || !ins) {
      return NextResponse.json(
        { error: eIns?.message ?? "No se pudo crear el ítem." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      item_id: (ins as { id: string }).id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
