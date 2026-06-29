import { NextResponse } from "next/server";

/**
 * Cotización del dólar blue (punta venta) para el tablero de salud del negocio.
 *
 * Eze tiene caja en dólares y quiere saber siempre cuánto vale en pesos al blue.
 * Tomamos el dato de dolarapi.com (gratis, sin key) y lo cacheamos 10 min para
 * no pegarle en cada carga. Si la fuente falla, devolvemos 502 y el front
 * simplemente no muestra la conversión (degradación silenciosa).
 */
export async function GET() {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue", {
      next: { revalidate: 600 }, // 10 min
    });
    if (!res.ok) throw new Error(`dolarapi ${res.status}`);
    const d = (await res.json()) as {
      compra?: number;
      venta?: number;
      fechaActualizacion?: string;
    };
    const venta = Number(d?.venta) || 0;
    const compra = Number(d?.compra) || 0;
    if (venta <= 0) throw new Error("venta inválida");

    const payload = NextResponse.json({
      blue_venta: venta,
      blue_compra: compra,
      actualizado: d?.fechaActualizacion ?? null,
    });
    payload.headers.set(
      "Cache-Control",
      "private, max-age=300, stale-while-revalidate=1800"
    );
    return payload;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
