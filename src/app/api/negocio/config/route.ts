import { NextResponse } from "next/server";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Sistema de plata RAVN — config del negocio + retiros del socio (Eze).
 *
 * Separa la plata de la EMPRESA de la plata de EZE: patrimonio neto base,
 * sueldo mensual objetivo (Eze se cobra como un sueldo, previsible) y la
 * alícuota con la que se reparte el rédito de cada obra (reserva impositiva /
 * reinversión / sueldo). Todo configurable — los números los fija Eze.
 *
 * GET  → config + resumen de retiros del mes (total retirado vs sueldo).
 * POST → actualiza la fila única de config (id=1).
 *
 * Service_role (bypass RLS), detrás del middleware de sesión. Tablas con RLS
 * deny-by-default (sin policies): solo este handler las toca.
 */

const COL_NUM = new Set([
  "patrimonio_neto_inicial_ars",
  "patrimonio_neto_inicial_usd",
  "sueldo_mensual_objetivo_ars",
  "costos_fijos_mensuales_ars",
  "comprometido_obras_ars",
  "colchon_meses_sueldo",
]);

type ConfigRow = {
  id: number;
  patrimonio_neto_inicial_ars: string | number;
  patrimonio_neto_inicial_usd: string | number;
  fecha_patrimonio: string | null;
  sueldo_mensual_objetivo_ars: string | number;
  costos_fijos_mensuales_ars: string | number;
  comprometido_obras_ars: string | number;
  colchon_meses_sueldo: string | number;
  notas: string | null;
  updated_at: string;
};

type RetiroRow = {
  id: string;
  fecha: string;
  monto_ars: string | number;
  moneda: string | null;
  tipo: string;
  concepto: string | null;
};

/** Un solo dueño (08/07): todo gasto personal es plata de RAVN que se lleva
 * Eze — desde la foto del ledger cuenta como retiro (una carga, dos
 * lecturas). Va aparte de retiros_socio: NO entra en neto_total, que
 * cajaEmpresaPesos descuenta del saldo de la libreta de obras. */
const FOTO_UN_SOLO_DUENO = "2026-07-07";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function mesActualBA(): string {
  // YYYY-MM en horario Buenos Aires.
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return f; // "YYYY-MM"
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [cfgRes, retsRes, gastosPersRes] = await Promise.all([
      supabase.from("negocio_config").select("*").eq("id", 1).maybeSingle(),
      supabase
        .from("retiros_socio")
        .select("id, fecha, monto_ars, moneda, tipo, concepto")
        .order("fecha", { ascending: false })
        .limit(120),
      supabase
        .from("gastos_personales")
        .select("fecha, monto")
        .gte("fecha", FOTO_UN_SOLO_DUENO),
    ]);

    if (cfgRes.error) {
      return NextResponse.json({ error: cfgRes.error.message }, { status: 500 });
    }

    const c = (cfgRes.data ?? null) as ConfigRow | null;
    const config = {
      patrimonio_neto_inicial_ars: num(c?.patrimonio_neto_inicial_ars),
      patrimonio_neto_inicial_usd: num(c?.patrimonio_neto_inicial_usd),
      fecha_patrimonio: c?.fecha_patrimonio ?? null,
      sueldo_mensual_objetivo_ars: num(c?.sueldo_mensual_objetivo_ars),
      costos_fijos_mensuales_ars: num(c?.costos_fijos_mensuales_ars),
      comprometido_obras_ars: num(c?.comprometido_obras_ars),
      colchon_meses_sueldo: num(c?.colchon_meses_sueldo ?? 1),
      notas: c?.notas ?? null,
      updated_at: c?.updated_at ?? null,
      configurado: num(c?.patrimonio_neto_inicial_ars) > 0,
    };

    const rets = (retsRes.data ?? []) as RetiroRow[];
    const mes = mesActualBA();
    let retiradoMes = 0;
    let aportadoMes = 0;
    let retiradoTotal = 0;
    let aportadoTotal = 0;
    let retiradoTotalUsd = 0; // los USD van aparte, jamás sumados a pesos
    for (const r of rets) {
      const m = num(r.monto_ars);
      const enMes = String(r.fecha).slice(0, 7) === mes;
      if (r.moneda === "USD") {
        retiradoTotalUsd = roundArs2(retiradoTotalUsd + (r.tipo === "aporte" ? -m : m));
        continue;
      }
      if (r.tipo === "aporte") {
        aportadoTotal = roundArs2(aportadoTotal + m);
        if (enMes) aportadoMes = roundArs2(aportadoMes + m);
      } else {
        retiradoTotal = roundArs2(retiradoTotal + m);
        if (enMes) retiradoMes = roundArs2(retiradoMes + m);
      }
    }

    // Gastos personales desde la foto: la otra lectura del retiro.
    let gastoPersonalMes = 0;
    let gastoPersonalTotal = 0;
    for (const g of gastosPersRes.data ?? []) {
      const m = num(g.monto);
      gastoPersonalTotal = roundArs2(gastoPersonalTotal + m);
      if (String(g.fecha).slice(0, 7) === mes) gastoPersonalMes = roundArs2(gastoPersonalMes + m);
    }

    const payload = NextResponse.json({
      config,
      retiros: {
        mes,
        retirado_mes: retiradoMes,
        aportado_mes: aportadoMes,
        neto_mes: roundArs2(retiradoMes - aportadoMes),
        retirado_total: retiradoTotal,
        aportado_total: aportadoTotal,
        neto_total: roundArs2(retiradoTotal - aportadoTotal),
        retirado_total_usd: retiradoTotalUsd,
        // Un solo dueño: gastos personales desde la foto (07/07) — la otra
        // lectura del retiro. Se muestran junto a los retiros pero NO entran
        // en neto_total (la caja de la libreta no los vio salir).
        gasto_personal_mes: gastoPersonalMes,
        gasto_personal_total: gastoPersonalTotal,
        ultimos: rets.slice(0, 8).map((r) => ({
          id: r.id,
          fecha: String(r.fecha).slice(0, 10),
          monto_ars: num(r.monto_ars),
          moneda: r.moneda === "USD" ? "USD" : "ARS",
          tipo: r.tipo === "aporte" ? "aporte" : "retiro",
          concepto: r.concepto ?? "",
        })),
      },
    });
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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, number | string | null> = {};

    for (const [k, v] of Object.entries(body)) {
      if (COL_NUM.has(k)) {
        const n = num(v);
        if (n < 0) continue;
        patch[k] = roundArs2(n);
      } else if (k === "fecha_patrimonio") {
        patch[k] = v ? String(v).slice(0, 10) : null;
      } else if (k === "notas") {
        patch[k] = v == null ? null : String(v).slice(0, 1000);
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nada para actualizar." },
        { status: 400 }
      );
    }
    patch.updated_at = new Date().toISOString();

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("negocio_config")
      .update(patch)
      .eq("id", 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
