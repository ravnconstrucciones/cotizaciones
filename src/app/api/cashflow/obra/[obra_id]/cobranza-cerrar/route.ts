import { NextResponse } from "next/server";
import {
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
} from "@/lib/ravn-propuesta-pref";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ obra_id: string }> };

/**
 * Fija total a cobrar al cliente (desde propuesta comercial) y activa modo cobranza.
 * Saldo por cobrar = monto_total_a_cobrar_ars − ingresos caja (pagos parciales restan).
 */
export async function POST(_req: Request, ctx: Params) {
  try {
    const { obra_id } = await ctx.params;
    const supabase = createSupabaseServerClient();

    const { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id, presupuesto_id, cobranza_cerrada_at")
      .eq("id", obra_id)
      .maybeSingle();

    if (eObra || !obra) {
      return NextResponse.json(
        { error: eObra?.message ?? "Obra no encontrada." },
        { status: 404 }
      );
    }

    if ((obra as { cobranza_cerrada_at?: string | null }).cobranza_cerrada_at) {
      return NextResponse.json(
        { error: "La cobranza ya está cerrada para esta obra." },
        { status: 409 }
      );
    }

    const presupuestoId = String((obra as { presupuesto_id: string }).presupuesto_id);

    const { data: pres, error: ePres } = await supabase
      .from("presupuestos")
      .select("id, propuesta_comercial_pref, libreta_caja_empresa")
      .eq("id", presupuestoId)
      .maybeSingle();

    if (ePres || !pres) {
      return NextResponse.json(
        { error: ePres?.message ?? "Presupuesto no encontrado." },
        { status: 404 }
      );
    }
    if ((pres as { libreta_caja_empresa?: boolean }).libreta_caja_empresa) {
      return NextResponse.json(
        { error: "No aplica a la libreta empresa." },
        { status: 400 }
      );
    }

    const pref = parsePropuestaPrefJsonDesdeMismaFila(
      (pres as { propuesta_comercial_pref?: unknown }).propuesta_comercial_pref,
      presupuestoId
    );
    const monto = pref ? roundArs2(importeArsParaPropuesta(pref)) : null;
    if (monto == null || monto <= 0) {
      return NextResponse.json(
        {
          error:
            "No hay importe de propuesta comercial (Rentabilidad). Completalo antes de cerrar cobranza.",
        },
        { status: 400 }
      );
    }

    const { error: eUpd } = await supabase
      .from("obras")
      .update({
        cobranza_cerrada_at: new Date().toISOString(),
        monto_total_a_cobrar_ars: monto,
      })
      .eq("id", obra_id);

    if (eUpd) {
      return NextResponse.json({ error: eUpd.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      monto_total_a_cobrar_ars: monto,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
