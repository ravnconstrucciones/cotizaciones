import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proxy del control del motor (spec 2026-08-17 motor-encendido-apagado): el
 * chip del visor lee y escribe la voluntad del bridge contra App RAVN con las
 * credenciales server-only del cotizador. GET = estado; POST = encender /
 * apagar / presencia (la presencia devuelve el estado fresco: un solo viaje).
 */

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const TIMEOUT_MS = 10_000;

function config(secretEnv: "RAVN_COTIZADOR_READ_SECRET" | "RAVN_COTIZADOR_WRITE_SECRET") {
  const baseUrl = (process.env.RAVN_APP_URL ?? "").replace(/\/+$/, "");
  const secret = process.env[secretEnv] ?? "";
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

async function contestar(upstream: Response): Promise<NextResponse> {
  const cuerpo = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
  if (!upstream.ok) {
    const motivo =
      cuerpo && typeof cuerpo.error === "string" ? cuerpo.error : `HTTP ${upstream.status}`;
    return NextResponse.json({ error: motivo }, { status: 502, headers: NO_STORE });
  }
  return NextResponse.json(cuerpo, { headers: NO_STORE });
}

export async function GET() {
  const cfg = config("RAVN_COTIZADOR_READ_SECRET");
  if (!cfg) {
    return NextResponse.json(
      { error: "Falta configurar la credencial de lectura de App RAVN." },
      { status: 503, headers: NO_STORE }
    );
  }
  try {
    const upstream = await fetch(`${cfg.baseUrl}/api/puente/control`, {
      cache: "no-store",
      headers: { Accept: "application/json", "x-ravn-cotizador-read": cfg.secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return await contestar(upstream);
  } catch {
    return NextResponse.json(
      { error: "App RAVN no contestó el estado del motor." },
      { status: 502, headers: NO_STORE }
    );
  }
}

export async function POST(request: NextRequest) {
  const cuerpo = (await request.json().catch(() => null)) as { accion?: unknown } | null;
  const accion = typeof cuerpo?.accion === "string" ? cuerpo.accion : "";
  if (accion !== "encender" && accion !== "apagar" && accion !== "presencia") {
    return NextResponse.json(
      { error: "Acción inválida (encender | apagar | presencia)." },
      { status: 400, headers: NO_STORE }
    );
  }
  const cfg = config("RAVN_COTIZADOR_WRITE_SECRET");
  if (!cfg) {
    return NextResponse.json(
      { error: "Falta configurar la credencial de escritura de App RAVN." },
      { status: 503, headers: NO_STORE }
    );
  }
  try {
    const upstream = await fetch(`${cfg.baseUrl}/api/puente/control`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-ravn-cotizador-write": cfg.secret,
      },
      body: JSON.stringify({ accion }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return await contestar(upstream);
  } catch {
    return NextResponse.json(
      { error: "App RAVN no recibió la orden del motor." },
      { status: 502, headers: NO_STORE }
    );
  }
}
