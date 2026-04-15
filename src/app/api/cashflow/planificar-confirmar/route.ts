import { NextResponse } from "next/server";
import { categoriaValidaParaTipo } from "@/lib/cashflow-validate";
import type { CashflowTipo } from "@/lib/cashflow-compute";
import { estadoDesdeTipo } from "@/lib/cashflow-matching";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
} from "@/lib/ravn-propuesta-pref";

type Fila = {
  tipo: CashflowTipo;
  categoria: string;
  descripcion: string;
  monto_proyectado: number;
  fecha_proyectada: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      presupuesto_id?: string;
      filas?: Fila[];
    };
    const presupuestoId = body.presupuesto_id?.trim();
    const filas = Array.isArray(body.filas) ? body.filas : [];

    if (!presupuestoId) {
      return NextResponse.json(
        { error: "presupuesto_id requerido." },
        { status: 400 }
      );
    }
    if (filas.length === 0) {
      return NextResponse.json({ error: "Sin filas para crear." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    const { data: pres, error: ePres } = await supabase
      .from("presupuestos")
      .select("id, presupuesto_aprobado, propuesta_comercial_pref")
      .eq("id", presupuestoId)
      .maybeSingle();

    if (ePres || !pres) {
      return NextResponse.json(
        { error: ePres?.message ?? "Presupuesto no encontrado." },
        { status: 404 }
      );
    }
    if ((pres as { presupuesto_aprobado?: boolean }).presupuesto_aprobado) {
      return NextResponse.json(
        { error: "El presupuesto ya estaba aprobado." },
        { status: 409 }
      );
    }

    const pref = parsePropuestaPrefJsonDesdeMismaFila(
      (pres as { propuesta_comercial_pref?: unknown })
        .propuesta_comercial_pref,
      presupuestoId
    );
    const refTotal = pref ? Math.round(importeArsParaPropuesta(pref)) : 0;

    for (const f of filas) {
      if (f.tipo !== "ingreso" && f.tipo !== "egreso") {
        return NextResponse.json({ error: "Tipo inválido en filas." }, { status: 400 });
      }
      if (!categoriaValidaParaTipo(f.tipo, f.categoria)) {
        return NextResponse.json(
          { error: `Categoría inválida: ${f.categoria}` },
          { status: 400 }
        );
      }
      const mp = roundArs2(Number(f.monto_proyectado));
      if (!Number.isFinite(mp) || mp < 0) {
        return NextResponse.json({ error: "Monto inválido." }, { status: 400 });
      }
      const fp = String(f.fecha_proyectada ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fp)) {
        return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
      }
    }

    const sumIng = roundArs2(
      filas.filter((f) => f.tipo === "ingreso").reduce((a, f) => a + roundArs2(Number(f.monto_proyectado)), 0)
    );
    if (
      refTotal > 0 &&
      filas.some((f) => f.tipo === "ingreso") &&
      Math.abs(sumIng - refTotal) > Math.max(2, refTotal * 0.002)
    ) {
      return NextResponse.json(
        {
          error:
            "La suma de ingresos no coincide con el total de la propuesta (ARS). Revisá los montos.",
          suma_ingresos: sumIng,
          total_referencia: refTotal,
        },
        { status: 400 }
      );
    }

    let { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id")
      .eq("presupuesto_id", presupuestoId)
      .maybeSingle();

    if (eObra) {
      return NextResponse.json({ error: eObra.message }, { status: 500 });
    }
    if (!obra) {
      const ins = await supabase
        .from("obras")
        .insert({ presupuesto_id: presupuestoId })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        return NextResponse.json(
          { error: ins.error?.message ?? "No se pudo crear la obra." },
          { status: 500 }
        );
      }
      obra = ins.data;
    }

    const obraId = String((obra as { id: string }).id);

    const inserts = filas.map((f) => {
      const m = roundArs2(Number(f.monto_proyectado));
      const fecha = String(f.fecha_proyectada).slice(0, 10);
      return {
        obra_id: obraId,
        tipo: f.tipo,
        categoria: f.categoria,
        descripcion: String(f.descripcion ?? "").slice(0, 500),
        monto_proyectado: m,
        fecha_proyectada: fecha,
        monto_real: m,
        fecha_real: fecha,
        estado: estadoDesdeTipo(f.tipo),
        notas: "PLAN_APROBACION",
      };
    });

    const { error: eIns } = await supabase.from("cashflow_items").insert(inserts);
    if (eIns) {
      return NextResponse.json({ error: eIns.message }, { status: 500 });
    }

    const { error: eAp } = await supabase
      .from("presupuestos")
      .update({ presupuesto_aprobado: true })
      .eq("id", presupuestoId);

    if (eAp) {
      return NextResponse.json(
        {
          error:
            eAp.message +
            " (Los ítems de cashflow ya se insertaron; corregí el presupuesto a mano si hace falta.)",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, obra_id: obraId, creados: inserts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
