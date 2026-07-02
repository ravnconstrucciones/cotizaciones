import { NextResponse } from "next/server";
import {
  saldosPorCuenta,
  type Cuenta,
  type CashflowCuentaRow,
  type GastoObraCuentaRow,
  type GastoPersonalCuentaRow,
  type RetiroCuentaRow,
} from "@/lib/cuentas";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Sistema de CUENTAS — dónde está la plata físicamente.
 *
 * GET → cuentas con saldo DERIVADO (saldo_inicial de la foto del 02/07 +
 * movimientos con cuenta_id) y agregados por moneda/procedencia. Sirve al
 * desglose de la tarjeta Plata y a los selectores de origen de los forms.
 * La matemática vive en src/lib/cuentas.ts (pura, testeada); acá solo se
 * juntan las filas.
 *
 * Service_role (bypass RLS), detrás del middleware de sesión.
 */

type CuentaRow = {
  id: string;
  nombre: string;
  moneda: string;
  saldo_inicial: string | number;
  fecha_saldo_inicial: string;
  procedencia: string;
  activa: boolean;
  orden: number;
  notas: string | null;
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [cuentasRes, gastosRes, cashflowRes, retirosRes, personalesRes] =
      await Promise.all([
        supabase
          .from("cuentas")
          .select(
            "id, nombre, moneda, saldo_inicial, fecha_saldo_inicial, procedencia, activa, orden, notas"
          )
          .order("orden"),
        // Solo filas con cuenta asignada (las sin asignar no tocan saldos);
        // cashflow_item_id viene para dedup del espejo gasto↔libreta.
        supabase
          .from("presupuestos_gastos")
          .select(
            "cuenta_id, importe, cotizacion_venta_ars_por_usd, cashflow_item_id"
          )
          .not("cuenta_id", "is", null),
        supabase
          .from("cashflow_items")
          .select("id, cuenta_id, tipo, monto_real, moneda, monto_usd, deleted_at")
          .not("cuenta_id", "is", null)
          .is("deleted_at", null),
        supabase
          .from("retiros_socio")
          .select("cuenta_id, tipo, monto_ars")
          .not("cuenta_id", "is", null),
        supabase
          .from("gastos_personales")
          .select("cuenta_id, monto")
          .not("cuenta_id", "is", null),
      ]);

    const firstError =
      cuentasRes.error ??
      gastosRes.error ??
      cashflowRes.error ??
      retirosRes.error ??
      personalesRes.error;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const cuentas: Cuenta[] = ((cuentasRes.data ?? []) as CuentaRow[]).map(
      (c) => ({
        id: c.id,
        nombre: c.nombre,
        moneda: c.moneda === "USD" ? "USD" : "ARS",
        saldo_inicial: num(c.saldo_inicial),
        fecha_saldo_inicial: String(c.fecha_saldo_inicial).slice(0, 10),
        procedencia: c.procedencia === "obra" ? "obra" : "propia",
        activa: Boolean(c.activa),
        orden: num(c.orden),
        notas: c.notas ?? "",
      })
    );

    const saldos = saldosPorCuenta({
      cuentas,
      gastosObra: (gastosRes.data ?? []) as GastoObraCuentaRow[],
      cashflow: (cashflowRes.data ?? []) as CashflowCuentaRow[],
      retiros: (retirosRes.data ?? []) as RetiroCuentaRow[],
      gastosPersonales: (personalesRes.data ?? []) as GastoPersonalCuentaRow[],
    });

    const payload = NextResponse.json(saldos);
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
