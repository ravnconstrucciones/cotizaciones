import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ejecutarAccionPortal } from "@/lib/portal/acciones";
import { BUCKET_PORTAL, cargarVistaPortal, portalPorObra } from "@/lib/portal/datos";

/**
 * POST /api/portal-bot — entrada del bot de Grok al portal del cliente (19/11/2026).
 *
 * Pública para el middleware, pero exige `Authorization: Bearer <RAVN_PORTAL_BOT_SECRET>`.
 * Body JSON { accion, ... }:
 *   obras            { buscar? }                       → obras de la app con el estado de su portal
 *   estado           { presupuesto_id }                → rubros, agenda y registros (con ids) de esa obra
 *   acceso_crear     { presupuesto_id, titulo, clave? } → crea/activa el portal y fija nombre + contraseña
 *                                                         (si no viene clave la genera); devuelve el mensaje para el cliente
 *   + todas las acciones del panel (config: titulo, direccion, fecha_inicio, fecha_entrega, mostrar_pagos, activo; rubros_agregar, rubro_guardar, agenda_crear, agenda_borrar,
 *     registro_crear, registro_publicar, registro_borrar), con { presupuesto_id }.
 * registro_crear acepta el archivo de tres formas:
 *   - `media_base64` + `media_nombre` (foto01.jpg): el archivo en base64. Vercel corta el request en 4,5 MB,
 *     así que sirve para fotos (hasta ~3 MB de archivo); para videos usar subida_crear.
 *   - `media_url` (https, hasta 50 MB): el servidor la baja y la guarda.
 *   - `media_path`: el que devolvió subida_crear después de subir el archivo.
 *   subida_crear { presupuesto_id, media_nombre } → { upload_url, media_path }: el bot hace
 *     PUT <upload_url> con los bytes crudos (hasta 50 MB) y después registro_crear con ese media_path.
 * Lo que carga el bot entra como BORRADOR salvo que mande estado: "publicado".
 */

const MAX_BYTES = 50 * 1024 * 1024;
const ENTRADA = "https://portal.ravnconstrucciones.com.ar";
const TIPOS_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

const POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};
const FORMATOS = "Mandá foto JPG/PNG/HEIC o video MP4/MOV.";

/** Tipo a partir del nombre (foto01.jpg → image/jpeg). */
function tipoPorNombre(nombre: unknown): { tipo?: string; ext?: string; error?: string } {
  const n = typeof nombre === "string" ? nombre.trim() : "";
  const ext = (n.match(/\.([a-z0-9]+)$/i)?.[1] ?? "").toLowerCase();
  const tipo = POR_EXTENSION[ext];
  if (!n) return { error: "Falta media_nombre (por ejemplo foto01.jpg o video01.mp4)." };
  if (!tipo) return { error: `Formato no soportado (${ext || "sin extensión"}). ${FORMATOS}` };
  return { tipo, ext: TIPOS_MEDIA[tipo] };
}

const nuevoPath = (presupuestoId: string, ext: string) =>
  `portal/${presupuestoId}/${Date.now()}-${randomBytes(3).toString("hex")}.${ext}`;

async function guardarBase64(b64: string, nombre: unknown, presupuestoId: string): Promise<{ path?: string; error?: string }> {
  const t = tipoPorNombre(nombre);
  if (t.error) return { error: t.error };
  const limpio = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpio)) return { error: "media_base64 no es base64 válido." };
  const buf = Buffer.from(limpio, "base64");
  if (!buf.byteLength) return { error: "media_base64 vino vacío." };
  if (buf.byteLength > MAX_BYTES) return { error: "El archivo supera los 50 MB." };
  const path = nuevoPath(presupuestoId, t.ext!);
  const { error: e } = await createSupabaseAdminClient().storage.from(BUCKET_PORTAL).upload(path, buf, { contentType: t.tipo });
  return e ? { error: `No se pudo guardar el archivo: ${e.message}` } : { path };
}

const error = (mensaje: string, status = 400) => NextResponse.json({ ok: false, error: mensaje }, { status });

