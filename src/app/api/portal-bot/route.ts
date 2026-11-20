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
 * registro_crear acepta `media_url` (https, foto o video hasta 50 MB): el servidor la baja y la guarda.
 * Lo que carga el bot entra como BORRADOR salvo que mande estado: "publicado".
 */

const MAX_BYTES = 50 * 1024 * 1024;
const ENTRADA = "https://portal.ravnconstrucciones.com.ar";
const TIPOS_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

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
  if (!ext) return { error: `Formato no soportado (${tipo || "desconocido"}). Mandá foto JPG/PNG/HEIC o video MP4/MOV.` };
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) return { error: "El archivo supera los 50 MB." };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return { error: "El archivo supera los 50 MB." };
  const path = `portal/${presupuestoId}/${Date.now()}-${randomBytes(3).toString("hex")}.${ext}`;
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

  if (accion === "registro_crear" && typeof body.media_url === "string" && body.media_url) {
    const m = await bajarMedia(body.media_url, id);
    if (m.error) return error(m.error);
    body.media_path = m.path;
  }

  if (["pin", "crear", "firmar"].includes(accion)) return error("Esa acción no está habilitada para el bot. Usá acceso_crear.");
  const r = await ejecutarAccionPortal(id, pres, body, { origen: "bot" });
  if (r.error) return error(r.error, r.status);
  return NextResponse.json({ ok: true });
}
