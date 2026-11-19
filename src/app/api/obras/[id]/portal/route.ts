import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cargarVistaPortal, portalPorObra } from "@/lib/portal/datos";
import { ejecutarAccionPortal } from "@/lib/portal/acciones";

/**
 * /api/obras/[id]/portal — el panel de Eze para el portal del cliente.
 * [id] = presupuesto_id. Detrás del middleware (sesión de Supabase); las tablas
 * obra_portal_* sólo se tocan con service role.
 *
 * GET  → estado completo (config, rubros, registros con borradores, agenda).
 * POST → { accion, ... }:
 *   config            activar/desactivar, datos visibles, mostrar pagos
 *   crear             crea el portal (apagado y sin contraseña) si no existe
 *   pin               { clave } fija la contraseña que eligió Eze y vence las sesiones
 *   rubros_agregar    { nombres: string[] }
 *   rubro_guardar     { rubro_id, nombre?, tareas?, estado? }
 *   rubro_borrar      { rubro_id }
 *   firmar            { filename } → path + token para subir directo al bucket
 *   registro_crear    { tipo, titulo, ... } — ticket exige foto e importe ({ importe, moneda })
 *   registro_publicar { registro_id }
 *   registro_borrar   { registro_id }
 *   agenda_crear      { fecha, hora?, titulo, quien?, detalle? }
 *   agenda_borrar     { evento_id }
 */

type Params = { params: Promise<{ id: string }> };

const error = (mensaje: string, status = 400) => NextResponse.json({ ok: false, error: mensaje }, { status });

async function estado(presupuestoId: string) {
  const portal = await portalPorObra(presupuestoId);
  if (!portal) return { portal: null, vista: null };
  const vista = await cargarVistaPortal(portal, { borradores: true });
  return {
    portal: {
      slug: portal.slug,
      activo: portal.activo,
      tiene_pin: Boolean(portal.pin_hash),
      titulo: portal.titulo,
      direccion: portal.direccion,
      fecha_inicio: portal.fecha_inicio,
      fecha_entrega: portal.fecha_entrega,
      mostrar_pagos: portal.mostrar_pagos,
    },
    vista,
  };
}

export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const sb = createSupabaseAdminClient();
  const { data: pres } = await sb.from("presupuestos").select("id,nombre_obra,nombre_cliente").eq("id", id).maybeSingle();
  if (!pres) return error("Obra no encontrada.", 404);
  return NextResponse.json({ ok: true, obra: pres, ...(await estado(id)) });
}

export async function POST(req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = createSupabaseAdminClient();
  const { data: pres } = await sb.from("presupuestos").select("id,nombre_obra,nombre_cliente").eq("id", id).maybeSingle();
  if (!pres) return error("Obra no encontrada.", 404);
  const r = await ejecutarAccionPortal(id, pres as { nombre_obra?: string | null }, body);
  if (r.error) return error(r.error, r.status);
  return NextResponse.json({ ok: true, obra: pres, ...(await estado(id)), firma: r.firma });
}
