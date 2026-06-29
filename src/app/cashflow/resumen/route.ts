import { NextResponse } from "next/server";
import { parseNum, todayBuenosAires, totalesReales } from "@/lib/cashflow-compute";
import { importeGastoObraArs } from "@/lib/cashflow-gastos-obra";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";
import {
  importeArsParaPropuesta,
  parsePropuestaPrefJsonDesdeMismaFila,
} from "@/lib/ravn-propuesta-pref";
import { parseRentabilidadInputsJson } from "@/lib/ravn-rentabilidad-inputs";
import { costoEstimadoArs, valuarObraUsd } from "@/lib/salud-negocio";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PresRow = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
  presupuesto_aprobado: boolean | null;
  propuesta_comercial_pref?: unknown;
  rentabilidad_inputs?: unknown;
  libreta_caja_empresa?: boolean | null;
  fecha?: string | null;
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
  moneda?: string | null;
  monto_usd?: string | number | null;
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
    moneda: row.moneda === "USD" ? ("USD" as const) : ("ARS" as const),
    monto_usd: row.monto_usd == null ? null : parseNum(row.monto_usd),
  };
}

/**
 * Totales de caja de una obra separando moneda: los pesos van a la caja en
 * pesos; los cobros en dólares se acumulan aparte (van a la caja en dólares,
 * valuados al blue del día en el tablero). Los egresos se asumen en pesos.
 */
function totalesObra(
  items: {
    tipo: "ingreso" | "egreso";
    monto_real: number | null;
    moneda: "ARS" | "USD";
    monto_usd: number | null;
  }[]
): { ingresosArs: number; ingresosUsd: number; egresosArs: number } {
  let ingArs = 0;
  let ingUsd = 0;
  let egr = 0;
  for (const it of items) {
    if (it.tipo === "ingreso") {
      if (it.moneda === "USD") ingUsd += parseNum(it.monto_usd);
      else if (it.monto_real != null) ingArs += it.monto_real;
    } else if (it.monto_real != null) {
      egr += it.monto_real;
    }
  }
  return {
    ingresosArs: roundArs2(ingArs),
    ingresosUsd: roundArs2(ingUsd),
    egresosArs: roundArs2(egr),
  };
}

