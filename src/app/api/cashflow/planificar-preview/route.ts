import { NextResponse } from "next/server";
import {
  fechasEgresosDistribuidas,
  repartirPorcentajesIngresos,
} from "@/lib/cashflow-planificar";
import { todayBuenosAires } from "@/lib/cashflow-compute";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
} from "@/lib/ravn-propuesta-pref";
import { montoLineaPresupuesto } from "@/lib/cashflow-matching";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const presupuestoId = searchParams.get("presupuesto_id")?.trim();
    if (!presupuestoId) {
      return NextResponse.json(
        { error: "Falta presupuesto_id." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: pres, error: ePres } = await supabase
      .from("presupuestos")
      .select("id, presupuesto_aprobado, propuesta_comercial_pref")
      .eq("id", presupuestoId)
      .maybeSingle();

    if (ePres) {
      return NextResponse.json({ error: ePres.message }, { status: 500 });
    }
    if (!pres) {
      return NextResponse.json(
        { error: "Presupuesto no encontrado." },
        { status: 404 }
      );
    }
    if ((pres as { presupuesto_aprobado?: boolean }).presupuesto_aprobado) {
      return NextResponse.json(
        {
          error:
            "Este presupuesto ya está aprobado. Para cambiar el plan de cashflow editá los ítems desde la obra.",
        },
        { status: 409 }
      );
    }

    const pref = parsePropuestaPrefJsonDesdeMismaFila(
      (pres as { propuesta_comercial_pref?: unknown })
        .propuesta_comercial_pref,
      presupuestoId
    );
    const totalArs = pref
      ? Math.round(importeArsParaPropuesta(pref))
      : 0;

    const hoy = todayBuenosAires();
    const ingresosDefault = repartirPorcentajesIngresos(
      30,
      30,
      20,
      totalArs,
      hoy,
      30,
      60,
      90
    );

    const { data: rawItems, error: eItems } = await supabase
      .from("presupuestos_items")
      .select(
        `
        cantidad,
        precio_material_congelado,
        precio_mo_congelada,
        descuento_material_pct,
        recetas ( nombre_item )
      `
      )
      .eq("presupuesto_id", presupuestoId);

    if (eItems) {
      return NextResponse.json({ error: eItems.message }, { status: 500 });
    }

    type RecJoin = { nombre_item?: string } | { nombre_item?: string }[] | null;
    const lineas: {
      descripcion: string;
      monto: number;
      categoria: string;
      fecha_proyectada: string;
    }[] = [];

    const rows = rawItems ?? [];
    const fechas = fechasEgresosDistribuidas(hoy, rows.length);
    let idx = 0;
    for (const row of rows as Record<string, unknown>[]) {
      const cant = Number(row.cantidad) || 0;
      const pm = Number(row.precio_material_congelado) || 0;
      const pmo = Number(row.precio_mo_congelada) || 0;
      const disc = Number(row.descuento_material_pct) || 0;
      const m = montoLineaPresupuesto(cant, pm, pmo, disc);
      const rj = row.recetas as RecJoin;
      const nombre = Array.isArray(rj)
        ? rj[0]?.nombre_item
        : rj?.nombre_item;
      const desc = nombre ? String(nombre) : "Ítem presupuesto";
      const matPart = cant * pm * Math.max(0, 1 - Math.min(100, disc) / 100);
      const moPart = cant * pmo;
      const cat = matPart >= moPart ? "material" : "mano_de_obra";
      lineas.push({
        descripcion: `Costo directo · ${desc}`,
        monto: m,
        categoria: cat,
        fecha_proyectada: fechas[idx] ?? fechas[fechas.length - 1] ?? hoy,
      });
      idx++;
    }

    return NextResponse.json({
      presupuesto_id: presupuestoId,
      total_ars_referencia: totalArs,
      fecha_base: hoy,
      ingresos: ingresosDefault,
      egresos: lineas,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
