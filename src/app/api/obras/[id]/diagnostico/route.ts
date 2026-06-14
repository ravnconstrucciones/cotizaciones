import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/obras/[id]/diagnostico — el botón "Generar diagnóstico" del orbital.
 * Encola un trabajo `orden` en trabajos_cola con un prompt completo para que la
 * Mac (daemon) arme el diagnóstico técnico de la obra en el formato oficial y lo
 * ADJUNTE a la obra (fila en obra_archivos tipo=diagnostico) → aparece solo en
 * el orbital. Si la Mac está apagada, queda en cola y se procesa al prenderla.
 */
export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { detalle?: string } | null;
  const detalle = (body?.detalle ?? "").trim();

  const sb = createSupabaseAdminClient();
  const { data: obra, error: obraErr } = await sb
    .from("presupuestos")
    .select("id, nombre_obra, nombre_cliente")
    .eq("id", id)
    .maybeSingle();
  if (obraErr) return NextResponse.json({ error: obraErr.message }, { status: 500 });
  if (!obra) return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });

  const nombre = obra.nombre_obra?.trim() || obra.nombre_cliente?.trim() || "la obra";

  const prompt = [
    `Armá el DIAGNÓSTICO TÉCNICO de la obra "${nombre}" (presupuesto_id ${id}).`,
    detalle
      ? `Lo que observó Eze / a diagnosticar: ${detalle}`
      : `Eze no dejó detalle: armalo en base a lo que sepas de la obra (avances, gastos, contexto del vault) y marcá claramente lo que falte relevar en obra.`,
    `FORMATO: seguí el formato oficial dark premium de diagnósticos (memoria ravn-diagnostico-formato; base /Users/ezeotero/Documents/ravn/diagnosticos/Diagnostico_Perazzo.html). Respetá la teoría de obra (cerebro Seia) y verificá datos técnicos antes de afirmarlos.`,
    `ADJUNTAR A LA OBRA (clave, si no, no sirve): además de guardar el HTML, insertá una fila en la tabla \`obra_archivos\` de Supabase para que el diagnóstico aparezca en el orbital de la obra: { presupuesto_id: "${id}", tipo: "diagnostico", titulo: "Diagnóstico — ${nombre}" }. Subí el HTML al bucket privado "obra-archivos" y guardá su storage_path en esa fila (mirá el patrón en src/app/api/obras/[id]/portada/route.ts y el esquema en la migración obra_archivos). Credenciales en /Users/ezeotero/.ravn-cotizador/.env.`,
    `Cerrá confirmando en 2 líneas: qué diagnosticaste y que quedó adjunto a la obra.`,
  ].join("\n\n");

  const { data: trabajo, error } = await sb
    .from("trabajos_cola")
    .insert({
      tipo: "orden",
      origen: "tablero",
      prompt,
      contexto: { presupuesto_id: id, doc: "diagnostico" },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Evento espejo para el feed Actividad (no es razón para fallar si falla).
  const { error: evErr } = await sb.from("eventos").insert({
    origen: "tablero",
    tipo: "trabajo_creado",
    estado: "procesado",
    titulo: `[diagnóstico] ${nombre}`,
    contenido: { trabajo_id: trabajo.id, tipo: "orden", doc: "diagnostico", presupuesto_id: id },
    destino_tabla: "trabajos_cola",
    destino_id: trabajo.id,
  });
  if (evErr) console.error("[/api/obras/[id]/diagnostico] evento:", evErr.message);

  return NextResponse.json({ ok: true, trabajo_id: trabajo.id });
}
