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
 *   obra_crear       { titulo, cliente?, direccion? }   → da de alta la obra (como "+ NUEVA OBRA" del cockpit) y devuelve
 *                                                         su presupuesto_id; si ya hay una con ese título devuelve esa (existente: true)
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
 * Pagos (mismo formato que Forna: total, pagado, saldo, "Ver el presupuesto" y Recibos):
 *   presupuesto_subir { presupuesto_id, importe, moneda: ARS|USD, pdf_base64 | pdf_path }  → fija el total a cobrar,
 *                      sube el PDF como presupuesto de la obra y prende la solapa Pagos.
 *   pago_crear        { presupuesto_id, fecha, importe, moneda, medio: efectivo|transferencia, pdf_base64 | pdf_path }
 *                      → suma a pagado (ingreso cobrado de la obra, sin cuenta: no toca cajas) y el PDF va a Recibos.
 *   pago_borrar       { presupuesto_id, pago_id }  → para corregir un pago mal cargado.
 *   (pdf_path = el media_path de subida_crear con media_nombre *.pdf, para PDFs de más de ~3 MB.)
 * registro_editar { presupuesto_id, registro_id, titulo?, texto?, fecha?, estado?, rubro_id?, importe?, media_base64+media_nombre | media_path? }
 *   corrige un registro ya cargado (publicado o borrador).
 * Lo que carga el bot entra como BORRADOR salvo que mande estado: "publicado".
 */

const MAX_BYTES = 50 * 1024 * 1024;
const ENTRADA = "https://portal.ravnconstrucciones.com.ar";
const TIPOS_MEDIA: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  "application/pdf": "pdf",
};

const POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", pdf: "application/pdf",
};
const FORMATOS = "Mandá foto JPG/PNG/HEIC, video MP4/MOV o PDF.";

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

/** "3.500.000", "$ 3.500.000,50", 3500000 → número; NaN si no se entiende. */
function importeOk(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  const t = v.replace(/[^0-9.,]/g, "");
  if (!t) return NaN;
  return Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/[.,]/g, ""));
}

