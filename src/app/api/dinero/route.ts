import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { esTarjeta } from "@/lib/dinero-tablero";

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

    const [bolsillosRes, financiamientosRes, borradoresRes, gastosRes, cuentasRes, arqueosRes] =
      await Promise.all([
        supabase
          .from("dinero_saldos_bolsillos")
          .select("cuenta_id, dueno_tipo, dueno_obra_id, moneda, saldo, movimientos"),
        supabase
          .from("financiamientos")
          .select(
            "id, deudor_tipo, deudor_obra_id, acreedor_tipo, acreedor_obra_id, contraparte, monto_original, saldo_pendiente, moneda, estado, notas, created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("movimientos_plata")
          .select(
            "id, grupo_id, fecha, cuenta_id, dueno_tipo, dueno_obra_id, monto, moneda, origen_tipo, descripcion, created_at"
          )
          .eq("estado", "borrador")
          .order("created_at", { ascending: false }),
        // Vista agregada: el group by en la base evita el cap de 1000 filas
        // de PostgREST (traer la tabla entera subcontaba costos en silencio).
        supabase
          .from("dinero_costos_obra")
          .select("presupuesto_id, costo"),
        // Para marcar qué cuentas son tarjeta (personales: control, nunca
        // restan en bolsillos — regla de Eze 08/07).
        supabase.from("cuentas").select("id, nombre"),
        // Arqueos declarados caja por caja (análisis de desviaciones, 13/07).
        supabase
          .from("cuenta_ajustes")
          .select("id, cuenta_id, fecha, saldo_declarado, delta, nota")
          .order("fecha", { ascending: false })
          .limit(200),
      ]);

    const firstError =
      bolsillosRes.error ??
      financiamientosRes.error ??
      borradoresRes.error ??
      gastosRes.error ??
      cuentasRes.error ??
      arqueosRes.error;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const bolsillos = bolsillosRes.data ?? [];
    // Un solo dueño (08/07): el dueño "personal" murió. Las deudas históricas
    // con pata de Eze quedaron absorbidas/convertidas en la base; si alguna
    // fila legacy sobrevive, no viaja al tablero.
    const financiamientos = (financiamientosRes.data ?? []).filter(
      (f) => f.deudor_tipo !== "personal" && f.acreedor_tipo !== "personal"
    );
    const borradores = borradoresRes.data ?? [];

    // Costo total por obra (los importes ya están en ARS por convención).
    const costos_obra: Record<string, number> = {};
    for (const g of gastosRes.data ?? []) {
      if (!g.presupuesto_id) continue;
      const n = typeof g.costo === "number" ? g.costo : parseFloat(String(g.costo ?? ""));
      if (!Number.isFinite(n)) continue;
      costos_obra[g.presupuesto_id] = n;
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

    const tarjetas = (cuentasRes.data ?? [])
      .filter((c) => esTarjeta(c.nombre ?? ""))
      .map((c) => c.id);

    const payload = NextResponse.json({
      bolsillos,
      financiamientos,
      borradores,
      obras,
      costos_obra,
      tarjetas,
      arqueos: arqueosRes.data ?? [],
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
