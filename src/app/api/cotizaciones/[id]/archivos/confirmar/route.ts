import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  BUCKET_ARCHIVOS,
  maxBytesDeTipo,
  pathValidoParaConfirmar,
} from "@/lib/cotizador/subida-directa";

/**
 * POST /api/cotizaciones/[id]/archivos/confirmar — paso 3 de la subida directa.
 *
 * Body JSON: { path, tipo?, titulo? }. Verifica que el path sea uno que
 * /firmar pudo haber emitido para ESTA cotización (el cliente nunca elige
 * dónde escribe), que el objeto exista en el bucket y que no supere el techo
 * real. Después persiste:
 *   - tipo portada → cotizaciones.foto_portada_path (+ borra la anterior),
 *     misma respuesta { ok, path, url } que POST /portada.
 *   - resto → fila en cotizacion_archivos, misma respuesta { ok, archivo }
 *     que el POST multipart histórico (la UI no distingue flujos).
 *
 * Si el objeto quedó huérfano (subida ok pero confirmar nunca llegó), no hay
 * fila que lo apunte: molesta solo en el bucket y se puede purgar a mano.
 */

const EXPIRA_S = 3600;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const cotizacionId = String(id ?? "").trim();
    if (!cotizacionId) {
      return NextResponse.json({ error: "cotizacion_id requerido." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      tipo?: string;
      titulo?: string;
    };
    const path = String(body.path ?? "").trim();
    const tipo = typeof body.tipo === "string" && body.tipo.trim() ? body.tipo.trim() : "propuesta";
    const titulo =
      typeof body.titulo === "string" && body.titulo.trim() ? body.titulo.trim() : null;

    if (!pathValidoParaConfirmar(path, cotizacionId, tipo)) {
      return NextResponse.json({ error: "path inválido para esta cotización." }, { status: 400 });
    }

    const sb = createSupabaseAdminClient();

    // El objeto tiene que existir de verdad en el bucket (el cliente ya lo
    // subió en el paso 2) y respetar el techo real — `size` en /firmar era
    // declarativo. list() sobre la carpeta con search por nombre exacto:
    // funciona en supabase-js 2.49 (info() es más nuevo).
    const [carpeta, cotId, nombre] = path.split("/");
    const { data: objetos, error: eList } = await sb.storage
      .from(BUCKET_ARCHIVOS)
      .list(`${carpeta}/${cotId}`, { search: nombre, limit: 10 });
    if (eList) {
      return NextResponse.json({ error: eList.message }, { status: 500 });
    }
    const objeto = (objetos ?? []).find((o) => o.name === nombre);
    if (!objeto) {
      return NextResponse.json(
        { error: "El archivo no llegó al bucket — reintentá la subida." },
        { status: 404 }
      );
    }
    const size = (objeto.metadata as { size?: number } | null)?.size ?? 0;
    if (size > maxBytesDeTipo(tipo)) {
      await sb.storage.from(BUCKET_ARCHIVOS).remove([path]);
      return NextResponse.json(
        { error: `El archivo supera los ${Math.round(maxBytesDeTipo(tipo) / 1024 / 1024)} MB.` },
        { status: 413 }
      );
    }

    if (tipo === "portada") {
      const { data: cot, error: eCot } = await sb
        .from("cotizaciones")
        .select("id, foto_portada_path")
        .eq("id", cotizacionId)
        .maybeSingle();
      if (eCot || !cot) {
        return NextResponse.json(
          { error: eCot?.message ?? "Cotización no encontrada." },
          { status: 404 }
        );
      }
      const pathPrevio = (cot as { foto_portada_path: string | null }).foto_portada_path;

      const { error: eUpd } = await sb
        .from("cotizaciones")
        .update({ foto_portada_path: path })
        .eq("id", cotizacionId);
      if (eUpd) {
        await sb.storage.from(BUCKET_ARCHIVOS).remove([path]);
        return NextResponse.json({ error: eUpd.message }, { status: 500 });
      }
      if (pathPrevio && pathPrevio !== path) {
        await sb.storage.from(BUCKET_ARCHIVOS).remove([pathPrevio]).catch(() => {});
      }
      const { data: signed } = await sb.storage
        .from(BUCKET_ARCHIVOS)
        .createSignedUrl(path, 60 * 30);
      return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null });
    }

    // La cotización tiene que existir (FK + verificación temprana).
    const { data: cot, error: eCot } = await sb
      .from("cotizaciones")
      .select("id")
      .eq("id", cotizacionId)
      .maybeSingle();
    if (eCot || !cot) {
      return NextResponse.json(
        { error: eCot?.message ?? "Cotización no encontrada." },
        { status: 404 }
      );
    }

    const { data: fila, error: eIns } = await sb
      .from("cotizacion_archivos")
      .insert({ cotizacion_id: cotizacionId, tipo, titulo, storage_path: path })
      .select("id, tipo, titulo, creado_at")
      .single();
    if (eIns) {
      // Sin fila no hay quien apunte al objeto: lo sacamos para no dejar basura.
      await sb.storage.from(BUCKET_ARCHIVOS).remove([path]);
      return NextResponse.json({ error: eIns.message }, { status: 500 });
    }

    const { data: signed } = await sb.storage.from(BUCKET_ARCHIVOS).createSignedUrl(path, EXPIRA_S);

    return NextResponse.json({
      ok: true,
      archivo: {
        id: fila.id,
        tipo: fila.tipo,
        titulo: fila.titulo,
        creado_at: fila.creado_at,
        storage_path: path,
        url: signed?.signedUrl ?? null,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
