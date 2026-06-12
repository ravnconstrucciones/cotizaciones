import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  resolverDestino,
  type DestinoArchivado,
} from "@/lib/archivados-destinos";

/**
 * Resolver un evento archivado: ejecuta el insert de destino (si corresponde)
 * y marca el evento como 'resuelto' con destino_tabla/destino_id.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventoId = typeof body?.evento_id === "string" ? body.evento_id : "";
  if (!eventoId) {
    return NextResponse.json({ error: "evento_id requerido." }, { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: evento, error: evErr } = await sb
    .from("eventos")
    .select("id, titulo, contenido, estado")
    .eq("id", eventoId)
    .single();
  if (evErr || !evento) {
    return NextResponse.json({ error: "evento no encontrado." }, { status: 404 });
  }
  if (evento.estado !== "archivado") {
    return NextResponse.json(
      { error: `el evento no está archivado (estado: ${evento.estado}).` },
      { status: 409 }
    );
  }

  const r = resolverDestino(
    { id: evento.id, titulo: evento.titulo, contenido: evento.contenido ?? {} },
    body?.destino as DestinoArchivado,
    {
      monto: typeof body?.monto === "number" ? body.monto : Number(body?.monto),
      categoria: typeof body?.categoria === "string" ? body.categoria : undefined,
      presupuesto_id:
        typeof body?.presupuesto_id === "string" ? body.presupuesto_id : undefined,
      etiquetas: Array.isArray(body?.etiquetas)
        ? (body.etiquetas as unknown[]).filter(
            (e): e is string => typeof e === "string"
          )
        : undefined,
    }
  );
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  let destinoTabla: string | null = null;
  let destinoId: string | null = null;

  if (r.resolucion.accion === "insert") {
    // foto_obra: la imagen vive en otro bucket (p.ej. referencias) — copiarla
    // a obra-archivos ANTES del insert para que la fila nunca apunte al vacío.
    if (r.resolucion.copiarImagen) {
      const c = r.resolucion.copiarImagen;
      const { data: blob, error: dlErr } = await sb.storage
        .from(c.desdeBucket)
        .download(c.desdePath);
      if (dlErr || !blob) {
        return NextResponse.json(
          { error: `no pude leer la imagen del bucket ${c.desdeBucket}: ${dlErr?.message ?? "vacía"}.` },
          { status: 500 }
        );
      }
      const { error: upErr } = await sb.storage
        .from(c.haciaBucket)
        .upload(c.haciaPath, blob, {
          contentType: blob.type || "image/jpeg",
          upsert: true,
        });
      if (upErr) {
        return NextResponse.json(
          { error: `no pude copiar la imagen a ${c.haciaBucket}: ${upErr.message}.` },
          { status: 500 }
        );
      }
    }

    const { data: fila, error: insErr } = await sb
      .from(r.resolucion.tabla)
      .insert(r.resolucion.payload)
      .select("id")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    destinoTabla = r.resolucion.tabla;
    destinoId = fila.id;
  }

  const { error: updErr } = await sb
    .from("eventos")
    .update({ estado: "resuelto", destino_tabla: destinoTabla, destino_id: destinoId })
    .eq("id", eventoId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, destino_tabla: destinoTabla, destino_id: destinoId });
}