function autorizado(req: Request): boolean {
  const secreto = process.env.RAVN_PORTAL_BOT_SECRET ?? "";
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secreto.length < 32 || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Contraseña fácil de dictar: 3 bloques de 4 (sin 0/O ni 1/l). */
function claveNueva(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  const c = Array.from(bytes, (x) => abc[x % abc.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

async function bajarMedia(url: string, presupuestoId: string): Promise<{ path?: string; error?: string }> {
  if (!/^https:\/\//i.test(url)) return { error: "media_url tiene que empezar con https://" };
  const res = await fetch(url, { redirect: "follow" }).catch(() => null);
  if (!res || !res.ok) return { error: "No se pudo bajar el archivo de media_url." };
  const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = TIPOS_MEDIA[tipo];
  if (!ext) return { error: `Formato no soportado (${tipo || "desconocido"}). ${FORMATOS}` };
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) return { error: "El archivo supera los 50 MB." };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return { error: "El archivo supera los 50 MB." };
  const path = nuevoPath(presupuestoId, ext);
  const { error: e } = await createSupabaseAdminClient().storage.from(BUCKET_PORTAL).upload(path, buf, { contentType: tipo });
  return e ? { error: `No se pudo guardar el archivo: ${e.message}` } : { path };
}

export async function POST(req: Request) {
  if (!autorizado(req)) return error("No autorizado.", 401);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const accion = typeof body.accion === "string" ? body.accion : "";
  const sb = createSupabaseAdminClient();

  if (accion === "obras") {
    const buscar = typeof body.buscar === "string" ? body.buscar.trim().slice(0, 80) : "";
    let q = sb.from("presupuestos").select("id,nombre_obra,nombre_cliente,created_at").order("created_at", { ascending: false }).limit(40);
    if (buscar) q = q.or(`nombre_obra.ilike.%${buscar.replace(/[%,()]/g, "")}%,nombre_cliente.ilike.%${buscar.replace(/[%,()]/g, "")}%`);
    const { data: obras } = await q;
    const ids = (obras ?? []).map((o) => o.id);
    const { data: portales } = ids.length
      ? await sb.from("obra_portal").select("presupuesto_id,titulo,activo,pin_hash").in("presupuesto_id", ids)
      : { data: [] };
    const porId = new Map((portales ?? []).map((p) => [p.presupuesto_id, p]));
    return NextResponse.json({
      ok: true,
      obras: (obras ?? []).map((o) => {
        const p = porId.get(o.id);
        return { presupuesto_id: o.id, obra: o.nombre_obra, cliente: o.nombre_cliente, portal: p ? { titulo: p.titulo, activo: p.activo, con_clave: Boolean(p.pin_hash) } : null };
      }),
    });
  }

  const id = typeof body.presupuesto_id === "string" ? body.presupuesto_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error("Falta presupuesto_id (usá la acción obras para buscarlo).");
  const { data: pres } = await sb.from("presupuestos").select("id,nombre_obra,nombre_cliente").eq("id", id).maybeSingle();
  if (!pres) return error("Obra no encontrada.", 404);

  if (accion === "estado") {
    const portal = await portalPorObra(id);
    if (!portal) return NextResponse.json({ ok: true, obra: pres, portal: null });
    const vista = await cargarVistaPortal(portal, { borradores: true });
    return NextResponse.json({
      ok: true,
      obra: pres,
      portal: { titulo: portal.titulo, activo: portal.activo, con_clave: Boolean(portal.pin_hash), mostrar_pagos: portal.mostrar_pagos },
      rubros: vista.rubros,
      agenda: vista.agenda,
      registros: vista.registros.map((r) => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, fecha: r.fecha, estado: r.estado, rubro_id: r.rubroId })),
    });
  }

  if (accion === "acceso_crear") {
    const titulo = typeof body.titulo === "string" ? body.titulo.trim().slice(0, 200) : "";
    if (!titulo) return error("Falta titulo: es el nombre que el cliente escribe para entrar.");
    const clave = typeof body.clave === "string" && body.clave.trim() ? body.clave.trim() : claveNueva();
    for (const paso of [
      { accion: "crear" },
      { accion: "config", titulo },
      { accion: "pin", clave },
      { accion: "config", activo: true },
    ]) {
      const r = await ejecutarAccionPortal(id, pres, paso, { origen: "bot" });
      if (r.error) return error(r.error, r.status);
    }
    const mensaje = `Te paso el acceso a tu obra:\n${ENTRADA}\nObra: ${titulo}\nContraseña: ${clave}`;
    return NextResponse.json({ ok: true, entrada: ENTRADA, obra: titulo, clave, mensaje });
  }

  if (accion === "subida_crear") {
    const t = tipoPorNombre(body.media_nombre);
    if (t.error) return error(t.error);
    const path = nuevoPath(id, t.ext!);
    const { data, error: e } = await sb.storage.from(BUCKET_PORTAL).createSignedUploadUrl(path);
    if (e || !data) return error(`No se pudo preparar la subida: ${e?.message ?? "sin respuesta"}`, 500);
    return NextResponse.json({
      ok: true,
      upload_url: data.signedUrl,
      media_path: path,
      content_type: t.tipo,
      instrucciones: "PUT a upload_url con los bytes del archivo (Content-Type: content_type, hasta 50 MB). Después registro_crear con este media_path.",
    });
  }

  if (accion === "registro_crear") {
    if (typeof body.media_base64 === "string" && body.media_base64) {
      const m = await guardarBase64(body.media_base64, body.media_nombre, id);
      if (m.error) return error(m.error);
      body.media_path = m.path;
    } else if (typeof body.media_url === "string" && body.media_url) {
      const m = await bajarMedia(body.media_url, id);
      if (m.error) return error(m.error);
      body.media_path = m.path;
    } else if (body.media_path !== undefined && body.media_path !== null && body.media_path !== "") {
      // Sólo paths que salieron de subida_crear para esta obra, y que el archivo exista.
      const mp = typeof body.media_path === "string" ? body.media_path.trim() : "";
      if (!new RegExp(`^portal/${id}/[0-9]+-[0-9a-f]{6}\\.[a-z0-9]+$`).test(mp)) return error("media_path inválido: usá el que devolvió subida_crear.");
      const nombre = mp.split("/").pop()!;
      const { data: hay } = await sb.storage.from(BUCKET_PORTAL).list(`portal/${id}`, { search: nombre, limit: 1 });
      if (!hay?.some((f) => f.name === nombre)) return error("El archivo de media_path no está subido todavía (hacé el PUT a upload_url primero).");
      body.media_path = mp;
    }
    delete body.media_base64;
  }

  if (["pin", "crear", "firmar"].includes(accion)) return error("Esa acción no está habilitada para el bot. Usá acceso_crear.");
  const r = await ejecutarAccionPortal(id, pres, body, { origen: "bot" });
  if (r.error) return error(r.error, r.status);
  return NextResponse.json({ ok: true });
}
