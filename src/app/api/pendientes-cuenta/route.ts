import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * PENDIENTES DE CUENTA — movimientos registrados sin decir de qué cuenta
 * salió (o a cuál entró) la plata. Regla acordada con Eze (04/07): el
 * movimiento se registra igual (no se pierde nada en obra), pero queda
 * marcado como pendiente en la bandeja de /archivados hasta asignarle cuenta.
 *
 * Solo cuenta lo posterior a la foto inicial del sistema de cuentas
 * (02/07/2026): los movimientos históricos quedaron "sin asignar" a propósito
 * y no son deuda de datos.
 *
 * GET  → lista de pendientes de todas las tablas con cuenta_id.
 * POST → { origen, id, cuenta_id } asigna la cuenta y lo saca de la bandeja.
 *
 * Service_role (bypass RLS), detrás del middleware de sesión.
 */

const DESDE = "2026-07-02"; // fecha de la foto inicial de cuentas

export type OrigenPendiente =
  | "gasto_obra"
  | "cashflow"
  | "gasto_personal"
  | "gasto_empresa"
  | "retiro";

export type PendienteCuenta = {
  id: string;
  origen: OrigenPendiente;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  detalle: string | null; // obra o categoría, para ubicarse
  fecha: string;
  monto: number;
  moneda: "ARS" | "USD";
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [gastosRes, espejosRes, cashflowRes, personalesRes, empresaRes, retirosRes] =
      await Promise.all([
        supabase
          .from("presupuestos_gastos")
          .select(
            "id, descripcion, importe, fecha, presupuestos(nombre_obra, nombre_cliente)"
          )
          .is("cuenta_id", null)
          .gte("fecha", DESDE),
        // Egresos de libreta que espejan un gasto de obra: la cuenta vive en
        // el gasto, el espejo no debe aparecer como pendiente propio.
        supabase
          .from("presupuestos_gastos")
          .select("cashflow_item_id")
          .not("cashflow_item_id", "is", null),
        supabase
          .from("cashflow_items")
          .select(
            "id, tipo, descripcion, categoria, monto_real, monto_usd, moneda, fecha_real, obras(presupuestos(nombre_obra, nombre_cliente))"
          )
          .is("cuenta_id", null)
          .is("deleted_at", null)
          .not("monto_real", "is", null)
          .gte("fecha_real", DESDE),
        supabase
          .from("gastos_personales")
          .select("id, concepto, monto, categoria, fecha")
          .is("cuenta_id", null)
          .gte("fecha", DESDE),
        supabase
          .from("gastos_empresa")
          .select("id, concepto, monto, moneda, categoria, fecha")
          .is("cuenta_id", null)
          .gte("fecha", DESDE),
        supabase
          .from("retiros_socio")
          .select("id, concepto, monto_ars, tipo, fecha")
          .is("cuenta_id", null)
          .gte("fecha", DESDE),
      ]);

    const firstError =
      gastosRes.error ??
      espejosRes.error ??
      cashflowRes.error ??
      personalesRes.error ??
      empresaRes.error ??
      retirosRes.error;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const pendientes: PendienteCuenta[] = [];

    type PresupuestoNombre = {
      nombre_obra: string | null;
      nombre_cliente: string | null;
    } | null;
    // Supabase tipa los joins FK como array aunque en runtime el to-one
    // devuelve objeto; se normalizan las dos formas.
    const unoDe = (v: unknown): PresupuestoNombre =>
      (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as PresupuestoNombre;
    const nombreObra = (v: unknown) => {
      const p = unoDe(v);
      return p?.nombre_obra || p?.nombre_cliente || null;
    };

    for (const g of (gastosRes.data ?? []) as unknown as Array<{
      id: string;
      descripcion: string | null;
      importe: unknown;
      fecha: string;
      presupuestos: unknown;
    }>) {
      pendientes.push({
        id: g.id,
        origen: "gasto_obra",
        tipo: "egreso",
        descripcion: (g.descripcion ?? "Gasto de obra").replace(/\s+/g, " ").trim(),
        detalle: nombreObra(g.presupuestos),
        fecha: g.fecha,
        monto: num(g.importe),
        moneda: "ARS",
      });
    }

    const espejos = new Set(
      ((espejosRes.data ?? []) as Array<{ cashflow_item_id: string | null }>).map(
        (e) => String(e.cashflow_item_id)
      )
    );
    for (const m of (cashflowRes.data ?? []) as unknown as Array<{
      id: string;
      tipo: string;
      descripcion: string | null;
      categoria: string | null;
      monto_real: unknown;
      monto_usd: unknown;
      moneda: string | null;
      fecha_real: string;
      obras: unknown;
    }>) {
      if (espejos.has(String(m.id))) continue;
      const enUsd = m.moneda === "USD";
      const obra = (Array.isArray(m.obras) ? m.obras[0] : m.obras) as {
        presupuestos?: unknown;
      } | null;
      pendientes.push({
        id: m.id,
        origen: "cashflow",
        tipo: m.tipo === "ingreso" ? "ingreso" : "egreso",
        descripcion: m.descripcion || m.categoria || "Movimiento de caja",
        detalle: nombreObra(obra?.presupuestos ?? null),
        fecha: m.fecha_real,
        monto: enUsd ? num(m.monto_usd) : num(m.monto_real),
        moneda: enUsd ? "USD" : "ARS",
      });
    }

    for (const g of (personalesRes.data ?? []) as Array<{
      id: string;
      concepto: string | null;
      monto: unknown;
      categoria: string | null;
      fecha: string;
    }>) {
      pendientes.push({
        id: g.id,
        origen: "gasto_personal",
        tipo: "egreso",
        descripcion: g.concepto || "Gasto personal",
        detalle: g.categoria ? `Personal · ${g.categoria}` : "Personal",
        fecha: g.fecha,
        monto: num(g.monto),
        moneda: "ARS",
      });
    }

    for (const g of (empresaRes.data ?? []) as Array<{
      id: string;
      concepto: string | null;
      monto: unknown;
      moneda: string | null;
      categoria: string | null;
      fecha: string;
    }>) {
      pendientes.push({
        id: g.id,
        origen: "gasto_empresa",
        tipo: "egreso",
        descripcion: g.concepto || "Gasto de empresa",
        detalle: g.categoria ? `Empresa · ${g.categoria}` : "Empresa",
        fecha: g.fecha,
        monto: num(g.monto),
        moneda: g.moneda === "USD" ? "USD" : "ARS",
      });
    }

    for (const r of (retirosRes.data ?? []) as Array<{
      id: string;
      concepto: string | null;
      monto_ars: unknown;
      tipo: string;
      fecha: string;
    }>) {
      pendientes.push({
        id: r.id,
        origen: "retiro",
        tipo: r.tipo === "aporte" ? "ingreso" : "egreso",
        descripcion: r.concepto || (r.tipo === "aporte" ? "Aporte" : "Retiro"),
        detalle: r.tipo === "aporte" ? "Aporte de socio" : "Retiro de socio",
        fecha: r.fecha,
        monto: num(r.monto_ars),
        moneda: "ARS",
      });
    }

    pendientes.sort((a, b) => b.fecha.localeCompare(a.fecha));

    return NextResponse.json({ pendientes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const TABLA_POR_ORIGEN: Record<OrigenPendiente, string> = {
  gasto_obra: "presupuestos_gastos",
  cashflow: "cashflow_items",
  gasto_personal: "gastos_personales",
  gasto_empresa: "gastos_empresa",
  retiro: "retiros_socio",
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      origen?: OrigenPendiente;
      id?: string;
      cuenta_id?: string;
    };
    const tabla = body.origen ? TABLA_POR_ORIGEN[body.origen] : undefined;
    if (!tabla || !body.id || !body.cuenta_id) {
      return NextResponse.json(
        { error: "Faltan origen, id o cuenta_id" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();
    const cuenta = await supabase
      .from("cuentas")
      .select("id")
      .eq("id", body.cuenta_id)
      .eq("activa", true)
      .maybeSingle();
    if (cuenta.error || !cuenta.data) {
      return NextResponse.json({ error: "Cuenta inválida" }, { status: 400 });
    }

    const upd = await supabase
      .from(tabla)
      .update({ cuenta_id: body.cuenta_id })
      .eq("id", body.id)
      .is("cuenta_id", null)
      .select("id");
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    if (!upd.data?.length) {
      return NextResponse.json(
        { error: "El movimiento no existe o ya tiene cuenta" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
