import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  calcularCiclo,
  calcularFinanzas,
  type FechaYMD,
  type FijoRow,
  type GastoVariable,
} from "@/lib/finanzas-personal";

/**
 * Finanzas Personales — foto del presupuesto personal de Eze.
 *
 * GET    → corre el motor puro (`lib/finanzas-personal.ts`): config + fijos +
 *          gastos del CICLO de la tarjeta → disponible hoy, asignación diaria,
 *          semáforo, proyección, desglose variable, fijos y software etiquetado.
 * POST   → carga un gasto variable (gastos_personales). Se mantiene.
 * DELETE → borra un gasto variable por id. Se mantiene.
 *
 * Service_role (bypass RLS), detrás del middleware de sesión.
 */

const TOPE_DEFAULT = 2_800_000;
const DIA_CIERRE_DEFAULT = 25;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Hoy en zona BA, como {year, month, day} — el ciclo se calcula sobre esto. */
function hoyBA(): FechaYMD {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = s.split("-").map(Number);
  return { year, month, day };
}

export async function GET() {
  try {
    const sb = createSupabaseAdminClient();
    const hoy = hoyBA();

    // 1) Config + fijos en paralelo. La config define el día de cierre, que
    //    define el ciclo, que define qué gastos traer.
    const [cfgRes, fijosRes] = await Promise.all([
      sb.from("finanzas_personal_config").select("*").eq("id", 1).maybeSingle(),
      sb
        .from("finanzas_fijos")
        .select("id, nombre, monto_ars, dueno, activo, orden")
        .order("dueno", { ascending: true })
        .order("orden", { ascending: true }),
    ]);

    if (cfgRes.error) {
      return NextResponse.json({ error: cfgRes.error.message }, { status: 500 });
    }
    if (fijosRes.error) {
      return NextResponse.json({ error: fijosRes.error.message }, { status: 500 });
    }

    const cfg = cfgRes.data as
      | { tope_personal_mensual_ars: string | number; dia_cierre: number }
      | null;
    const topePersonalMensual = cfg
      ? num(cfg.tope_personal_mensual_ars)
      : TOPE_DEFAULT;
    const diaCierre = cfg?.dia_cierre ?? DIA_CIERRE_DEFAULT;

    const fijos: FijoRow[] = (fijosRes.data ?? []).map((f) => ({
      id: String(f.id),
      nombre: String(f.nombre ?? ""),
      monto_ars: num(f.monto_ars),
      dueno: String(f.dueno ?? "personal"),
      activo: f.activo !== false,
      orden: Number(f.orden ?? 0),
    }));

    // 2) Gastos variables del ciclo (rango inclusive). Se filtra de nuevo en el
    //    motor por si la query trajera bordes; la query acota el volumen.
    const ciclo = calcularCiclo(hoy, diaCierre);
    const { data: gastosData, error: gastosErr } = await sb
      .from("gastos_personales")
      .select("id, fecha, concepto, monto, categoria")
      .gte("fecha", ciclo.inicio)
      .lte("fecha", ciclo.fin)
      .order("created_at", { ascending: false });

    if (gastosErr) {
      return NextResponse.json({ error: gastosErr.message }, { status: 500 });
    }

    const gastosVariables: GastoVariable[] = (gastosData ?? []).map((g) => ({
      id: String(g.id),
      fecha: String(g.fecha).slice(0, 10),
      concepto: String(g.concepto ?? ""),
      monto: num(g.monto),
      categoria: String(g.categoria ?? "Varios"),
    }));

    const resumen = calcularFinanzas({
      topePersonalMensual,
      diaCierre,
      hoy,
      fijos,
      gastosVariables,
    });

    const payload = NextResponse.json(resumen);
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

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const body = await req.json();
  const { concepto, monto, categoria, fecha } = body;

  if (!concepto || !monto) {
    return NextResponse.json(
      { error: "concepto y monto requeridos" },
      { status: 400 }
    );
  }

  // Fecha por defecto en hora Argentina (no UTC): un gasto cargado de noche
  // debe caer en el día —y el ciclo— correcto, no en el de UTC (que ya pasó al
  // día siguiente desde las 21:00 BA).
  const { year, month, day } = hoyBA();
  const hoyIso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const { error } = await sb.from("gastos_personales").insert({
    concepto,
    monto: Number(monto),
    categoria: categoria || "Varios",
    fecha: fecha || hoyIso,
    origen: "app",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await sb.from("gastos_personales").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
