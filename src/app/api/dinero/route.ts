import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Módulo DINERO — datos del tablero (Fase 3, spec 2026-07-06).
 *
 * GET → todo lo que consumen /dinero y la card de la home en un viaje:
 *  - bolsillos: vista dinero_saldos_bolsillos (saldo vivo por cuenta × dueño)
 *  - financiamientos: libro de deudas completo (abiertos + históricos)
 *  - borradores: patas del ledger sin confirmar (operaciones colgadas del bot)
 *  - obras: nombre de cada presupuesto referenciado (para etiquetar dueños)
 *  - costos_obra: Σ presupuestos_gastos por obra (composición del costo)
 *
 * Los saldos del motor actual salen de /api/cuentas (la pantalla compara
 * ambos para el "a conciliar"). Service_role detrás del middleware de sesión,
 * mismo patrón que /api/cuentas.
 */

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [bolsillosRes, financiamientosRes, borradoresRes, gastosRes] =
      await Promise.all([
        supabase
          .from("dinero_saldos_bolsillos")
          .select("cuenta_id, dueno_tipo, dueno_obra_id, moneda, saldo, movimientos"),
        supabase
          .from("financiamientos")
          .select(
            "id, deudor_tipo, deudor_obra_id, acreedor_tipo, acreedor_obra_id, monto_original, saldo_pendiente, moneda, estado, notas, created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("movimientos_plata")
          .select(
            "id, grupo_id, fecha, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, origen_tipo, descripcion, created_at"
          )
          .eq("estado", "borrador")
          .order("created_at", { ascending: false }),
        supabase
          .from("presupuestos_gastos")
          .select("presupuesto_id, importe"),
      ]);

    const firstError =
      bolsillosRes.error ??
      financiamientosRes.error ??
      borradoresRes.error ??
      gastosRes.error;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const bolsillos = bolsillosRes.data ?? [];
    const financiamientos = financiamientosRes.data ?? [];
    const borradores = borradoresRes.data ?? [];

    // Costo total por obra (los importes ya están en ARS por convención).
    const costos_obra: Record<string, number> = {};
    for (const g of gastosRes.data ?? []) {
      if (!g.presupuesto_id) continue;
      const n = typeof g.importe === "number" ? g.importe : parseFloat(String(g.importe ?? ""));
      if (!Number.isFinite(n)) continue;
      costos_obra[g.presupuesto_id] = (costos_obra[g.presupuesto_id] ?? 0) + n;
    }

    // Nombres de TODAS las obras referenciadas por bolsillos/deudas/borradores.
    const obraIds = new Set<string>();
    for (const b of bolsillos) if (b.dueno_obra_id) obraIds.add(b.dueno_obra_id);
    for (const f of financiamientos) {
      if (f.deudor_obra_id) obraIds.add(f.deudor_obra_id);
      if (f.acreedor_obra_id) obraIds.add(f.acreedor_obra_id);
    }
    for (const b of borradores) if (b.dueno_obra_id) obraIds.add(b.dueno_obra_id);

    const obras: Record<string, string> = {};
    if (obraIds.size) {
      const { data: presupuestos, error: eObras } = await supabase
        .from("presupuestos")
        .select("id, nombre_obra, nombre_cliente")
        .in("id", [...obraIds]);
      if (eObras) {
        return NextResponse.json({ error: eObras.message }, { status: 500 });
      }
      for (const p of presupuestos ?? []) {
        obras[p.id] = p.nombre_obra || p.nombre_cliente || "Obra sin nombre";
      }
    }

    const payload = NextResponse.json({
      bolsillos,
      financiamientos,
      borradores,
      obras,
      costos_obra,
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
