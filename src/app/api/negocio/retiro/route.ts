import { NextResponse } from "next/server";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Registra un RETIRO (Eze saca plata de la empresa) o un APORTE (Eze pone).
 * Es lo que alimenta "total retirado en el mes" del tablero — el control de
 * que Eze no se pase del sueldo objetivo y no se le mezcle la plata.
 */

type Body = {
  monto_ars?: number | string;
  tipo?: string;
  concepto?: string;
  fecha?: string;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const monto = roundArs2(num(body.monto_ars));
    if (monto <= 0) {
      return NextResponse.json(
        { error: "El monto tiene que ser mayor a 0." },
        { status: 400 }
      );
    }
    const tipo = body.tipo === "aporte" ? "aporte" : "retiro";
    const concepto = (body.concepto ?? "").trim().slice(0, 300) || null;
    const fecha = body.fecha
      ? String(body.fecha).slice(0, 10)
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Argentina/Buenos_Aires",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("retiros_socio")
      .insert({ monto_ars: monto, tipo, concepto, fecha })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: (data as { id: string }).id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
