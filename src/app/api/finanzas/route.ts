import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const PRESUPUESTO_MENSUAL = 707942;
const PRESUPUESTO_DIARIO = 23600;

const LIMITES_SEMANALES: Record<string, number> = {
  Supermercado: 50000,
  Delivery: 8000,
  Salidas: 30000,
  Combustible: 120000,
  Farmacia: 20000,
  Ropa: 20000,
  Varios: 15000,
};

export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const hoyIso = hoy.toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("gastos_personales")
    .select("*")
    .gte("fecha", primerDiaMes)
    .lte("fecha", hoyIso)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const gastos = data ?? [];

  // Totales por categoría
  const porCategoria: Record<string, number> = {};
  for (const g of gastos) {
    const cat = g.categoria || "Varios";
    porCategoria[cat] = (porCategoria[cat] ?? 0) + Number(g.monto ?? 0);
  }

  // Total del mes
  const totalMes = Object.values(porCategoria).reduce((a, b) => a + b, 0);

  // Gastado hoy
  const gastadoHoy = gastos
    .filter((g) => g.fecha === hoyIso)
    .reduce((acc, g) => acc + Number(g.monto ?? 0), 0);

  // Días transcurridos del mes
  const diasTranscurridos = hoy.getDate();
  const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

  // Proyección a fin de mes
  const proyeccion = diasTranscurridos > 0
    ? Math.round((totalMes / diasTranscurridos) * diasEnMes)
    : 0;

  const disponible = PRESUPUESTO_MENSUAL - totalMes;

  // Semáforo diario
  const pctDia = PRESUPUESTO_DIARIO > 0 ? gastadoHoy / PRESUPUESTO_DIARIO : 0;
  const semaforoDia = pctDia < 0.7 ? "verde" : pctDia < 1 ? "amarillo" : "rojo";

  // Semáforo mensual
  const presupuestoEsperadoHastaHoy = PRESUPUESTO_DIARIO * diasTranscurridos;
  const pctMes = presupuestoEsperadoHastaHoy > 0 ? totalMes / presupuestoEsperadoHastaHoy : 0;
  const semaforoMes = pctMes < 0.85 ? "verde" : pctMes < 1.1 ? "amarillo" : "rojo";

  return NextResponse.json({
    presupuesto_mensual: PRESUPUESTO_MENSUAL,
    presupuesto_diario: PRESUPUESTO_DIARIO,
    limites_semanales: LIMITES_SEMANALES,
    total_mes: totalMes,
    gastado_hoy: gastadoHoy,
    disponible,
    proyeccion,
    dias_transcurridos: diasTranscurridos,
    dias_en_mes: diasEnMes,
    semaforo_dia: semaforoDia,
    semaforo_mes: semaforoMes,
    por_categoria: porCategoria,
    ultimos_gastos: gastos.slice(0, 30),
  });
}

export async function POST(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const body = await req.json();
  const { concepto, monto, categoria, fecha } = body;

  if (!concepto || !monto) {
    return NextResponse.json({ error: "concepto y monto requeridos" }, { status: 400 });
  }

  const hoyIso = new Date().toISOString().slice(0, 10);

  const { error } = await sb.from("gastos_personales").insert({
    concepto,
    monto: Number(monto),
    categoria: categoria || "Varios",
    fecha: fecha || hoyIso,
    origen: "app",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const { error } = await sb.from("gastos_personales").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