async function fetchBlueVenta(): Promise<number | null> {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 600 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { venta?: number };
    const v = Number(j?.venta);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function esLibretaEmpresa(p: PresRow | null): boolean {
  return Boolean(p?.libreta_caja_empresa);
}

/**
 * Costo total estimado del presupuesto en pesos nominales: costo directo
 * (material + M.O.) + costos internos + cargos adicionales, leídos de
 * `rentabilidad_inputs`. Misma fórmula que control-gastos (sin contingencia: el
 * cupo de imprevistos es colchón = parte del margen salvo que se use). null si
 * no hay rentabilidad cargada o el costo no es usable (≤ 0).
 */
function costoNominalArsDeRentab(p: PresRow | null): number | null {
  if (!p?.id) return null;
  const ri = parseRentabilidadInputsJson(p.rentabilidad_inputs, p.id);
  if (!ri) return null;
  const costo = roundArs2(
    parseFormattedNumber(ri.costoMaterialStr) +
      parseFormattedNumber(ri.costoMoStr) +
      parseFormattedNumber(ri.costosInternosStr) +
      parseFormattedNumber(ri.cargosAdicionalesStr)
  );
  return costo > 0 ? costo : null;
}

/**
 * Cotización (ARS por 1 USD) a la que se dolarizó la obra, para floatear el
 * costo al mismo blue que el contrato. Prioriza la cotización manual fijada en
 * Rentabilidad; si no, la de la propuesta comercial. null si no hay ninguna.
 */
function cotizacionDolarizacionObra(p: PresRow | null): number | null {
  if (!p?.id) return null;
  const ri = parseRentabilidadInputsJson(p.rentabilidad_inputs, p.id);
  if (ri) {
    const manual = parseFormattedNumber(ri.cotizacionManualStr);
    if (manual > 0) return manual;
  }
  const pref = parsePropuestaPrefJsonDesdeMismaFila(
    p.propuesta_comercial_pref,
    p.id
  );
  if (pref && pref.cotizacionVentaArsPorUsd > 0) {
    return pref.cotizacionVentaArsPorUsd;
  }
  return null;
}

type ObraRow = {
  id: string;
  presupuesto_id: string;
  cobranza_cerrada_at?: string | null;
  finalizada_at?: string | null;
  monto_total_a_cobrar_ars?: string | number | null;
  monto_total_a_cobrar_usd?: string | number | null;
  foto_portada_path?: string | null;
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
    const supabase = createSupabaseAdminClient();
    const hoy = todayBuenosAires();
    // Blue venta del día para valuar obras en dólares (en paralelo con la DB).
    const bluePromise = fetchBlueVenta();

    // Las tres operaciones son independientes — las lanzamos en paralelo.
    const [, itemsResult, obrasResult] = await Promise.all([
      supabase
        .from("cashflow_items")
        .update({ estado: "vencido" })
        .eq("tipo", "ingreso")
        .eq("estado", "pendiente")
        .is("monto_real", null)
        .is("fecha_real", null)
        .is("deleted_at", null)
        .lt("fecha_proyectada", hoy),

      supabase
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
          moneda,
          monto_usd,
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
        .is("deleted_at", null),

      supabase.from("obras").select(`
          id,
          presupuesto_id,
          cobranza_cerrada_at,
          finalizada_at,
          monto_total_a_cobrar_ars,
          monto_total_a_cobrar_usd,
          foto_portada_path,
          presupuestos (
            id,
            nombre_obra,
            nombre_cliente,
            presupuesto_aprobado,
            propuesta_comercial_pref,
            rentabilidad_inputs,
            libreta_caja_empresa,
            fecha
          )
        `),
    ]);

    const { data, error } = itemsResult;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as JoinedRow[];

    const { data: obrasData, error: errObras } = obrasResult;
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
    const obraIdsSaldoArr = [...saldoObraIds];

    // RT2: presupuestos_gastos y anulados_recientes son independientes entre sí
    // (ambos solo necesitan datos de RT1). Antes eran secuenciales (+~350ms).
    // Los lanzamos en paralelo — elimina un round-trip completo del critical path.
    const [gastosResult, anuladosResult] = await Promise.all([
      presIdsAll.length > 0
        ? supabase
            .from("presupuestos_gastos")
            .select("id, presupuesto_id, fecha, descripcion, importe")
            .in("presupuesto_id", presIdsAll)
        : Promise.resolve({ data: [] as GastoDb[], error: null }),
      obraIdsSaldoArr.length > 0
        ? supabase
            .from("cashflow_items")
            .select(
              "id, obra_id, tipo, descripcion, monto_real, fecha_real, deleted_at"
            )
            .in("obra_id", obraIdsSaldoArr)
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false })
            .limit(25)
        : Promise.resolve({
            data: [] as {
              id: string;
              obra_id: string;
              tipo: string;
              descripcion: string | null;
              monto_real: unknown;
              fecha_real: string | null;
              deleted_at: string;
            }[],
            error: null,
          }),
    ]);

    let gastosRows: GastoDb[] = [];
    if (!gastosResult.error && gastosResult.data) {
      gastosRows = gastosResult.data as unknown as GastoDb[];
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

    const blue = await bluePromise;

    const obrasActivas = obrasAprobadas.map((o) => {
      const p = unwrapPres(o.presupuestos);
      const nombre =
        (p?.nombre_obra?.trim() || p?.nombre_cliente?.trim() || "Sin nombre") ??
        "Obra";
      const sliceFull = rows
        .filter((row) => row.obra_id === o.id)
        .map(rowToItem);
      const t = totalesObra(sliceFull);

      const egGastos = gastosTotalPorObraId.get(o.id) ?? 0;
      const egLib = t.egresosArs;
      const egTotal = roundArs2(egLib + egGastos);

      const cobCerrada = Boolean(o.cobranza_cerrada_at);
      const montoUsdTotal = parseNum(o.monto_total_a_cobrar_usd);
      const esUsd = montoUsdTotal > 0 || t.ingresosUsd > 0;

      let ingresosArs: number;
      let referencia_propuesta_ars: number | null;
      let pendiente_ingreso_referencia_ars: number | null;
      let monto_total_a_cobrar_ars_resp: number | null;
      let saldo_por_cobrar_ars: number | null = null;

      if (esUsd && blue) {
        // Obra en dólares: contrato y cobrado valuados al blue del día (flotan).
        // Los USD cobrados NO entran a la caja en pesos (van a la caja USD).
        const v = valuarObraUsd({
          contratoUsd: montoUsdTotal,
          cobradoUsd: t.ingresosUsd,
          cobradoArs: t.ingresosArs,
          blue,
        });
        ingresosArs = v.cobradoArs;
        referencia_propuesta_ars = null;
        pendiente_ingreso_referencia_ars = null;
        monto_total_a_cobrar_ars_resp = v.cerradoArs > 0 ? v.cerradoArs : null;
        saldo_por_cobrar_ars = v.cerradoArs > 0 ? v.porCobrarArs : null;
      } else {
        // Obra en pesos: lógica original.
        ingresosArs = t.ingresosArs;
        const pref =
          p?.id != null
            ? parsePropuestaPrefJsonDesdeMismaFila(
                p.propuesta_comercial_pref,
                p.id
              )
            : null;
        referencia_propuesta_ars = pref ? importeArsParaPropuesta(pref) : null;
        pendiente_ingreso_referencia_ars =
          referencia_propuesta_ars != null
            ? roundArs2(referencia_propuesta_ars - ingresosArs)
            : null;
        const montoCobrarSnap = parseNum(o.monto_total_a_cobrar_ars);
        monto_total_a_cobrar_ars_resp =
          montoCobrarSnap > 0 ? montoCobrarSnap : null;
        if (cobCerrada && montoCobrarSnap > 0) {
          saldo_por_cobrar_ars = roundArs2(
            Math.max(0, montoCobrarSnap - ingresosArs)
          );
        } else if (pendiente_ingreso_referencia_ars != null) {
          saldo_por_cobrar_ars = pendiente_ingreso_referencia_ars;
        }
      }

      const saldoObra = roundArs2(ingresosArs - egTotal);

      // Costo total estimado del presupuesto, coherente con la moneda del
      // "cerrado": para obras USD se floatea al MISMO blue que el contrato (así
      // el margen proyectado es el que se fijó al vender en dólares).
      const valuadoUsd = esUsd && Boolean(blue);
      const costo_total_estimado_ars = costoEstimadoArs({
        costoNominalArs: costoNominalArsDeRentab(p) ?? 0,
        esUsd: valuadoUsd,
        cotizacionPricingArsPorUsd: valuadoUsd
          ? cotizacionDolarizacionObra(p)
          : null,
        blue,
      });

      return {
        obra_id: o.id,
        presupuesto_id: o.presupuesto_id,
        nombre_obra: nombre,
        // Expuestos para evitar un segundo fetch desde el cliente.
        nombre_cliente: p?.nombre_cliente?.trim() ?? null,
        fecha_presupuesto: p?.fecha ? String(p.fecha).slice(0, 10) : null,
        // ingresos_caja = cobrado (en pesos; para obras USD, valuado al blue).
        ingresos_caja: ingresosArs,
        ingresos_caja_usd: t.ingresosUsd,
        moneda: esUsd ? ("USD" as const) : ("ARS" as const),
        egresos_libreta_ars: egLib,
        egresos_gastos_obra_ars: egGastos,
        egresos_caja: egTotal,
        saldo_caja: saldoObra,
        referencia_propuesta_ars,
        pendiente_ingreso_referencia_ars,
        saldo_por_cobrar_ars,
        // Contrato (cerrado): snapshot ARS para obras en pesos; valuado al blue
        // para obras en dólares. El módulo Salud lo usa como "cerrado".
        monto_total_a_cobrar_ars: monto_total_a_cobrar_ars_resp,
        monto_total_a_cobrar_usd: montoUsdTotal > 0 ? montoUsdTotal : null,
        cobranza_cerrada: cobCerrada,
        finalizada: Boolean(o.finalizada_at),
        // Margen al día (spec §4.2): propuesta − gastado real acumulado.
        margen_al_dia_ars:
          referencia_propuesta_ars != null
            ? roundArs2(referencia_propuesta_ars - egTotal)
            : null,
        // Costo total estimado (ARS, valuado al blue si la obra es USD): el
        // módulo Salud lo usa para el rédito proyectado real.
        costo_total_estimado_ars,
        // Portada del proyecto (rediseño /obras): path en bucket privado; la
        // signed URL se completa abajo (foto_portada_url).
        foto_portada_path: o.foto_portada_path ?? null,
        foto_portada_url: null as string | null,
      };
    });
    obrasActivas.sort((a, b) =>
      a.nombre_obra.localeCompare(b.nombre_obra, "es")
    );

    // Firma server-side de las portadas (bucket privado obra-archivos). Batch
    // con createSignedUrls; TTL corto (la card se revalida con el resumen).
    const portadaPaths = obrasActivas
      .map((o) => o.foto_portada_path)
      .filter((p): p is string => Boolean(p));
    if (portadaPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from("obra-archivos")
        .createSignedUrls(portadaPaths, 60 * 30);
      const urlPorPath = new Map<string, string>();
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlPorPath.set(s.path, s.signedUrl);
      }
      for (const o of obrasActivas) {
        if (o.foto_portada_path) {
          o.foto_portada_url = urlPorPath.get(o.foto_portada_path) ?? null;
        }
      }
    }

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
    const totGlob = totalesObra(sliceSaldo);

    let gastosGlobalArs = 0;
    for (const g of gastosRows) {
      const oid = obraIdPorPresupuestoId.get(g.presupuesto_id);
      if (!oid || !saldoObraIds.has(oid)) continue;
      gastosGlobalArs = roundArs2(gastosGlobalArs + importeGastoObraArs(g));
    }
    // Caja en PESOS: solo cobros en pesos. Los cobros en dólares van aparte.
    const ingresosGlob = totGlob.ingresosArs;
    const cajaObrasUsd = totGlob.ingresosUsd; // caja en dólares de las obras
    const egresosLibGlob = totGlob.egresosArs;
    const egresosTotGlob = roundArs2(egresosLibGlob + gastosGlobalArs);
    const saldoGlob = roundArs2(ingresosGlob - egresosTotGlob);

    // ── Centro de Mando (spec §4.3): cashflow del mes + gastos de obra de hoy ──
    // Mismas obras que el saldo global (saldoObraIds). Fecha de un item de
    // libreta = fecha_real ?? fecha_proyectada (igual que movimientos_recientes).
    const mesActual = hoy.slice(0, 7); // YYYY-MM
    let ingresosMes = 0;
    let egresosLibMes = 0;
    let egresosLibHoy = 0;
    for (const it of sliceSaldo) {
      if (it.monto_real == null) continue;
      const f = it.fecha_real ?? it.fecha_proyectada;
      if (it.tipo === "ingreso") {
        // Los cobros en dólares no son caja en pesos del mes.
        if (it.moneda === "USD") continue;
        if (f.startsWith(mesActual)) ingresosMes = roundArs2(ingresosMes + it.monto_real);
      } else {
        if (f.startsWith(mesActual)) egresosLibMes = roundArs2(egresosLibMes + it.monto_real);
        if (f === hoy) egresosLibHoy = roundArs2(egresosLibHoy + it.monto_real);
      }
    }
    let gastosObraMes = 0;
    let gastosObraHoy = 0;
    for (const g of gastosRows) {
      const oid = obraIdPorPresupuestoId.get(g.presupuesto_id);
      if (!oid || !saldoObraIds.has(oid)) continue;
      const f = String(g.fecha).slice(0, 10);
      const add = importeGastoObraArs(g);
      if (f.startsWith(mesActual)) gastosObraMes = roundArs2(gastosObraMes + add);
      if (f === hoy) gastosObraHoy = roundArs2(gastosObraHoy + add);
    }
    const egresosMes = roundArs2(egresosLibMes + gastosObraMes);

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
    // anuladosResult ya se resolvió en el Promise.all de RT2 de arriba.
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
    if (!anuladosResult.error && anuladosResult.data) {
      movimientos_anulados_recientes = (
        anuladosResult.data as {
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

    const payload = NextResponse.json({
      fecha_referencia: hoy,
      saldo_caja_total: saldoGlob,
      // Caja en dólares de las obras (cobros en USD), separada de los pesos.
      caja_obras_usd: cajaObrasUsd,
      blue_venta: blue,
      total_por_cobrar_clientes_ars,
      totales_caja: {
        ingresos: ingresosGlob,
        egresos_libreta: egresosLibGlob,
        egresos_gastos_obra: gastosGlobalArs,
        egresos: egresosTotGlob,
        saldo: saldoGlob,
      },
      caja_mes: {
        mes: mesActual,
        ingresos: ingresosMes,
        egresos: egresosMes,
        saldo: roundArs2(ingresosMes - egresosMes),
      },
      gastos_obra_hoy_ars: roundArs2(egresosLibHoy + gastosObraHoy),
      obras_activas: obrasActivas,
      libreta_empresa,
      movimientos_recientes,
      movimientos_anulados_recientes,
    });
    // El middleware exige sesión, así que este endpoint nunca llega a CDN pública.
    // private + stale-while-revalidate hace que el browser sirva caché al instante
    // mientras revalida en background — elimina el "Cargando…" en navegaciones repetidas.
    payload.headers.set(
      "Cache-Control",
      "private, max-age=15, stale-while-revalidate=60"
    );
    return payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
