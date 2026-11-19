import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cargarEconomiaObras } from "@/lib/economia-obras-server";
import { esMovimientoReal, type MovimientoObra } from "@/lib/economia-obras";
import { parseNum } from "@/lib/cashflow-compute";
import {
  hoyBuenosAires,
  resumenPagos,
  type EventoAgenda,
  type MaterialRegistro,
  type PagoPortal,
  type ReciboPortal,
  type RegistroPortal,
  type RubroPortal,
  type VistaPortal,
} from "./tipos";

/**
 * Lectura del portal del cliente. Todo pasa por el service role: las tablas
 * obra_portal_* están cerradas para anon/authenticated, y quien llama ya validó
 * la cookie del cliente (rutas /o) o la sesión de Eze (rutas /obras).
 */

export const BUCKET_PORTAL = "obra-archivos";
const EXPIRA_S = 3600;

export type PortalRow = {
  presupuesto_id: string;
  slug: string;
  pin_hash: string | null;
  activo: boolean;
  titulo: string | null;
  direccion: string | null;
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  mostrar_pagos: boolean;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  sesion_version: number;
};

type RegistroRow = {
  id: string;
  rubro_id: string | null;
  tipo: RegistroPortal["tipo"];
  titulo: string;
  texto: string | null;
  fecha: string;
  media_path: string | null;
  media_tipo: "imagen" | "video" | null;
  link_externo: string | null;
  material: MaterialRegistro | null;
  estado: "borrador" | "publicado";
  origen: "app" | "bot";
  importe: number | string | null;
  moneda: "ARS" | "USD" | null;
};

const CONCEPTOS: Record<string, string> = {
  anticipo: "Anticipo",
  cuota_avance: "Cuota de avance",
};

export async function portalPorSlug(slug: string): Promise<PortalRow | null> {
  if (!/^[a-z0-9-]{4,60}$/.test(slug)) return null;
  const { data } = await createSupabaseAdminClient()
    .from("obra_portal")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as PortalRow | null) ?? null;
}

/** Nombre que ve el cliente: el título del portal o, si no hay, el de la obra. */
export async function nombreObraPortal(portal: PortalRow): Promise<string> {
  const titulo = portal.titulo?.trim();
  if (titulo) return titulo;
  const { data } = await createSupabaseAdminClient()
    .from("presupuestos")
    .select("nombre_obra")
    .eq("id", portal.presupuesto_id)
    .maybeSingle();
  return (data as { nombre_obra?: string | null } | null)?.nombre_obra?.trim() || "Tu obra";
}

export async function portalPorObra(presupuestoId: string): Promise<PortalRow | null> {
  const { data } = await createSupabaseAdminClient()
    .from("obra_portal")
    .select("*")
    .eq("presupuesto_id", presupuestoId)
    .maybeSingle();
  return (data as PortalRow | null) ?? null;
}

/**
 * Arma lo que se muestra de una obra. `borradores` sólo lo pide el panel de
 * Eze; el cliente recibe únicamente lo publicado. `pagos` respeta el
 * interruptor de la obra salvo que el panel los fuerce para previsualizar.
 */
