import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** La única fila de control del motor del cotizador. */
const FILA = "puente-cotizador";

/** Época: un insert nuevo jamás debe nacer con latido "fresco" que no ocurrió. */
const SIN_LATIDO = "1970-01-01T00:00:00Z";

type FilaControl = {
  visto_at: string | null;
  deseado: string;
  estado: string;
  presencia_at: string | null;
};

/**
 * Control del motor del cotizador (spec 2026-08-17 motor-encendido-apagado).
 * La fila `puente_latidos` reúne el latido del bridge (visto_at + estado) y la
 * voluntad de Eze (deseado + presencia_at). GET la muestra; POST la escribe.
 */
export async function GET() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("puente_latidos")
    .select("visto_at, deseado, estado, presencia_at")
    .eq("id", FILA)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const fila = (data as FilaControl | null) ?? {
    visto_at: null,
    deseado: "encendido",
    estado: "suspendido",
    presencia_at: null,
  };
  return NextResponse.json(fila);
}

export async function POST(req: Request) {
  const cuerpo = (await req.json().catch(() => null)) as { accion?: unknown } | null;
  const accion = typeof cuerpo?.accion === "string" ? cuerpo.accion : "";
  if (accion !== "encender" && accion !== "apagar" && accion !== "presencia") {
    return NextResponse.json(
      { error: "Acción inválida (encender | apagar | presencia)." },
      { status: 400 }
    );
  }

  const sb = createSupabaseAdminClient();
  const ahora = new Date().toISOString();
  const cambios: Record<string, string> =
    accion === "presencia"
      ? { presencia_at: ahora }
      : { deseado: accion === "encender" ? "encendido" : "apagado", presencia_at: ahora };

  const { data, error } = await sb
    .from("puente_latidos")
    .update(cambios)
    .eq("id", FILA)
    .select("visto_at, deseado, estado, presencia_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data || data.length === 0) {
    // Primera vez: la fila no existe todavía. El latido nace en época — que
    // el chip nunca crea que el bridge está vivo por un insert del visor.
    const { data: creada, error: eIns } = await sb
      .from("puente_latidos")
      .insert({ id: FILA, visto_at: SIN_LATIDO, ...cambios })
      .select("visto_at, deseado, estado, presencia_at");
    if (eIns) return NextResponse.json({ error: eIns.message }, { status: 500 });
    return NextResponse.json((creada?.[0] as FilaControl) ?? null);
  }

  return NextResponse.json(data[0] as FilaControl);
}
