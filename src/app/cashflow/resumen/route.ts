import { NextResponse } from "next/server";
import { parseNum, todayBuenosAires, totalesReales } from "@/lib/cashflow-compute";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import { roundArs2 } from "@/lib/format-currency";
import {
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
} from "@/lib/ravn-propuesta-pref";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PresRow = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
  presupuesto_aprobado: boolean | null;
  propuesta_comercial_pref?: unknown;
  libreta_caja_empresa?: boolean | null;
};

type ObraJoin = {
  id: string;
  presupuesto_id: string;
  presupuestos: PresRow | PresRow[] | null;
};

type JoinedRow = {
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
  obras: ObraJoin | ObraJoin[] | null;
};

function unwrapObra(obra: ObraJoin | ObraJoin[] | null): ObraJoin | null {
  if (obra == null) return null;
  return Array.isArray(obra) ? obra[0] ?? null : obra;
}

function unwrapPres(
  p: PresRow | PresRow[] | null | undefined
): PresRow | null {
  if (p == null) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

function rowToItem(row: JoinedRow) {
  return {
    id: row.id,
    obra_id: row.obra_id,
    tipo: row.tipo === "egreso" ? ("egreso" as const) : ("ingreso" as const),
    categoria: row.categoria,
    descripcion: row.descripcion ?? "",
    monto_proyectado: parseNum(row.monto_proyectado),
    fecha_proyectada: String(row.fecha_proyectada).slice(0, 10),
    monto_real: row.monto_real == null ? null : parseNum(row.monto_real),
    fecha_real: row.fecha_real ? String(row.fecha_real).slice(0, 10) : null,
    estado: row.estado,
    notas: row.notas ?? "",
  };
}

function esLibretaEmpresa(p: PresRow | null): boolean {
  return Boolean(p?.libreta_caja_empresa);
}

type ObraRow = {
  id: string;
  presupuesto_id: string;
  cobranza_cerrada_at?: string | null;
  monto_total_a_cobrar_ars?: string | number | null;
  presupuestos: PresRow | PresRow[] | null;
};

type GastoDb = {
  id: string;
  presupuesto_id: string;
  fecha: string;
  descripcion: string | null;
  importe: unknown;
};

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const hoy = todayBuenosAires();

    await supabase
      .from("cashflow_items")
      .update({ estado: "vencido" })
      .eq("tipo", "ingreso")
      .eq("estado", "pendiente")
      .is("monto_real", null)
      .is("fecha_real", null)
      .is("deleted_at", null)
      .lt("fecha_proyectada", hoy);

    const { data, error } = await supabase
      .from("cashflow_items")
      .select(
        `
        id,
        obra_id,
        tipo,
        categoria,
        descripcion,
        monto_proyectado,
        fecha_proyectada,
        monto_real,
        fecha_real,
        estado,
        notas,
        obras (
          id,
          presupuesto_id,
          presupuestos (
            id,
            nombre_obra,
            nombre_cliente,
            presupuesto_aprobado
          )
        )
      `
      )
      .is("deleted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as JoinedRow[];

    const { data: obrasData, error: errObras } = await supabase.from("obras").select(`
        id,
        presupuesto_id,
        cobranza_cerrada_at,
        monto_total_a_cobrar_ars,
        presupuestos (
          id,
          nombre_obra,
          nombre_cliente,
          presupuesto_aprobado,
          propuesta_comercial_pref,
          libreta_caja_empresa
        )
      `);
    if (errObras) {
      return NextResponse.json({ error: errObras.message }, { status: 500 });
    }

    const obrasAprobadasTodas = (obrasData ?? []).filter((raw) => {
      const o = raw as ObraRow;
      const p = unwrapPres(o.presupuestos);
      return p?.presupuesto_aprobado === true;
    }) as ObraRow[];

    const obraEmpresa = obrasAprobadasTodas.find((o) => {
      const p = unwrapPres(o.presupuestos);
      return esLibretaEmpresa(p);
    });

    const obrasAprobadas = obrasAprobadasTodas.filter((o) => {
      const p = unwrapPres(o.presupuestos);
      return !esLibretaEmpresa(p);
    });

    const saldoObraIds = new Set<string>([
      ...obrasAprobadas.map((o) => o.id),
      ...(obraEmpresa ? [obraEmpresa.id] : []),
    ]);

    const nombrePorObraId = new Map<string, string>();
    const obraIdPorPresupuestoId = new Map<string, string>();
    for (const raw of obrasAprobadasTodas) {
      const o = raw as ObraRow;
      const p = unwrapPres(o.presupuestos);
      const nombre =
        (p?.nombre_obra?.trim() || p?.nombre_cliente?.trim() || "Sin nombre") ??
        "Obra";
      nombrePorObraId.set(o.id, nombre);
      obraIdPorPresupuestoId.set(o.presupuesto_id, o.id);
    }

    const presIdsAll = obrasAprobadasTodas.map((o) => o.presupuesto_id);
    let gastosRows: GastoDb[] = [];
    if (presIdsAll.length > 0) {
      const { data: gData, error: gErr } = await supabase
        .from("presupuestos_gastos")
        .select("id, presupuesto_id, fecha, descripcion, importe")
        .in("presupuesto_id", presIdsAll);
      if (!gErr && gData) {
        gastosRows = gData as GastoDb[];
      }
    }

    const gastosTotalPorObraId = new Map<string, number>();
    for (const g of gastosRows) {
      const oid = obraIdPorPresupuestoId.get(g.presupuesto_id);
      if (!oid) continue;
      const add = importeGastoObraArs(g);
      gastosTotalPorObraId.set(
        oid,
        roundArs2((gastosTotalPorObraId.get(oid) ?? 0) + add)
      );
    }

    const obrasActivas = obrasAprobadas.map((o) => {
      const p = unwrapPres(o.presupuestos);
      const nombre =
        (p?.nombre_obra?.trim() || p?.nombre_cliente?.trim() || "Sin nombre") ??
        "Obra";
      const sliceFull = rows
        .filter((row) => row.obra_id === o.id)
        .map(rowToItem);
      const tr = totalesReales(sliceFull);
      const pref =
        p?.id != null
          ? parsePropuestaPrefJsonDesdeMismaFila(
              p.propuesta_comercial_pref,
              p.id
            )
          : null;
      const referencia_propuesta_ars = pref ? importeArsParaPropuesta(pref) : null;
      const pendiente_ingreso_referencia_ars =
        referencia_propuesta_ars != null
          ? roundArs2(referencia_propuesta_ars - tr.ingresos)
          : null;

      const egGastos = gastosTotalPorObraId.get(o.id) ?? 0;
      const egLib = tr.egresos;
      const egTotal = roundArs2(egLib + egGastos);
      const saldoObra = roundArs2(tr.ingresos - egTotal);

      const cobCerrada = Boolean(o.cobranza_cerrada_at);
      const montoCobrarSnap = parseNum(o.monto_total_a_cobrar_ars);

      let saldo_por_cobrar_ars: number | null = null;
      if (cobCerrada && montoCobrarSnap > 0) {
        saldo_por_cobrar_ars = roundArs2(Math.max(0, montoCobrarSnap - tr.ingresos));
      } else if (pendiente_ingreso_referencia_ars != null) {
        saldo_por_cobrar_ars = pendiente_ingreso_referencia_ars;
      }

      return {
        obra_id: o.id,
        presupuesto_id: o.presupuesto_id,
        nombre_obra: nombre,
        ingresos_caja: tr.ingresos,
        egresos_libreta_ars: egLib,
        egresos_gastos_obra_ars: egGastos,
        egresos_caja: egTotal,
        saldo_caja: saldoObra,
        referencia_propuesta_ars,
        pendiente_ingreso_referencia_ars,
        saldo_por_cobrar_ars,
        cobranza_cerrada: cobCerrada,
      };
    });
    obrasActivas.sort((a, b) =>
      a.nombre_obra.localeCompare(b.nombre_obra, "es")
    );

    let total_por_cobrar_clientes_ars = 0;
    for (const row of obrasActivas) {
      if (row.saldo_por_cobrar_ars != null) {
        total_por_cobrar_clientes_ars = roundArs2(
          total_por_cobrar_clientes_ars + row.saldo_por_cobrar_ars
        );
      }
    }

    const sliceSaldo = rows
      .filter((row) => saldoObraIds.has(row.obra_id))
      .map(rowToItem);
    const totGlob = totalesReales(sliceSaldo);

    let gastosGlobalArs = 0;
    for (const g of gastosRows) {
      const oid = obraIdPorPresupuestoId.get(g.presupuesto_id);
      if (!oid || !saldoObraIds.has(oid)) continue;
      gastosGlobalArs = roundArs2(gastosGlobalArs + importeGastoObraArs(g));
    }
    const ingresosGlob = totGlob.ingresos;
    const egresosLibGlob = totGlob.egresos;
    const egresosTotGlob = roundArs2(egresosLibGlob + gastosGlobalArs);
    const saldoGlob = roundArs2(ingresosGlob - egresosTotGlob);

    let libreta_empresa: {
      obra_id: string;
      presupuesto_id: string;
      nombre_obra: string;
      ingresos_caja: number;
      egresos_libreta_ars: number;
      egresos_gastos_obra_ars: number;
      egresos_caja: number;
      saldo_caja: number;
    } | null = null;
    if (obraEmpresa) {
      const p = unwrapPres(obraEmpresa.presupuestos);
      const nombre =
        (p?.nombre_obra?.trim() || p?.nombre_cliente?.trim() || "Empresa") ??
        "Empresa";
      const sliceEmp = rows
        .filter((row) => row.obra_id === obraEmpresa.id)
        .map(rowToItem);
      const tr = totalesReales(sliceEmp);
      const egG = gastosTotalPorObraId.get(obraEmpresa.id) ?? 0;
      const egTot = roundArs2(tr.egresos + egG);
      libreta_empresa = {
        obra_id: obraEmpresa.id,
        presupuesto_id: obraEmpresa.presupuesto_id,
        nombre_obra: nombre,
        ingresos_caja: tr.ingresos,
        egresos_libreta_ars: tr.egresos,
        egresos_gastos_obra_ars: egG,
        egresos_caja: egTot,
        saldo_caja: roundArs2(tr.ingresos - egTot),
      };
    }

    const conMontoReal = rows.filter(
      (r) =>
        saldoObraIds.has(r.obra_id) &&
        r.monto_real != null &&
        String(r.monto_real).trim() !== ""
    );
    const obraIdsSaldoArr = [...saldoObraIds];
    let movimientos_anulados_recientes: {
      id: string;
      obra_id: string;
      nombre_obra: string;
      tipo: "ingreso" | "egreso";
      descripcion: string;
      monto_real: number;
      fecha_real: string;
      deleted_at: string;
    }[] = [];
    if (obraIdsSaldoArr.length > 0) {
      const { data: rawAnul, error: errAnul } = await supabase
        .from("cashflow_items")
        .select(
          "id, obra_id, tipo, descripcion, monto_real, fecha_real, deleted_at"
        )
        .in("obra_id", obraIdsSaldoArr)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(25);
      if (!errAnul && rawAnul) {
        movimientos_anulados_recientes = (
          rawAnul as {
            id: string;
            obra_id: string;
            tipo: string;
            descripcion: string | null;
            monto_real: unknown;
            fecha_real: string | null;
            deleted_at: string;
          }[]
        ).map((r) => ({
          id: String(r.id),
          obra_id: String(r.obra_id),
          nombre_obra: nombrePorObraId.get(String(r.obra_id)) ?? "Obra",
          tipo: r.tipo === "egreso" ? ("egreso" as const) : ("ingreso" as const),
          descripcion: String(r.descripcion ?? ""),
          monto_real:
            r.monto_real == null ? 0 : roundArs2(parseNum(r.monto_real)),
          fecha_real: r.fecha_real
            ? String(r.fecha_real).slice(0, 10)
            : "",
          deleted_at: String(r.deleted_at),
        }));
      }
    }

    type MovLin = {
      id: string;
      obra_id: string;
      nombre_obra: string;
      tipo: "ingreso" | "egreso";
      descripcion: string;
      monto_real: number;
      fecha_real: string;
      origen: "libreta" | "gasto_obra";
    };

    const libLines: MovLin[] = [...conMontoReal]
      .sort((a, b) => {
        const fa =
          a.fecha_real != null
            ? String(a.fecha_real).slice(0, 10)
            : String(a.fecha_proyectada).slice(0, 10);
        const fb =
          b.fecha_real != null
            ? String(b.fecha_real).slice(0, 10)
            : String(b.fecha_proyectada).slice(0, 10);
        if (fb !== fa) return fb.localeCompare(fa);
        return String(b.id).localeCompare(String(a.id));
      })
      .map((r) => {
        const it = rowToItem(r);
        const f = it.fecha_real ?? it.fecha_proyectada;
        return {
          id: it.id,
          obra_id: it.obra_id,
          nombre_obra: nombrePorObraId.get(it.obra_id) ?? "Obra",
          tipo: it.tipo,
          descripcion: it.descripcion,
          monto_real: it.monto_real ?? 0,
          fecha_real: f,
          origen: "libreta" as const,
        };
      });

    const gastoLines: MovLin[] = gastosRows
      .filter((g) => {
        const oid = obraIdPorPresupuestoId.get(g.presupuesto_id);
        return Boolean(oid && saldoObraIds.has(oid));
      })
      .map((g) => {
        const oid = obraIdPorPresupuestoId.get(g.presupuesto_id)!;
        const desc = (g.descripcion ?? "").trim();
        return {
          id: `gasto_obra:${g.id}`,
          obra_id: oid,
          nombre_obra: nombrePorObraId.get(oid) ?? "Obra",
          tipo: "egreso" as const,
          descripcion: desc ? `Gasto obra · ${desc}` : "Gasto obra",
          monto_real: importeGastoObraArs(g),
          fecha_real: String(g.fecha).slice(0, 10),
          origen: "gasto_obra" as const,
        };
      });

    const movimientos_recientes = [...libLines, ...gastoLines]
      .sort((a, b) => {
        if (b.fecha_real !== a.fecha_real) {
          return b.fecha_real.localeCompare(a.fecha_real);
        }
        return b.id.localeCompare(a.id);
      })
      .slice(0, 50);

    return NextResponse.json({
      fecha_referencia: hoy,
      saldo_caja_total: saldoGlob,
      total_por_cobrar_clientes_ars,
      totales_caja: {
        ingresos: ingresosGlob,
        egresos_libreta: egresosLibGlob,
        egresos_gastos_obra: gastosGlobalArs,
        egresos: egresosTotGlob,
        saldo: saldoGlob,
      },
      obras_activas: obrasActivas,
      libreta_empresa,
      movimientos_recientes,
      movimientos_anulados_recientes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