export async function cargarVistaPortal(
  portal: PortalRow,
  opts: { borradores?: boolean } = {}
): Promise<VistaPortal> {
  const sb = createSupabaseAdminClient();
  const id = portal.presupuesto_id;

  let consultaRegistros = sb
    .from("obra_portal_registros")
    .select("id,rubro_id,tipo,titulo,texto,fecha,media_path,media_tipo,link_externo,material,estado,origen,importe,moneda")
    .eq("presupuesto_id", id)
    .order("fecha", { ascending: false })
    .order("creado_at", { ascending: false });
  if (!opts.borradores) consultaRegistros = consultaRegistros.eq("estado", "publicado");

  const [rubrosRes, registrosRes, agendaRes, economia] = await Promise.all([
    sb.from("obra_portal_rubros").select("id,nombre,tareas,estado,orden").eq("presupuesto_id", id).order("orden"),
    consultaRegistros,
    sb.from("obra_portal_agenda").select("id,fecha,hora,titulo,quien,detalle").eq("presupuesto_id", id).order("fecha"),
    cargarEconomiaObras(id),
  ]);

  const rubros = (rubrosRes.data ?? []) as RubroPortal[];

  const filas = (registrosRes.data ?? []) as RegistroRow[];
  const paths = filas.map((f) => f.media_path).filter((p): p is string => Boolean(p));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET_PORTAL).createSignedUrls(paths, EXPIRA_S);
    for (const f of data ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  const registros: RegistroPortal[] = filas.map((f) => ({
    id: f.id,
    rubroId: f.rubro_id,
    tipo: f.tipo,
    titulo: f.titulo,
    texto: f.texto,
    fecha: f.fecha,
    mediaUrl: f.media_path ? urls.get(f.media_path) ?? null : null,
    mediaTipo: f.media_tipo,
    linkExterno: f.link_externo,
    material: f.material,
    estado: f.estado,
    origen: f.origen,
    importe: f.importe == null ? null : parseNum(f.importe),
    moneda: f.moneda === "USD" ? "USD" : "ARS",
  }));

  const eco = economia.proyectos[0] ?? null;

  let pagos: VistaPortal["pagos"] = null;
  if (portal.mostrar_pagos && eco) {
    const resumen = resumenPagos(eco);
    if (resumen) {
      let detalle: PagoPortal[] = [];
      if (eco.obraId) {
        const { data } = await sb
          .from("cashflow_items")
          .select("id,obra_id,tipo,categoria,monto_real,fecha_real,estado,deleted_at,moneda,monto_usd")
          .eq("obra_id", eco.obraId)
          .eq("tipo", "ingreso");
        detalle = ((data ?? []) as MovimientoObra[])
          .filter(esMovimientoReal)
          .map((m) => {
            const usd = m.moneda === "USD";
            return {
              id: m.id,
              fecha: String(m.fecha_real),
              monto: parseNum(usd ? m.monto_usd ?? m.monto_real : m.monto_real),
              moneda: usd ? ("USD" as const) : ("ARS" as const),
              concepto: CONCEPTOS[m.categoria ?? ""] ?? "Pago",
            };
          })
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
      }
      const [recibos, presupuestoUrl] = await Promise.all([recibosObra(id), presupuestoObra(id)]);
      pagos = { resumen, detalle, recibos, presupuestoUrl };
    }
  }

  return {
    obra: {
      nombre: portal.titulo?.trim() || eco?.nombre || "Tu obra",
      cliente: eco?.cliente ?? null,
      direccion: portal.direccion,
      inicio: portal.fecha_inicio,
      entrega: portal.fecha_entrega,
      fotoUrl: eco?.fotoUrl ?? null,
    },
    rubros,
    registros,
    agenda: (agendaRes.data ?? []) as EventoAgenda[],
    pagos,
    hoy: hoyBuenosAires(),
  };
}

/** El último presupuesto emitido (PDF en obra_archivos, tipo presupuesto), firmado por una hora. */
async function presupuestoObra(presupuestoId: string): Promise<string | null> {
  const sb = createSupabaseAdminClient();
  const { data } = await sb
    .from("obra_archivos")
    .select("storage_path")
    .eq("presupuesto_id", presupuestoId)
    .eq("tipo", "presupuesto")
    .not("storage_path", "is", null)
    .order("creado_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (data as { storage_path?: string | null } | null)?.storage_path;
  if (!path) return null;
  const { data: firmada } = await sb.storage.from(BUCKET_PORTAL).createSignedUrl(path, EXPIRA_S);
  return firmada?.signedUrl ?? null;
}

/**
 * Recibos que RAVN ya emitió para la obra: PDFs subidos a obra_archivos con
 * "Recibo" en el título o en el nombre del archivo (no existe un tipo propio).
 * Sólo se muestran junto a los pagos, así que respetan el mismo interruptor.
 */
async function recibosObra(presupuestoId: string): Promise<ReciboPortal[]> {
  const sb = createSupabaseAdminClient();
  const { data } = await sb
    .from("obra_archivos")
    .select("id,titulo,storage_path,creado_at")
    .eq("presupuesto_id", presupuestoId)
    .or("titulo.ilike.recibo%,storage_path.ilike.%/recibo%")
    .order("creado_at", { ascending: false });
  const filas = ((data ?? []) as { id: string; titulo: string | null; storage_path: string | null; creado_at: string }[]).filter(
    (f) => f.storage_path
  );
  if (!filas.length) return [];
  const { data: firmadas } = await sb.storage.from(BUCKET_PORTAL).createSignedUrls(
    filas.map((f) => f.storage_path as string),
    EXPIRA_S
  );
  const urls = new Map((firmadas ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl]));
  return filas
    .map((f) => ({
      id: f.id,
      titulo: f.titulo?.trim() || "Recibo",
      fecha: f.creado_at.slice(0, 10),
      url: urls.get(f.storage_path as string) ?? "",
    }))
    .filter((r) => r.url);
}
