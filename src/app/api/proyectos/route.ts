import { NextResponse } from "next/server";
import { cargarEconomiaObras } from "@/lib/economia-obras-server";

export async function GET() {
  try {
    const { proyectos } = await cargarEconomiaObras();
    return NextResponse.json({ proyectos: proyectos.map(p => ({ ...p, nombre_obra: p.nombre, nombre_cliente: p.cliente, presupuesto_aprobado: p.aprobado, created_at: p.createdAt, cant_items: p.cantItems, cant_gastos: p.cantGastos })), total: proyectos.length, actualizadoAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron leer los proyectos." }, { status: 500 });
  }
}
