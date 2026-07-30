import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  armarSuscripcionesIa,
  ratioSuscripcionApi,
  resumirApiUso,
  type FijoIaRow,
  type UsoApiRow,
} from "@/lib/ia-costos";

/**
 * Card "IA de RAVN" (pedido 29/07) — los dos lados del gasto de IA:
 *
 *  - suscripciones: `finanzas_fijos` con categoria='ia'. Se guardan en USD y
 *    flotan al blue venta (regla de las dos cajas).
 *  - api: `api_uso`, lo que el bot registró llamada a llamada este mes.
 *
 * Cada pata degrada sola: si se cae el dólar, los USD siguen; si se cae
 * api_uso, las suscripciones siguen. Nada se inventa — lo que falta va null y
 * la card lo muestra como hueco.
 *
 * OJO con el alcance: `api_uso` sólo tiene lo de Anthropic. Gemini
 * (transcripción de audios y renders) NO se registra ahí — se declara como
 * hueco en `cobertura`, no se estima.
 */

export const dynamic = "force-dynamic";

/** Hoy (YYYY-MM-DD) en hora Argentina — el corte del día es el de Eze. */
function hoyAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

/** Blue venta. Si la fuente falla, null: la card muestra sólo los dólares. */
async function blueVenta(): Promise<number | null> {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { venta?: number };
    const venta = Number(d?.venta) || 0;
    return venta > 0 ? venta : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const sb = createSupabaseAdminClient();
    const mesActual = hoyAR().slice(0, 7);
    // Inicio de mes en hora AR (UTC−3) para que el corte coincida con el de Eze.
    const desdeMes = `${mesActual}-01T00:00:00-03:00`;

    const [blue, fijosRes, usoRes] = await Promise.all([
      blueVenta(),
      sb
        .from("finanzas_fijos")
        .select("id, nombre, moneda, monto_usd, monto_ars, activo, categoria")
        .eq("categoria", "ia")
        .eq("activo", true),
      sb
        .from("api_uso")
        .select("creado_at, servicio, costo_usd")
        .gte("creado_at", desdeMes)
        .limit(20000),
    ]);

    if (fijosRes.error) {
      return NextResponse.json({ error: fijosRes.error.message }, { status: 500 });
    }

    const fijos: FijoIaRow[] = (fijosRes.data ?? []).map((f) => ({
      id: String(f.id),
      nombre: String(f.nombre ?? ""),
      moneda: String(f.moneda ?? "ARS"),
      monto_usd: f.monto_usd == null ? null : Number(f.monto_usd),
      monto_ars: Number(f.monto_ars) || 0,
      activo: f.activo !== false,
      categoria: f.categoria == null ? null : String(f.categoria),
    }));

    const suscripciones = armarSuscripcionesIa(fijos, blue);

    const fmtAR = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const api = usoRes.error
      ? null
      : resumirApiUso((usoRes.data ?? []) as UsoApiRow[], hoyAR(), (iso) =>
          fmtAR.format(new Date(iso))
        );

    const payload = NextResponse.json({
      blue_venta: blue,
      suscripciones,
      api,
      ratio: api ? ratioSuscripcionApi(suscripciones.total_usd, api.mes_usd) : null,
      // Qué mide de verdad el lado "API": hoy sólo Anthropic, vía el bot.
      cobertura: {
        api_registrada: ["Anthropic (bot)"],
        api_sin_registrar: ["Gemini (transcripción y renders)"],
      },
    });
    payload.headers.set(
      "Cache-Control",
      "private, max-age=60, stale-while-revalidate=300"
    );
    return payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
