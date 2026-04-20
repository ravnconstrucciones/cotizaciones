import { NextResponse } from "next/server";
import {
  addDaysIso,
  parseNum,
  saldoCajaTotal,
  serieSaldoObraChart,
  todayBuenosAires,
  totalesReales,
  type CashflowItemRow,
} from "@/lib/cashflow-compute";
import { roundArs2 } from "@/lib/format-currency";
import {
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
} from "@/lib/ravn-propuesta-pref";
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
    estado: r.estado,
    notas: r.notas ?? "",
  };
}

export async function GET(_req: Request, ctx: Params) {
  try {
    const { obra_id } = await ctx.params;
    const supabase = createSupabaseServerClient();

    const { data: obraRow, error: errObra } = await supabase
      .from("obras")
      .select(
        `
        id,
        presupuesto_id,
        finalizada_at,
        presupuestos (
          id,
          nombre_obra,
          nombre_cliente,
          presupuesto_aprobado,
          propuesta_comercial_pref
        )
      `
      )
      .eq("id", obra_id)
      .maybeSingle();

    if (errObra) {
      return NextResponse.json({ error: errObra.message }, { status: 500 });
    }
    if (!obraRow) {
      return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 });
    }

    const { data: cierreRow } = await supabase
      .from("cashflow_cierres_obra")
      .select("payload, created_at")
      .eq("obra_id", obra_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const raw = obraRow as {
      presupuesto_id: string;
      finalizada_at?: string | null;
      presupuestos:
        | {
            id: string;
            nombre_obra: string | null;
            nombre_cliente: string | null;
            presupuesto_aprobado: boolean | null;
            propuesta_comercial_pref?: unknown;
          }
        | {
            id: string;
            nombre_obra: string | null;
            nombre_cliente: string | null;
            presupuesto_aprobado: boolean | null;
            propuesta_comercial_pref?: unknown;
          }[]
        | null;
    };
    const pres = Array.isArray(raw.presupuestos)
      ? raw.presupuestos[0] ?? null
      : raw.presupuestos;

    const { data: rawItems, error: errItems } = await supabase
      .from("cashflow_items")
      .select(
        "id, obra_id, tipo, categoria, descripcion, monto_proyectado, fecha_proyectada, monto_real, fecha_real, estado, notas"
      )
      .eq("obra_id", obra_id)
      .is("deleted_at", null);

    if (errItems) {
      return NextResponse.json({ error: errItems.message }, { status: 500 });
    }

    const { data: rawAnulados, error: errAnul } = await supabase
      .from("cashflow_items")
      .select(
        "id, tipo, categoria, descripcion, monto_real, fecha_real, deleted_at"
      )
      .eq("obra_id", obra_id)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .limit(40);

    const anuladosRows =
      errAnul || !rawAnulados ? [] : (rawAnulados as Record<string, unknown>[]);

    const items = (rawItems ?? [])
      .map((r) => mapItem(r as DbItem))
      .sort((a, b) => {
        const fa = a.fecha_real ?? a.fecha_proyectada;
        const fb = b.fecha_real ?? b.fecha_proyectada;
        return fb.localeCompare(fa);
      });
    const hoy = todayBuenosAires();
    const real = totalesReales(items);

    const pref =
      pres?.id != null
        ? parsePropuestaPrefJsonDesdeMismaFila(
            (pres as { propuesta_comercial_pref?: unknown })
              .propuesta_comercial_pref,
            pres.id
          )
        : null;
    const referencia_propuesta_ars = pref ? importeArsParaPropuesta(pref) : null;
    const pendiente_ingreso_referencia_ars =
      referencia_propuesta_ars != null
        ? roundArs2(referencia_propuesta_ars - real.ingresos)
        : null;

    const items_anulados = anuladosRows.map((r) => ({
      id: String((r as { id: string }).id),
      tipo: (r as { tipo: string }).tipo === "egreso" ? "egreso" : "ingreso",
      categoria: String((r as { categoria: string }).categoria ?? ""),
      descripcion: String((r as { descripcion: string }).descripcion ?? ""),
      monto_real:
        (r as { monto_real: unknown }).monto_real == null
          ? null
          : parseNum((r as { monto_real: unknown }).monto_real),
      fecha_real: (r as { fecha_real: string | null }).fecha_real
        ? String((r as { fecha_real: string }).fecha_real).slice(0, 10)
        : null,
      deleted_at: String((r as { deleted_at: string }).deleted_at),
    }));

    let minF = hoy;
    let maxF = addDaysIso(hoy, 30);
    for (const it of items) {
      if (it.fecha_proyectada < minF) minF = it.fecha_proyectada;
      if (it.fecha_proyectada > maxF) maxF = it.fecha_proyectada;
      if (it.fecha_real) {
        if (it.fecha_real < minF) minF = it.fecha_real;
        if (it.fecha_real > maxF) maxF = it.fecha_real;
      }
    }
    const desde = addDaysIso(minF, -3);
    const hasta = addDaysIso(maxF, 14);
    const serie_saldo_libreta = serieSaldoObraChart(items, desde, hasta);

    const nombreObra =
      pres?.nombre_obra?.trim() ||
      pres?.nombre_cliente?.trim() ||
      "Sin nombre";

    return NextResponse.json({
      obra_id,
      presupuesto_id: raw.presupuesto_id,
      nombre_obra: nombreObra,
      presupuesto_aprobado: Boolean(pres?.presupuesto_aprobado),
      finalizada_at: raw.finalizada_at ?? null,
      ultimo_cierre:
        cierreRow && !Array.isArray(cierreRow)
          ? {
              created_at: (cierreRow as { created_at: string }).created_at,
              payload: (cierreRow as { payload: unknown }).payload,
            }
          : null,
      fecha_referencia: hoy,
      saldo_caja: saldoCajaTotal(items),
      totales_caja: real,
      referencia_propuesta_ars,
      pendiente_ingreso_referencia_ars,
      resultado: {
        segun_caja: real.neto >= 0 ? "ganando" : "perdiendo",
        monto_neto: real.neto,
      },
      items,
      items_anulados,
      serie_saldo_libreta: serie_saldo_libreta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
