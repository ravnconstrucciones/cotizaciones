import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  calcularCiclo,
  calcularFinanzas,
  fraseDelDia,
  type FechaYMD,
  type FijoRow,
  type GastoVariable,
} from "@/lib/finanzas-personal";

/**
 * Finanzas Personales — endpoint LEAN para el bot de WhatsApp.
 *
 * "¿cuánto puedo gastar hoy?" → el bot hace GET acá y redacta. El motor queda
 * en un solo lugar (el app), sin replicar la fórmula en el bot (evita drift).
 *
 * Devuelve { disponible_hoy, asignacion_diaria, semaforo, frase }.
 */

const TOPE_DEFAULT = 2_800_000;
const DIA_CIERRE_DEFAULT = 25;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

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

    const [cfgRes, fijosRes] = await Promise.all([
      sb.from("finanzas_personal_config").select("*").eq("id", 1).maybeSingle(),
      sb
        .from("finanzas_fijos")
        .select("id, nombre, monto_ars, dueno, activo, orden"),
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

    const ciclo = calcularCiclo(hoy, diaCierre);
    const { data: gastosData, error: gastosErr } = await sb
      .from("gastos_personales")
      .select("id, fecha, concepto, monto, categoria")
      .gte("fecha", ciclo.inicio)
      .lte("fecha", ciclo.fin);

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

    const r = calcularFinanzas({
      topePersonalMensual,
      diaCierre,
      hoy,
      fijos,
      gastosVariables,
    });

    return NextResponse.json({
      disponible_hoy: r.disponible_hoy,
      disponible_ciclo: r.disponible_ciclo,
      asignacion_diaria: r.asignacion_diaria,
      semaforo: r.semaforo,
      frase: fraseDelDia(r.disponible_hoy, r.disponible_ciclo, r.semaforo),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
