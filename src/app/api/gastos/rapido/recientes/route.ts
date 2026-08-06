import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  normalizarGastosRecientes,
  ORIGEN_GASTO_RAPIDO,
  type FuenteGastoRapido,
} from "@/lib/gastos-rapidos";

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uno(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export async function GET() {
  try {
    const sb = createSupabaseAdminClient();
    const [obraRes, empresaRes, personalRes] = await Promise.all([
      sb
        .from("presupuestos_gastos")
        .select(
          "id, descripcion, importe, fecha, created_at, cuentas(nombre), presupuestos(nombre_obra, nombre_cliente)"
        )
        .eq("origen_carga", ORIGEN_GASTO_RAPIDO)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(10),
      sb
        .from("gastos_empresa")
        .select("id, concepto, monto, moneda, fecha, created_at, cuentas(nombre)")
        .eq("origen_carga", ORIGEN_GASTO_RAPIDO)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(10),
      sb
        .from("gastos_personales")
        .select("id, concepto, monto, fecha, created_at, cuentas(nombre)")
        .eq("origen_carga", ORIGEN_GASTO_RAPIDO)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(10),
    ]);

    const error = obraRes.error ?? empresaRes.error ?? personalRes.error;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const fuentes: FuenteGastoRapido[] = [];
    for (const row of obraRes.data ?? []) {
      const cuenta = uno(row.cuentas);
      const presupuesto = uno(row.presupuestos);
      fuentes.push({
        id: String(row.id),
        tipo: "obra",
        concepto: String(row.descripcion || "Gasto de obra"),
        importe: num(row.importe),
        moneda: "ARS",
        fecha: String(row.fecha),
        createdAt: String(row.created_at),
        cuenta: cuenta?.nombre ? String(cuenta.nombre) : null,
        detalle: presupuesto
          ? String(presupuesto.nombre_obra || presupuesto.nombre_cliente || "Obra")
          : null,
      });
    }
    for (const row of empresaRes.data ?? []) {
      const cuenta = uno(row.cuentas);
      fuentes.push({
        id: String(row.id),
        tipo: "empresa",
        concepto: String(row.concepto || "Gasto de empresa"),
        importe: num(row.monto),
        moneda: row.moneda === "USD" ? "USD" : "ARS",
        fecha: String(row.fecha),
        createdAt: String(row.created_at),
        cuenta: cuenta?.nombre ? String(cuenta.nombre) : null,
        detalle: null,
      });
    }
    for (const row of personalRes.data ?? []) {
      const cuenta = uno(row.cuentas);
      fuentes.push({
        id: String(row.id),
        tipo: "personal",
        concepto: String(row.concepto || "Gasto personal"),
        importe: num(row.monto),
        moneda: "ARS",
        fecha: String(row.fecha),
        createdAt: String(row.created_at),
        cuenta: cuenta?.nombre ? String(cuenta.nombre) : null,
        detalle: null,
      });
    }

    const response = NextResponse.json({
      ok: true,
      gastos: normalizarGastosRecientes(fuentes),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al cargar gastos";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
