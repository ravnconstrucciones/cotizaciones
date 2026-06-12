import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { validarMensajeTerminal } from "@/lib/terminal-hilo";

/**
 * Módulo Terminal → cola de trabajos (mismo motor que la barra de comando).
 *
 * POST: cada mensaje del chat inserta UN trabajo tipo 'consulta' con
 *       contexto.hilo_id + contexto.mensaje (+ canal 'terminal' para que el
 *       GET sin parámetro pueda retomar el último hilo). El daemon de la Mac
 *       lo levanta, corre Claude Code con --resume de la sesión del hilo y
 *       deja la respuesta en resultado.texto.
 * GET ?hilo=<uuid>: hidratación inicial — todos los trabajos de ese hilo.
 * GET sin hilo: retoma el último hilo activo del terminal (o hilo: null).
 * Auth: el middleware global ya exige sesión para /api/* (igual que /api/trabajos).
 */

export async function POST(req: NextRequest) {
  const v = validarMensajeTerminal(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: trabajo, error } = await sb
    .from("trabajos_cola")
    .insert({
      tipo: "consulta",
      origen: "tablero",
      prompt: v.data.mensaje,
      contexto: {
        canal: "terminal",
        hilo_id: v.data.hilo_id,
        mensaje: v.data.mensaje,
      },
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trabajo });
}

export async function GET(req: NextRequest) {
  const sb = createSupabaseAdminClient();
  let hilo = req.nextUrl.searchParams.get("hilo");

  if (!hilo) {
    // Sin parámetro: retomar el último hilo activo del terminal.
    const { data, error } = await sb
      .from("trabajos_cola")
      .select("contexto")
      .eq("contexto->>canal", "terminal")
      .order("creado_at", { ascending: false })
      .limit(1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const ultimo = data?.[0]?.contexto as Record<string, unknown> | undefined;
    hilo = typeof ultimo?.hilo_id === "string" ? ultimo.hilo_id : null;
    if (!hilo) return NextResponse.json({ hilo: null, trabajos: [] });
  }

  const { data, error } = await sb
    .from("trabajos_cola")
    .select("*")
    .eq("contexto->>hilo_id", hilo)
    .order("creado_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ hilo, trabajos: data ?? [] });
}
