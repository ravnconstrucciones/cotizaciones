import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { nombreObraPortal, type PortalRow } from "@/lib/portal/datos";
import { MAX_INTENTOS, MINUTOS_BLOQUEO, claveValida, crearSesion, nombreCookie, verificarPin } from "@/lib/portal/sesion";
import { normalizarNombreObra } from "@/lib/portal/tipos";

/**
 * POST /api/portal/acceso — puerta única del portal (pedido de Eze, 19/11/2026):
 * el cliente entra a /o, escribe el NOMBRE DE SU OBRA y la contraseña.
 *
 * Ruta PÚBLICA. Busca entre los portales activos con contraseña los que tienen
 * ese nombre (sin tildes, mayúsculas ni signos) y prueba la contraseña contra
 * cada uno: si dos obras se llaman igual, la contraseña decide. Mismo error
 * para nombre inexistente y contraseña equivocada, y el mismo bloqueo por obra
 * que la puerta por enlace (5 fallos → 15 minutos).
 *
 * Responde { ok, destino: "/o/<slug>" } y deja la cookie de esa obra.
 */

const ERROR_GENERICO = "El nombre de la obra o la contraseña no son correctos.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { obra?: unknown; clave?: unknown };
  const nombre = typeof body.obra === "string" ? normalizarNombreObra(body.obra.slice(0, 200)) : "";
  const clave = typeof body.clave === "string" ? body.clave.trim() : "";
  if (!nombre || !claveValida(clave)) return NextResponse.json({ ok: false, error: ERROR_GENERICO }, { status: 401 });

  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("obra_portal").select("*").eq("activo", true).not("pin_hash", "is", null);
  const portales = (data ?? []) as PortalRow[];
  const nombres = await Promise.all(portales.map((p) => nombreObraPortal(p)));
  const candidatos = portales.filter((_, i) => normalizarNombreObra(nombres[i]) === nombre);

  const ahora = Date.now();
  const habilitados = candidatos.filter((p) => !(p.bloqueado_hasta && new Date(p.bloqueado_hasta).getTime() > ahora));
  if (candidatos.length && !habilitados.length) {
    return NextResponse.json({ ok: false, error: `Demasiados intentos. Probá de nuevo en ${MINUTOS_BLOQUEO} minutos.` }, { status: 429 });
  }

  const portal = habilitados.find((p) => verificarPin(clave, p.pin_hash));
  if (!portal) {
    for (const p of habilitados) {
      const intentos = p.intentos_fallidos + 1;
      const bloquear = intentos >= MAX_INTENTOS;
      await sb
        .from("obra_portal")
        .update({
          intentos_fallidos: bloquear ? 0 : intentos,
          bloqueado_hasta: bloquear ? new Date(ahora + MINUTOS_BLOQUEO * 60_000).toISOString() : null,
        })
        .eq("presupuesto_id", p.presupuesto_id);
    }
    return NextResponse.json({ ok: false, error: ERROR_GENERICO }, { status: 401 });
  }

  if (portal.intentos_fallidos > 0 || portal.bloqueado_hasta) {
    await sb.from("obra_portal").update({ intentos_fallidos: 0, bloqueado_hasta: null }).eq("presupuesto_id", portal.presupuesto_id);
  }

  const sesion = crearSesion(portal.presupuesto_id, portal.sesion_version, ahora);
  const res = NextResponse.json({ ok: true, destino: `/o/${portal.slug}` });
  res.cookies.set(nombreCookie(portal.slug), sesion.valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/o/${portal.slug}`,
    maxAge: sesion.maxAge,
  });
  return res;
}
