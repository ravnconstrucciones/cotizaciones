import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Carpeta de la obra (orbital /obras/[id]).
 *
 * GET    /api/obra-archivos?presupuesto_id=<uuid>
 *        Lista obra_archivos de la obra y firma el bucket privado
 *        `obra-archivos`: url (original, 1 h) + thumb_url (miniatura con
 *        transformación de Storage para las fotos; si el plan no la soporta,
 *        la UI cae al original — siempre lazy). Si una firma falla, la fila
 *        sale con url null y la UI la ignora — nunca rompe.
 *
 * DELETE /api/obra-archivos  { id }
 *        Borra el archivo del bucket Y la fila (Eze: "yo puedo ir borrando").
 *
 * POST   /api/obra-archivos
 *        Subida desde el celu (cards de /obras/[id]) en dos pasos, porque el
 *        límite de request de Vercel (~4,5 MB) no banca una foto de iPhone:
 *        1. { paso: "firmar", presupuesto_id, tipo, filename }
 *           → firma una subida directa al bucket → { path, token }
 *           (el cliente sube con uploadToSignedUrl, sin pasar por Vercel).
 *        2. { paso: "confirmar", presupuesto_id, tipo, titulo, storage_path }
 *           → verifica que el objeto exista y asienta la fila en obra_archivos.
 *
 * El middleware exige sesión en /api/*, por eso el admin client es seguro acá
 * (mismo patrón que /api/referencias).
 */

const BUCKET = "obra-archivos";
const EXPIRA_S = 3600;
const THUMB = { width: 360, height: 360, resize: "cover" as const, quality: 60 };

type Fila = {
  id: string;
  presupuesto_id: string;
  tipo: string;
  titulo: string | null;
  storage_path: string | null;
  url_externa: string | null;
  evento_id: string | null;
  creado_at: string;
};

export async function GET(req: NextRequest) {
  const presupuestoId = req.nextUrl.searchParams.get("presupuesto_id");
  if (!presupuestoId) {
    return NextResponse.json(
      { error: "presupuesto_id requerido." },
      { status: 400 }
    );
  }

  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("obra_archivos")
    .select("*")
    .eq("presupuesto_id", presupuestoId)
    .order("creado_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []) as Fila[];
  const paths = filas
    .map((f) => f.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);

  // Originales: una sola llamada batch.
  const urlPorPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: firmadas, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrls(paths, EXPIRA_S);
    if (signErr) {
      console.error("[/api/obra-archivos] signed urls:", signErr.message);
    } else if (firmadas) {
      for (const f of firmadas) {
        if (f.signedUrl && f.path) urlPorPath.set(f.path, f.signedUrl);
      }
    }
  }

  // Miniaturas (solo fotos): transformación de Storage. Si el proyecto no la
  // tiene habilitada, la firma puede salir igual y fallar al servir — la UI
  // tiene onError → original, así que nunca queda un hueco.
  const thumbPorPath = new Map<string, string>();
  const fotosConPath = filas.filter(
    (f) => f.tipo === "foto" && f.storage_path
  );
  if (fotosConPath.length > 0) {
    const firmas = await Promise.all(
      fotosConPath.map((f) =>
        sb.storage
          .from(BUCKET)
          .createSignedUrl(f.storage_path as string, EXPIRA_S, {
            transform: THUMB,
          })
          .then(
            (r) => ({ path: f.storage_path as string, url: r.data?.signedUrl ?? null }),
            () => ({ path: f.storage_path as string, url: null })
          )
      )
    );
    for (const f of firmas) if (f.url) thumbPorPath.set(f.path, f.url);
  }

  const archivos = filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    titulo: f.titulo,
    url_externa: f.url_externa,
    creado_at: f.creado_at,
    url: f.storage_path ? urlPorPath.get(f.storage_path) ?? null : null,
    thumb_url: f.storage_path ? thumbPorPath.get(f.storage_path) ?? null : null,
  }));

  const res = NextResponse.json({ archivos });
  res.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
  return res;
}

// Tipos que la app puede subir (el bot solo mete "foto" por WhatsApp).
const TIPOS_SUBIDA = ["foto", "documento", "presupuesto", "diagnostico"];
const EXTS_PERMITIDAS = new Set([
  "jpg", "jpeg", "png", "webp", "heic", "heif",
  "pdf", "doc", "docx", "xls", "xlsx", "txt", "html",
]);

function extDe(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTS_PERMITIDAS.has(ext) ? ext : "bin";
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    paso?: unknown;
    presupuesto_id?: unknown;
    tipo?: unknown;
    titulo?: unknown;
    filename?: unknown;
    storage_path?: unknown;
  } | null;

  const paso = typeof body?.paso === "string" ? body.paso : "";
  const presupuestoId =
    typeof body?.presupuesto_id === "string" ? body.presupuesto_id : "";
  const tipo = typeof body?.tipo === "string" ? body.tipo : "";
  if (!presupuestoId || !TIPOS_SUBIDA.includes(tipo)) {
    return NextResponse.json(
      { error: "presupuesto_id y tipo válido requeridos." },
      { status: 400 }
    );
  }

  const sb = createSupabaseAdminClient();

  if (paso === "firmar") {
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const { data: pres, error: presErr } = await sb
      .from("presupuestos")
      .select("id")
      .eq("id", presupuestoId)
      .maybeSingle();
    if (presErr)
      return NextResponse.json({ error: presErr.message }, { status: 500 });
    if (!pres)
      return NextResponse.json({ error: "obra no encontrada." }, { status: 404 });

    const path = `app/${presupuestoId}/${Date.now()}-${Math.floor(
      Math.random() * 100000
    )}.${extDe(filename)}`;
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ path: data.path, token: data.token });
  }

  if (paso === "confirmar") {
    const storagePath =
      typeof body?.storage_path === "string" ? body.storage_path : "";
    // Solo confirma paths firmados por este endpoint y de ESTA obra.
    if (!storagePath.startsWith(`app/${presupuestoId}/`)) {
      return NextResponse.json({ error: "storage_path inválido." }, { status: 400 });
    }
    const { error: firmaErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60);
    if (firmaErr) {
      return NextResponse.json(
        { error: "el archivo no llegó al bucket — reintentá la subida." },
        { status: 400 }
      );
    }
    const titulo =
      typeof body?.titulo === "string" && body.titulo.trim()
        ? body.titulo.trim().slice(0, 200)
        : null;
    const { data: fila, error } = await sb
      .from("obra_archivos")
      .insert({
        presupuesto_id: presupuestoId,
        tipo,
        titulo,
        storage_path: storagePath,
      })
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: fila.id });
  }

  return NextResponse.json({ error: "paso inválido." }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id requerido." }, { status: 400 });

  const sb = createSupabaseAdminClient();
  const { data: fila, error: selErr } = await sb
    .from("obra_archivos")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!fila) return NextResponse.json({ error: "archivo no encontrado." }, { status: 404 });

  // Primero el binario (si falla, la fila queda y se puede reintentar);
  // un objeto ya inexistente no frena el borrado de la fila.
  if (fila.storage_path) {
    const { error: rmErr } = await sb.storage
      .from(BUCKET)
      .remove([fila.storage_path]);
    if (rmErr && !/not.?found/i.test(rmErr.message)) {
      return NextResponse.json({ error: rmErr.message }, { status: 500 });
    }
  }

  const { error: delErr } = await sb.from("obra_archivos").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
