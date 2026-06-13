import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ordenarProyectos } from "@/lib/proyectos-orden";

/**
 * GET /api/proyectos
 *
 * Devuelve todos los presupuestos con conteo de items y gastos.
 * Orden: aprobados primero, luego por cant_items DESC.
 */
export async function GET() {
  try {
    const sb = createSupabaseAdminClient();

    // Las tres queries son independientes — van en paralelo.
    const [presResult, itemsResult, gastosResult] = await Promise.all([
      sb
        .from("presupuestos")
        .select("id, nombre_obra, nombre_cliente, presupuesto_aprobado, created_at")
        .order("created_at", { ascending: false }),

      sb.from("presupuestos_items").select("presupuesto_id"),

      sb.from("presupuestos_gastos").select("presupuesto_id"),
    ]);

    if (presResult.error) {
      return NextResponse.json({ error: presResult.error.message }, { status: 500 });
    }

    // Conteo de items por presupuesto_id
    const cantItemsPor = new Map<string, number>();
    for (const r of presResult.data ?? []) {
      cantItemsPor.set(r.id, 0);
    }
    for (const r of itemsResult.data ?? []) {
      const pid = r.presupuesto_id as string;
      cantItemsPor.set(pid, (cantItemsPor.get(pid) ?? 0) + 1);
    }

    // Conteo de gastos por presupuesto_id
    const cantGastosPor = new Map<string, number>();
    for (const r of gastosResult.data ?? []) {
      const pid = r.presupuesto_id as string;
      cantGastosPor.set(pid, (cantGastosPor.get(pid) ?? 0) + 1);
    }

    const rows = (presResult.data ?? []).map((p) => ({
      id: p.id as string,
      nombre_obra: (p.nombre_obra as string | null) ?? null,
      nombre_cliente: (p.nombre_cliente as string | null) ?? null,
      presupuesto_aprobado: (p.presupuesto_aprobado as boolean | null) ?? null,
      created_at: p.created_at as string,
      cant_items: cantItemsPor.get(p.id as string) ?? 0,
      cant_gastos: cantGastosPor.get(p.id as string) ?? 0,
    }));

    const proyectos = ordenarProyectos(rows);

    const res = NextResponse.json({ proyectos, total: proyectos.length });
    res.headers.set("Cache-Control", "s-maxage=30");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
