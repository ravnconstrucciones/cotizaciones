import { randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { BUCKET_PORTAL, portalPorObra } from "./datos";
import { CLAVE_MAX, CLAVE_MIN, claveValida, hashPin } from "./sesion";
import { importeArgentino, slugObra, type EstadoRubro, type TipoRegistro } from "./tipos";

/**
 * Escrituras del portal del cliente, compartidas por el panel de Eze
 * (/api/obras/[id]/portal) y el bot de Grok (/api/portal-bot). Quien llama ya
 * validó la sesión de Eze o la clave del bot. Devuelve error o la firma de subida.
 */

export type ResultadoAccion = { error?: string; status?: number; firma?: { path: string; token: string } };
const falla = (error: string, status = 400): ResultadoAccion => ({ error, status });

const ESTADOS: EstadoRubro[] = ["pendiente", "en_curso", "terminado"];
const TIPOS: TipoRegistro[] = ["avance", "video", "resuelto", "material", "ticket"];
const EXT_IMAGEN = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const EXT_VIDEO = new Set(["mp4", "mov", "m4v", "webm"]);

const texto = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const fechaOk = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function ejecutarAccionPortal(
  id: string,
  pres: { nombre_obra?: string | null },
  body: Record<string, unknown>,
  opts: { origen?: "app" | "bot" } = {}
): Promise<ResultadoAccion> {
  const accion = texto(body.accion, 40);
  const sb = createSupabaseAdminClient();
  let portal = await portalPorObra(id);
  let firma: { path: string; token: string } | undefined;

  // El portal nace apagado y sin contraseña la primera vez que Eze toca algo.
  if (!portal) {
    const nombre = String((pres as { nombre_obra?: string | null }).nombre_obra ?? "obra");
    const { error: e } = await sb.from("obra_portal").insert({
      presupuesto_id: id,
      slug: slugObra(nombre, randomBytes(3).toString("hex")),
    });
    if (e) return falla(e.message, 500);
    portal = await portalPorObra(id);
    if (!portal) return falla("No se pudo crear el portal.", 500);
  }

  const ahora = new Date().toISOString();

  switch (accion) {
    case "config": {
      const cambios: Record<string, unknown> = { updated_at: ahora };
      if (typeof body.activo === "boolean") {
        if (body.activo && !portal.pin_hash) return falla("Definí la contraseña antes de activar el portal.");
        cambios.activo = body.activo;
      }
      if (typeof body.mostrar_pagos === "boolean") cambios.mostrar_pagos = body.mostrar_pagos;
      if ("titulo" in body) cambios.titulo = texto(body.titulo, 200) || null;
      if ("direccion" in body) cambios.direccion = texto(body.direccion, 200) || null;
      if ("fecha_inicio" in body) cambios.fecha_inicio = fechaOk(body.fecha_inicio);
      if ("fecha_entrega" in body) cambios.fecha_entrega = fechaOk(body.fecha_entrega);
      const { error: e } = await sb.from("obra_portal").update(cambios).eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      break;
    }

    case "crear":
      break;

    case "pin": {
      const clave = typeof body.clave === "string" ? body.clave.trim() : "";
      if (!claveValida(clave)) return falla(`La contraseña tiene que tener entre ${CLAVE_MIN} y ${CLAVE_MAX} caracteres.`);
      const { error: e } = await sb
        .from("obra_portal")
        .update({
          pin_hash: hashPin(clave),
          sesion_version: portal.sesion_version + 1,
          intentos_fallidos: 0,
          bloqueado_hasta: null,
          updated_at: ahora,
        })
        .eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      break;
    }

    case "rubros_agregar": {
      const nombres = (Array.isArray(body.nombres) ? body.nombres : [])
        .map((n) => texto(n, 80))
        .filter(Boolean)
        .slice(0, 30);
      if (!nombres.length) return falla("Escribí al menos un rubro.");
      const { count } = await sb.from("obra_portal_rubros").select("id", { count: "exact", head: true }).eq("presupuesto_id", id);
      const { error: e } = await sb
        .from("obra_portal_rubros")
        .insert(nombres.map((nombre, i) => ({ presupuesto_id: id, nombre, orden: (count ?? 0) + i + 1 })));
      if (e) return falla(e.message, 500);
      break;
    }

    case "rubro_guardar": {
      const rubroId = texto(body.rubro_id, 60);
      if (!rubroId) return falla("Falta el rubro.");
      const cambios: Record<string, unknown> = { updated_at: ahora };
      if ("nombre" in body && texto(body.nombre, 80)) cambios.nombre = texto(body.nombre, 80);
      if ("tareas" in body) cambios.tareas = texto(body.tareas, 1500) || null;
      if (typeof body.estado === "string" && ESTADOS.includes(body.estado as EstadoRubro)) cambios.estado = body.estado;
      const { error: e } = await sb.from("obra_portal_rubros").update(cambios).eq("id", rubroId).eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      break;
    }

    case "rubro_borrar": {
      const { error: e } = await sb.from("obra_portal_rubros").delete().eq("id", texto(body.rubro_id, 60)).eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      break;
    }

    case "firmar": {
      const nombre = texto(body.filename, 200);
      const ext = nombre.includes(".") ? nombre.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
      if (!EXT_IMAGEN.has(ext) && !EXT_VIDEO.has(ext)) return falla("Formato no soportado. Subí una foto (JPG, PNG, HEIC) o un video (MP4, MOV).", 415);
      const path = `portal/${id}/${Date.now()}-${randomBytes(3).toString("hex")}.${ext}`;
      const { data, error: e } = await sb.storage.from(BUCKET_PORTAL).createSignedUploadUrl(path);
      if (e || !data?.token) return falla(e?.message ?? "No se pudo preparar la subida.", 500);
      firma = { path, token: data.token };
      break;
    }

    case "registro_crear": {
      const titulo = texto(body.titulo, 200);
      if (!titulo) return falla("El registro necesita un título.");
      const tipo = TIPOS.includes(body.tipo as TipoRegistro) ? (body.tipo as TipoRegistro) : "avance";
      const mediaPath = texto(body.media_path, 300);
      if (mediaPath && !mediaPath.startsWith(`portal/${id}/`)) return falla("El archivo no pertenece a esta obra.");
      const ext = mediaPath.split(".").pop() ?? "";
      const link = texto(body.link_externo, 500);
      if (link && !/^https:\/\//i.test(link)) return falla("El enlace tiene que empezar con https://");
      const m = (body.material ?? {}) as Record<string, unknown>;
      const material =
        tipo === "material"
          ? { producto: texto(m.producto, 200), marca: texto(m.marca, 200), color: texto(m.color, 200), estado: texto(m.estado, 60) }
          : null;
      let importe: number | null = null;
      if (tipo === "ticket") {
        if (!mediaPath || EXT_VIDEO.has(ext)) return falla("El ticket necesita la foto del comprobante.");
        importe = importeArgentino(body.importe);
        if (!Number.isFinite(importe) || importe <= 0) return falla("Poné el importe del ticket.");
      }
      const { error: e } = await sb.from("obra_portal_registros").insert({
        presupuesto_id: id,
        rubro_id: texto(body.rubro_id, 60) || null,
        tipo,
        titulo,
        texto: texto(body.texto, 4000) || null,
        fecha: fechaOk(body.fecha) ?? undefined,
        media_path: mediaPath || null,
        media_tipo: mediaPath && ext !== "pdf" ? (EXT_VIDEO.has(ext) ? "video" : "imagen") : null,
        link_externo: link || null,
        material,
        importe,
        moneda: tipo === "ticket" && body.moneda === "USD" ? "USD" : "ARS",
        estado: body.estado === "borrador" || (opts.origen === "bot" && body.estado !== "publicado") ? "borrador" : "publicado",
        origen: opts.origen ?? "app",
      });
      if (e) return falla(e.message, 500);
      break;
    }

    case "registro_publicar": {
      const { error: e } = await sb
        .from("obra_portal_registros")
        .update({ estado: "publicado" })
        .eq("id", texto(body.registro_id, 60))
        .eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      break;
    }

    case "registro_borrar": {
      const registroId = texto(body.registro_id, 60);
      const { data: fila } = await sb
        .from("obra_portal_registros")
        .select("media_path")
        .eq("id", registroId)
        .eq("presupuesto_id", id)
        .maybeSingle();
      const { error: e } = await sb.from("obra_portal_registros").delete().eq("id", registroId).eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      const path = (fila as { media_path?: string | null } | null)?.media_path;
      if (path) await sb.storage.from(BUCKET_PORTAL).remove([path]);
      break;
    }

    case "agenda_crear": {
      const fecha = fechaOk(body.fecha);
      const titulo = texto(body.titulo, 200);
      if (!fecha || !titulo) return falla("La agenda necesita fecha y qué va a pasar.");
      const hora = texto(body.hora, 5);
      if (hora && !/^[0-2]\d:[0-5]\d$/.test(hora)) return falla("La hora va como 09:30.");
      const { error: e } = await sb.from("obra_portal_agenda").insert({
        presupuesto_id: id,
        fecha,
        hora: hora || null,
        titulo,
        quien: texto(body.quien, 120) || null,
        detalle: texto(body.detalle, 500) || null,
      });
      if (e) return falla(e.message, 500);
      break;
    }

    case "agenda_borrar": {
      const { error: e } = await sb.from("obra_portal_agenda").delete().eq("id", texto(body.evento_id, 60)).eq("presupuesto_id", id);
      if (e) return falla(e.message, 500);
      break;
    }

    default:
      return falla("Acción desconocida. Pedí { accion: \"ayuda\" } para ver la lista.");
  }

  return { firma };
}
