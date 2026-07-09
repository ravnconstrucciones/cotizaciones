import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { validarRecetaCandidata } from "@/lib/cotizador/candidata";

export const dynamic = "force-dynamic";

/** GET /api/cotizar/recetas — recetario para el panel exploratorio /cotizar. */
export async function GET() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("recetas")
    .select("id, nombre, titulo, estado, parametros, preguntas_abiertas, version")
    .order("titulo");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recetas: data ?? [] });
}

/**
 * POST /api/cotizar/recetas — alta de receta CANDIDATA (la fábrica de recetas).
 * El validador hace cumplir la ley 1: nada entra sin origen por ítem; lo
 * indeterminado viene en preguntas_abiertas, no rellenado.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const out = validarRecetaCandidata(body);
  if (!out.ok) {
    return NextResponse.json(
      { error: "candidata_invalida", violaciones: out.violaciones },
      { status: 400 }
    );
  }
  const r = out.receta;
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("recetas")
    .insert({
      nombre: r.nombre,
      titulo: r.titulo,
      estado: "candidata",
      parametros: r.parametros,
      etapas: r.etapas,
      checklist: r.checklist ?? [],
      fuentes: r.fuentes,
      preguntas_abiertas: r.preguntas_abiertas ?? [],
      version: 1,
    })
    .select("id")
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { error: dup ? `ya existe una receta "${r.nombre}"` : error.message },
      { status: dup ? 409 : 500 }
    );
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
