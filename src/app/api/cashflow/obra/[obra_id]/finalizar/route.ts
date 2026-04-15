import { NextResponse } from "next/server";
import {
  parseNum,
  totalesProyectados,
  totalesReales,
  type CashflowItemRow,
} from "@/lib/cashflow-compute";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ obra_id: string }> };

type DbItem = {
  id: string;
  obra_id: string;
  tipo: string;
  categoria: string;
  descripcion: string;
  monto_proyectado: string | number;
  fecha_proyectada: string;
  monto_real: string | number | null;
  fecha_real: string | null;
  estado: string;
  notas: string;
};

function mapItem(r: DbItem): CashflowItemRow {
  return {
    id: r.id,
    obra_id: r.obra_id,
    tipo: r.tipo === "egreso" ? "egreso" : "ingreso",
    categoria: r.categoria,
    descripcion: r.descripcion ?? "",
    monto_proyectado: parseNum(r.monto_proyectado),
    fecha_proyectada: String(r.fecha_proyectada).slice(0, 10),
    monto_real: r.monto_real == null ? null : parseNum(r.monto_real),
    fecha_real: r.fecha_real ? String(r.fecha_real).slice(0, 10) : null,
    estado: r.estado ?? "",
    notas: r.notas ?? "",
  };
}

export async function POST(_req: Request, ctx: Params) {
  try {
    const { obra_id } = await ctx.params;
    const supabase = createSupabaseServerClient();

    const { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id, presupuesto_id, finalizada_at")
      .eq("id", obra_id)
      .maybeSingle();

    if (eObra || !obra) {
      return NextResponse.json(
        { error: eObra?.message ?? "Obra no encontrada." },
        { status: 404 }
      );
    }
    if ((obra as { finalizada_at?: string | null }).finalizada_at) {
      return NextResponse.json(
        { error: "La obra ya está finalizada." },
        { status: 409 }
      );
    }

    const presupuestoId = String((obra as { presupuesto_id: string }).presupuesto_id);

    const { data: presRow } = await supabase
      .from("presupuestos")
      .select("libreta_caja_empresa")
      .eq("id", presupuestoId)
      .maybeSingle();
    if ((presRow as { libreta_caja_empresa?: boolean } | null)?.libreta_caja_empresa) {
      return NextResponse.json(
        { error: "La libreta de empresa no se finaliza como obra de cliente." },
        { status: 400 }
      );
    }

    const { data: rawItems, error: eItems } = await supabase
      .from("cashflow_items")
      .select(
        "id, obra_id, tipo, categoria, descripcion, monto_proyectado, fecha_proyectada, monto_real, fecha_real, estado, notas"
      )
      .eq("obra_id", obra_id)
      .is("deleted_at", null);

    if (eItems) {
      return NextResponse.json({ error: eItems.message }, { status: 500 });
    }

    const itemsFull = (rawItems ?? []).map((r) => mapItem(r as DbItem));

    const proj = totalesProyectados(itemsFull);
    const real = totalesReales(itemsFull);
    const diffArs = real.neto - proj.neto;
    const diffPct =
      Math.abs(proj.neto) > 0.01
        ? Math.round((diffArs / Math.abs(proj.neto)) * 10000) / 100
        : 0;
    const gano = real.neto >= 0;
    const etiqueta = gano ? "GANÓ" : "PERDIÓ";

    const categorias = new Set<string>();
    for (const it of itemsFull) categorias.add(it.categoria);

    const por_categoria: Record<
      string,
      { presupuestado: number; real: number; tipo: "ingreso" | "egreso" }
    > = {};
    for (const cat of categorias) {
      const sample = itemsFull.find((i) => i.categoria === cat);
      por_categoria[cat] = {
        presupuestado: 0,
        real: 0,
        tipo: sample?.tipo === "egreso" ? "egreso" : "ingreso",
      };
    }
    for (const it of itemsFull) {
      const b = por_categoria[it.categoria];
      if (!b) continue;
      b.tipo = it.tipo;
      b.presupuestado += it.monto_proyectado;
      if (it.monto_real != null) b.real += it.monto_real;
    }

    const payload = {
      generado_en: new Date().toISOString(),
      margen_proyectado_ars: proj.neto,
      margen_real_ars: real.neto,
      diferencia_ars: diffArs,
      diferencia_pct: diffPct,
      etiqueta,
      monto_resultado_abs: Math.abs(real.neto),
      por_categoria,
      totales: {
        ingresos_proyectados: proj.ingresos,
        egresos_proyectados: proj.egresos,
        ingresos_reales: real.ingresos,
        egresos_reales: real.egresos,
      },
    };

    const { error: eIns } = await supabase.from("cashflow_cierres_obra").insert({
      obra_id,
      presupuesto_id: presupuestoId,
      payload,
    });
    if (eIns) {
      return NextResponse.json({ error: eIns.message }, { status: 500 });
    }

    const { error: eFin } = await supabase
      .from("obras")
      .update({ finalizada_at: new Date().toISOString() })
      .eq("id", obra_id);

    if (eFin) {
      return NextResponse.json({ error: eFin.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cierre: payload });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
