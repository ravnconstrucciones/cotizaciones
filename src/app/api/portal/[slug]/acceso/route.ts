import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { portalPorSlug } from "@/lib/portal/datos";
import {
  MAX_INTENTOS,
  MINUTOS_BLOQUEO,
  crearSesion,
  nombreCookie,
  claveValida,
  verificarPin,
} from "@/lib/portal/sesion";

/**
 * POST /api/portal/[slug]/acceso — el cliente presenta la contraseña de su obra.
 *
 * Ruta PÚBLICA (el middleware la deja pasar sin sesión de Supabase): es la
 * única puerta del portal. Devuelve siempre el mismo error para slug
 * inexistente, portal apagado o contraseña equivocada, así no se puede usar para
 * averiguar qué obras existen. Cinco intentos fallidos bloquean la obra 15
 * minutos, así adivinar por fuerza bruta deja de ser viable.
 *
 * DELETE cierra la sesión del cliente en ese dispositivo.
 */

type Params = { params: Promise<{ slug: string }> };

const ERROR_GENERICO = "La contraseña no es correcta.";

export async function POST(req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { clave?: unknown };
  const pin = typeof body.clave === "string" ? body.clave.trim() : "";

  const portal = await portalPorSlug(slug);
  if (!portal || !portal.activo || !portal.pin_hash || !claveValida(pin)) {
    return NextResponse.json({ ok: false, error: ERROR_GENERICO }, { status: 401 });
  }

  const ahora = Date.now();
  if (portal.bloqueado_hasta && new Date(portal.bloqueado_hasta).getTime() > ahora) {
    return NextResponse.json(
      { ok: false, error: `Demasiados intentos. Probá de nuevo en ${MINUTOS_BLOQUEO} minutos.` },
      { status: 429 }
    );
  }

  const sb = createSupabaseAdminClient();

  if (!verificarPin(pin, portal.pin_hash)) {
    const intentos = portal.intentos_fallidos + 1;
    const bloquear = intentos >= MAX_INTENTOS;
    await sb
      .from("obra_portal")
      .update({
        intentos_fallidos: bloquear ? 0 : intentos,
        bloqueado_hasta: bloquear ? new Date(ahora + MINUTOS_BLOQUEO * 60_000).toISOString() : null,
      })
      .eq("presupuesto_id", portal.presupuesto_id);
    return NextResponse.json({ ok: false, error: ERROR_GENERICO }, { status: 401 });
  }

  if (portal.intentos_fallidos > 0 || portal.bloqueado_hasta) {
    await sb
      .from("obra_portal")
      .update({ intentos_fallidos: 0, bloqueado_hasta: null })
      .eq("presupuesto_id", portal.presupuesto_id);
  }

  const sesion = crearSesion(portal.presupuesto_id, portal.sesion_version, ahora);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(nombreCookie(slug), sesion.valor, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sesion.maxAge,
  });
  return res;
}

export async function DELETE(_req: Request, ctx: Params) {
  const { slug } = await ctx.params;
  const res = NextResponse.json({ ok: true });
  res.cookies.set(nombreCookie(slug), "", { path: "/", maxAge: 0 });
  return res;
}