/** "14/11/2026" o "2026-11-14" → "2026-11-14". */
function fechaIso(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** Path de un archivo subido para esta obra que existe en storage, o error. */
async function pathSubido(mp: unknown, presupuestoId: string): Promise<{ path?: string; error?: string }> {
  const p = typeof mp === "string" ? mp.trim() : "";
  if (!new RegExp(`^portal/${presupuestoId}/[0-9]+-[0-9a-f]{6}\\.[a-z0-9]+$`).test(p)) return { error: "Path inválido: usá el media_path que devolvió subida_crear." };
  const nombre = p.split("/").pop()!;
  const { data } = await createSupabaseAdminClient().storage.from(BUCKET_PORTAL).list(`portal/${presupuestoId}`, { search: nombre, limit: 1 });
  if (!data?.some((f) => f.name === nombre)) return { error: "El archivo no está subido todavía (hacé el PUT a upload_url primero)." };
  return { path: p };
}

/** PDF por pdf_base64 o pdf_path. */
async function pdfDe(body: Record<string, unknown>, presupuestoId: string, nombre: string): Promise<{ path?: string; error?: string }> {
  if (typeof body.pdf_base64 === "string" && body.pdf_base64) return guardarBase64(body.pdf_base64, nombre, presupuestoId);
  if (body.pdf_path) {
    const r = await pathSubido(body.pdf_path, presupuestoId);
    if (r.path && !r.path.endsWith(".pdf")) return { error: "pdf_path tiene que ser un .pdf." };
    return r;
  }
  return { error: "Falta el PDF: mandá pdf_base64 o pdf_path (de subida_crear)." };
}

async function obraIdDe(presupuestoId: string): Promise<string | null> {
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("obras").select("id").eq("presupuesto_id", presupuestoId).maybeSingle();
  if (data) return String(data.id);
  const ins = await sb.from("obras").insert({ presupuesto_id: presupuestoId }).select("id").single();
  return ins.data ? String(ins.data.id) : null;
}

const pesos = (n: number, moneda: string) =>
  `${moneda === "USD" ? "US$" : "$"} ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

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

  if (accion === "obra_crear") {
    const titulo = typeof body.titulo === "string" ? body.titulo.trim().slice(0, 200) : "";
    const cliente = typeof body.cliente === "string" ? body.cliente.trim().slice(0, 200) : "";
    const direccion = typeof body.direccion === "string" ? body.direccion.trim().slice(0, 300) : "";
    if (!titulo) return error("Falta titulo: el nombre de la obra.");

    // Si el bot reintenta, no duplicar: misma obra (título exacto, sin importar mayúsculas) → devolver esa.
    const { data: previas } = await sb.from("presupuestos").select("id,nombre_obra,nombre_cliente").ilike("nombre_obra", titulo.replace(/[%_\\]/g, "\\$&")).limit(1);
    if (previas?.length) {
      const p = previas[0];
      return NextResponse.json({ ok: true, existente: true, presupuesto_id: p.id, obra: p.nombre_obra, cliente: p.nombre_cliente });
    }

    const { data: nueva, error: e } = await sb
      .from("presupuestos")
      .insert({
        nombre_obra: titulo,
        nombre_cliente: cliente || titulo,
        ...(direccion ? { domicilio: direccion } : {}),
        presupuesto_aprobado: true,
        estado: "en_curso",
        fecha: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (e || !nueva) return error(`No se pudo crear la obra: ${e?.message ?? "sin respuesta"}`, 500);
    const presupuestoId = String(nueva.id);

    // El trigger presupuestos_after_insert_obra crea la fila en obras; se asegura igual (mismo patrón que /api/obras).
    const { data: obra } = await sb.from("obras").select("id").eq("presupuesto_id", presupuestoId).maybeSingle();
    if (!obra) {
      const ins = await sb.from("obras").insert({ presupuesto_id: presupuestoId });
      if (ins.error) return error(`Se creó el presupuesto pero no la obra: ${ins.error.message}`, 500);
    }
    return NextResponse.json({ ok: true, existente: false, presupuesto_id: presupuestoId, obra: titulo, cliente: cliente || titulo, direccion: direccion || null });
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
      pagos: vista.pagos ? { resumen: vista.pagos.resumen, detalle: vista.pagos.detalle, recibos: vista.pagos.recibos.map((r) => r.titulo) } : null,
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

  if (accion === "presupuesto_subir") {
    const importe = importeOk(body.importe);
    if (!(importe > 0)) return error("Falta importe (total del presupuesto).");
    const moneda = body.moneda === "USD" ? "USD" : "ARS";
    const pdf = await pdfDe(body, id, "presupuesto.pdf");
    if (pdf.error) return error(pdf.error);
    const obraId = await obraIdDe(id);
    if (!obraId) return error("No se pudo ubicar la obra.", 500);
    const { error: e1 } = await sb
      .from("obras")
      .update(moneda === "USD" ? { monto_total_a_cobrar_usd: importe } : { monto_total_a_cobrar_ars: importe, monto_total_a_cobrar_usd: null })
      .eq("id", obraId);
    if (e1) return error(e1.message, 500);
    const { error: e2 } = await sb.from("obra_archivos").insert({ presupuesto_id: id, tipo: "presupuesto", titulo: `Presupuesto ${pesos(importe, moneda)}`, storage_path: pdf.path });
    if (e2) return error(e2.message, 500);
    await sb.from("obra_portal").update({ mostrar_pagos: true }).eq("presupuesto_id", id);
    return NextResponse.json({ ok: true, total: importe, moneda, mostrar_pagos: true });
  }

  if (accion === "pago_crear") {
    const importe = importeOk(body.importe);
    if (!(importe > 0)) return error("Falta importe del pago.");
    const fecha = fechaIso(body.fecha);
    if (!fecha) return error("Falta fecha (14/11/2026 o 2026-11-14).");
    const moneda = body.moneda === "USD" ? "USD" : "ARS";
    const medio = body.medio === "transferencia" ? "transferencia" : body.medio === "efectivo" ? "efectivo" : "";
    if (!medio) return error("medio tiene que ser efectivo o transferencia.");
    const pdf = await pdfDe(body, id, "recibo.pdf");
    if (pdf.error) return error(pdf.error);
    const obraId = await obraIdDe(id);
    if (!obraId) return error("No se pudo ubicar la obra.", 500);
    const { data: pago, error: e1 } = await sb
      .from("cashflow_items")
      .insert({
        obra_id: obraId,
        tipo: "ingreso",
        categoria: "cuota_avance",
        descripcion: `Pago en ${medio} (portal)`,
        monto_proyectado: importe,
        fecha_proyectada: fecha,
        monto_real: importe,
        fecha_real: fecha,
        estado: "cobrado",
        moneda,
        monto_usd: moneda === "USD" ? importe : null,
        adjunto_path: pdf.path,
        notas: "Cargado por Portal Ravn Manager",
      })
      .select("id")
      .single();
    if (e1 || !pago) return error(e1?.message ?? "No se pudo cargar el pago.", 500);
    const [a, m, d] = fecha.split("-");
    const { error: e2 } = await sb.from("obra_archivos").insert({
      presupuesto_id: id,
      tipo: "documento",
      titulo: `Recibo ${d}/${m}/${a} · ${pesos(importe, moneda)} · ${medio}`,
      storage_path: pdf.path,
    });
    if (e2) return error(`Se cargó el pago pero no el recibo: ${e2.message}`, 500);
    const portal = await portalPorObra(id);
    const vista = portal ? await cargarVistaPortal({ ...portal, mostrar_pagos: true }) : null;
    return NextResponse.json({ ok: true, pago_id: pago.id, resumen: vista?.pagos?.resumen ?? null });
  }

  if (accion === "pago_borrar") {
    const pagoId = typeof body.pago_id === "string" ? body.pago_id.trim() : "";
    const obraId = await obraIdDe(id);
    const { data: fila } = await sb.from("cashflow_items").select("id,adjunto_path,notas").eq("id", pagoId).eq("obra_id", obraId ?? "").maybeSingle();
    if (!fila) return error("Pago no encontrado en esta obra.", 404);
    if (fila.notas !== "Cargado por Portal Ravn Manager") return error("Ese pago no lo cargó el bot: se corrige a mano.");
    await sb.from("cashflow_items").update({ deleted_at: new Date().toISOString() }).eq("id", pagoId);
    if (fila.adjunto_path) await sb.from("obra_archivos").delete().eq("presupuesto_id", id).eq("storage_path", fila.adjunto_path);
    return NextResponse.json({ ok: true });
  }

  if (accion === "registro_editar") {
    const registroId = typeof body.registro_id === "string" ? body.registro_id.trim() : "";
    const { data: fila } = await sb.from("obra_portal_registros").select("id,tipo,media_path").eq("id", registroId).eq("presupuesto_id", id).maybeSingle();
    if (!fila) return error("Registro no encontrado en esta obra.", 404);
    const cambios: Record<string, unknown> = {};
    const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
    if (body.titulo !== undefined) { const t = txt(body.titulo, 200); if (!t) return error("El título no puede quedar vacío."); cambios.titulo = t; }
    if (body.texto !== undefined) cambios.texto = txt(body.texto, 4000) || null;
    if (body.fecha !== undefined) { const f = fechaIso(body.fecha); if (!f) return error("fecha inválida."); cambios.fecha = f; }
    if (body.estado !== undefined) { if (!["borrador", "publicado"].includes(String(body.estado))) return error("estado: borrador o publicado."); cambios.estado = body.estado; }
    if (body.rubro_id !== undefined) cambios.rubro_id = txt(body.rubro_id, 60) || null;
    if (body.importe !== undefined) { const n = importeOk(body.importe); if (!(n > 0)) return error("importe inválido."); cambios.importe = n; }
    let nuevoPath: string | undefined;
    if (typeof body.media_base64 === "string" && body.media_base64) {
      const r = await guardarBase64(body.media_base64, body.media_nombre, id);
      if (r.error) return error(r.error);
      nuevoPath = r.path;
    } else if (body.media_path) {
      const r = await pathSubido(body.media_path, id);
      if (r.error) return error(r.error);
      nuevoPath = r.path;
    }
    if (nuevoPath) {
      cambios.media_path = nuevoPath;
      cambios.media_tipo = /\.(mp4|mov|webm)$/.test(nuevoPath) ? "video" : "imagen";
    }
    if (!Object.keys(cambios).length) return error("No mandaste nada para cambiar.");
    const { error: e } = await sb.from("obra_portal_registros").update(cambios).eq("id", registroId).eq("presupuesto_id", id);
    if (e) return error(e.message, 500);
    if (nuevoPath && fila.media_path && fila.media_path !== nuevoPath) await sb.storage.from(BUCKET_PORTAL).remove([fila.media_path]);
    return NextResponse.json({ ok: true, cambios: Object.keys(cambios) });
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
      const r = await pathSubido(body.media_path, id);
      if (r.error) return error(r.error);
      body.media_path = r.path;
    }
    delete body.media_base64;
  }

  if (["pin", "crear", "firmar"].includes(accion)) return error("Esa acción no está habilitada para el bot. Usá acceso_crear.");
  const r = await ejecutarAccionPortal(id, pres, body, { origen: "bot" });
  if (r.error) return error(r.error, r.status);
  return NextResponse.json({ ok: true });
}
