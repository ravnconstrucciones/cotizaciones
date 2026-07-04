import { NextResponse } from "next/server";
import { nombreReservaObra } from "@/lib/cuentas";
import { roundArs2 } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * RESERVA MP POR OBRA (04/07) — cuenta espejo "MP · Reserva Obra X".
 *
 * Cuando entra un ingreso de obra por Mercado Pago, Eze hace la reserva REAL
 * adentro de MP; este endpoint la espeja en el sistema: crea (si no existe)
 * la cuenta de reserva de la obra (procedencia=obra, ARS, saldo 0) y, si
 * viene `monto`, registra la transferencia Mercado Pago → reserva. El saldo
 * de la reserva queda derivado como el de cualquier cuenta, y los gastos de
 * esa obra la ofrecen como origen por defecto.
 *
 * POST { obra_id, monto? } → { ok, cuenta: { id, nombre }, transferencia_id? }
 *
 * Service_role (bypass RLS), detrás del middleware de sesión.
 */

function hoyAR(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  const d = p.find((x) => x.type === "day")?.value;
  return y && m && d ? `${y}-${m}-${d}` : new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { obra_id?: string; monto?: number };
    const obraId = String(body.obra_id ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obraId)) {
      return NextResponse.json({ error: "obra_id inválido." }, { status: 400 });
    }
    const monto = roundArs2(Number(body.monto ?? 0));
    if (!Number.isFinite(monto) || monto < 0) {
      return NextResponse.json({ error: "monto inválido." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: obra, error: eObra } = await supabase
      .from("obras")
      .select("id, presupuestos(nombre_obra, nombre_cliente)")
      .eq("id", obraId)
      .maybeSingle();
    if (eObra || !obra) {
      return NextResponse.json(
        { error: eObra?.message ?? "Obra no encontrada." },
        { status: 404 }
      );
    }
    // Supabase tipa el join to-one como array; se normalizan las dos formas.
    const presRaw = (obra as { presupuestos: unknown }).presupuestos;
    const pres = (Array.isArray(presRaw) ? presRaw[0] : presRaw) as {
      nombre_obra: string | null;
      nombre_cliente: string | null;
    } | null;
    const nombreObra = pres?.nombre_obra || pres?.nombre_cliente || "sin nombre";

    // Cuenta de reserva de la obra: una sola (índice único por obra_id).
    // Si existe pero quedó inactiva, se reactiva en vez de duplicar.
    const { data: existente, error: eExist } = await supabase
      .from("cuentas")
      .select("id, nombre, activa")
      .eq("obra_id", obraId)
      .maybeSingle();
    if (eExist) {
      return NextResponse.json({ error: eExist.message }, { status: 500 });
    }

    let cuenta = existente as { id: string; nombre: string; activa: boolean } | null;
    if (cuenta && !cuenta.activa) {
      const { error: eAct } = await supabase
        .from("cuentas")
        .update({ activa: true })
        .eq("id", cuenta.id);
      if (eAct) {
        return NextResponse.json({ error: eAct.message }, { status: 500 });
      }
    }
    if (!cuenta) {
      const { data: maxOrden } = await supabase
        .from("cuentas")
        .select("orden")
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: nueva, error: eIns } = await supabase
        .from("cuentas")
        .insert({
          nombre: nombreReservaObra(nombreObra),
          moneda: "ARS",
          saldo_inicial: 0,
          fecha_saldo_inicial: hoyAR(),
          procedencia: "obra",
          activa: true,
          orden: ((maxOrden as { orden: number } | null)?.orden ?? 0) + 1,
          obra_id: obraId,
          notas:
            "Espejo de la reserva real dentro de Mercado Pago. La plata sigue en MP; esta cuenta marca cuánto está apartado para la obra.",
        })
        .select("id, nombre, activa")
        .single();
      if (eIns || !nueva) {
        return NextResponse.json(
          { error: eIns?.message ?? "No se pudo crear la cuenta de reserva." },
          { status: 500 }
        );
      }
      cuenta = nueva as { id: string; nombre: string; activa: boolean };
    }

    // Espejo del movimiento: transferencia Mercado Pago → reserva (solo si
    // vino monto). La cuenta MP es la general (sin obra_id).
    let transferenciaId: string | null = null;
    if (monto > 0) {
      const { data: mp, error: eMp } = await supabase
        .from("cuentas")
        .select("id")
        .ilike("nombre", "mercado pago")
        .is("obra_id", null)
        .eq("activa", true)
        .maybeSingle();
      if (eMp || !mp) {
        return NextResponse.json(
          { error: eMp?.message ?? "No encontré la cuenta Mercado Pago." },
          { status: 500 }
        );
      }
      const { data: tr, error: eTr } = await supabase
        .from("transferencias")
        .insert({
          fecha: hoyAR(),
          concepto: `Reserva MP · ${nombreObra}`,
          cuenta_origen_id: (mp as { id: string }).id,
          cuenta_destino_id: cuenta.id,
          monto_origen: monto,
          monto_destino: monto,
        })
        .select("id")
        .single();
      if (eTr || !tr) {
        return NextResponse.json(
          { error: eTr?.message ?? "No se pudo registrar la reserva." },
          { status: 500 }
        );
      }
      transferenciaId = (tr as { id: string }).id;
    }

    return NextResponse.json({
      ok: true,
      cuenta: { id: cuenta.id, nombre: cuenta.nombre },
      transferencia_id: transferenciaId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
