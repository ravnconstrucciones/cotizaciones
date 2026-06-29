import { NextResponse } from "next/server";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Finanzas Personales — config (fila única, id=1).
 *
 * GET  → tope personal mensual + día de cierre de la tarjeta + notas.
 * POST → actualiza la fila id=1. Valida numéricos ≥ 0 y dia_cierre 1..28.
 *
 * Service_role (bypass RLS), detrás del middleware de sesión. Patrón de
 * `negocio/config`.
 */

const TOPE_DEFAULT = 2_800_000;
const DIA_CIERRE_DEFAULT = 25;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb
      .from("finanzas_personal_config")
      .select("tope_personal_mensual_ars, dia_cierre, notas")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      tope_personal_mensual_ars: data
        ? num(data.tope_personal_mensual_ars)
        : TOPE_DEFAULT,
      dia_cierre: data?.dia_cierre ?? DIA_CIERRE_DEFAULT,
      notas: data?.notas ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, number | string | null> = {};

    if ("tope_personal_mensual_ars" in body) {
      const n = num(body.tope_personal_mensual_ars);
      if (n < 0) {
        return NextResponse.json(
          { error: "El tope no puede ser negativo." },
          { status: 400 }
        );
      }
      patch.tope_personal_mensual_ars = roundArs2(n);
    }

    if ("dia_cierre" in body) {
      const d = Math.round(num(body.dia_cierre));
      if (d < 1 || d > 28) {
        return NextResponse.json(
          { error: "El día de cierre debe estar entre 1 y 28." },
          { status: 400 }
        );
      }
      patch.dia_cierre = d;
    }

    if ("notas" in body) {
      patch.notas =
        body.notas == null ? null : String(body.notas).slice(0, 1000);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "Nada para actualizar." },
        { status: 400 }
      );
    }
    patch.updated_at = new Date().toISOString();

    const sb = createSupabaseAdminClient();
    // upsert (no update) para que sea defensivo: si la fila id=1 no existiera,
    // el update afectaría 0 filas y devolvería ok en falso. Con upsert el tope
    // siempre persiste.
    const { error } = await sb
      .from("finanzas_personal_config")
      .upsert({ id: 1, ...patch }, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
