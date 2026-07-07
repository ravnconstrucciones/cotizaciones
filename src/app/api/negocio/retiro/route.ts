import { NextResponse } from "next/server";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sincronizarEspejo } from "@/lib/dinero-sync";

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
  cuenta_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // Cuenta de la que salió (retiro) o a la que entró (aporte) la plata.
    // Opcional: sin cuenta el retiro vale igual, queda "sin asignar".
    const cuentaId = UUID_RE.test(String(body.cuenta_id ?? ""))
      ? String(body.cuenta_id)
      : null;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("retiros_socio")
      .insert({ monto_ars: monto, tipo, concepto, fecha, cuenta_id: cuentaId })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const retiroId = (data as { id: string }).id;

    // Espejo Dinero (Fase 2): best-effort, jamás rompe la operación original.
    await sincronizarEspejo(supabase, "retiros_socio", retiroId).catch((e) =>
      console.error("[dinero espejo]", e)
    );

    return NextResponse.json({ ok: true, id: retiroId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
