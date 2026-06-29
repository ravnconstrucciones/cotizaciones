import { NextResponse } from "next/server";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Finanzas Personales — ABM de costos fijos (`finanzas_fijos`).
 *
 * GET    → lista completa, ordenada por (dueno, orden).
 * POST   → upsert: si viene `id` actualiza, si no inserta. Valida dueno y monto.
 * DELETE → borra por id.
 *
 * dueno='personal' resta del discrecional; dueno='empresa' (software/IA) es
 * informativo etiquetado, no entra a ningún cálculo personal.
 */

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb
      .from("finanzas_fijos")
      .select("id, nombre, monto_ars, dueno, activo, orden, created_at")
      .order("dueno", { ascending: true })
      .order("orden", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      fijos: (data ?? []).map((f) => ({
        id: String(f.id),
        nombre: String(f.nombre ?? ""),
        monto_ars: num(f.monto_ars),
        dueno: String(f.dueno ?? "personal"),
        activo: f.activo !== false,
        orden: Number(f.orden ?? 0),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const dueno = String(body.dueno ?? "personal");
    if (dueno !== "personal" && dueno !== "empresa") {
      return NextResponse.json(
        { error: "dueno debe ser 'personal' o 'empresa'." },
        { status: 400 }
      );
    }

    const monto = num(body.monto_ars);
    if (monto < 0) {
      return NextResponse.json(
        { error: "El monto no puede ser negativo." },
        { status: 400 }
      );
    }

    const nombre = String(body.nombre ?? "").trim();
    const sb = createSupabaseAdminClient();

    if (body.id) {
      // Update parcial: solo los campos presentes en el body.
      const patch: Record<string, number | string | boolean> = {};
      if ("nombre" in body) {
        if (!nombre) {
          return NextResponse.json(
            { error: "El nombre no puede quedar vacío." },
            { status: 400 }
          );
        }
        patch.nombre = nombre;
      }
      if ("monto_ars" in body) patch.monto_ars = roundArs2(monto);
      if ("dueno" in body) patch.dueno = dueno;
      if ("activo" in body) patch.activo = body.activo !== false;
      if ("orden" in body) patch.orden = Math.round(num(body.orden));

      if (Object.keys(patch).length === 0) {
        return NextResponse.json(
          { error: "Nada para actualizar." },
          { status: 400 }
        );
      }

      const { error } = await sb
        .from("finanzas_fijos")
        .update(patch)
        .eq("id", String(body.id));
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // Insert nuevo.
    if (!nombre) {
      return NextResponse.json(
        { error: "El nombre es requerido." },
        { status: 400 }
      );
    }
    const { data, error } = await sb
      .from("finanzas_fijos")
      .insert({
        nombre,
        monto_ars: roundArs2(monto),
        dueno,
        activo: body.activo === undefined ? true : body.activo !== false,
        orden: Math.round(num(body.orden)),
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    const sb = createSupabaseAdminClient();
    const { error } = await sb.from("finanzas_fijos").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
