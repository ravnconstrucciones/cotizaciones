import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rutas de la mesa de cotización que el bypass x-ravn-agente puede tocar
 * (fix ronda final finding 3). La ley "el chat jamás emite/aprueba" vivía
 * SOLO en el prompt-sistema de Fable (daemon/puente-cotizador/prompt-sistema.md)
 * — acá queda reforzada en el server: aprobar/rechazar/emitir/estado y todo
 * el resto de /api/* (dinero, retiros, papelera…) NUNCA entran por acá,
 * tenga el secret que tenga la request.
 */
const RUTAS_BYPASS_AGENTE: Array<{ patron: RegExp; metodos: string[] }> = [
  { patron: /^\/api\/cotizaciones$/, metodos: ["GET"] },
  { patron: /^\/api\/cotizaciones\/[^/]+$/, metodos: ["GET"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/mensajes$/, metodos: ["GET", "POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/desglose$/, metodos: ["PATCH"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/documento-borrador$/, metodos: ["PATCH"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos$/, metodos: ["GET", "POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos\/[^/]+$/, metodos: ["PATCH"] },
];

/** true si `metodo` sobre `pathname` está en la allowlist de arriba. */
export function bypassAgentePermitido(pathname: string, metodo: string): boolean {
  return RUTAS_BYPASS_AGENTE.some((r) => r.patron.test(pathname) && r.metodos.includes(metodo));
}

export async function middleware(request: NextRequest) {
  // Agentes locales (puente-cotizador): secret compartido SOLO para la
  // allowlist de la mesa de cotización — no para /api/* entero.
  // Sin secret configurado en el entorno, el bypass no existe.
  const claveAgente = request.headers.get("x-ravn-agente");
  if (
    claveAgente &&
    process.env.RAVN_AGENTE_SECRET &&
    claveAgente === process.env.RAVN_AGENTE_SECRET &&
    bypassAgentePermitido(request.nextUrl.pathname, request.method)
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLoginPage) {
    // Fetch de API sin sesión: 401 JSON, nunca redirect a /login (revisión
    // 31/07). Un POST redirigido a la page de login termina en 405/HTML y el
    // cliente solo puede mostrar un error genérico; con 401 el cliente
    // (p.ej. /gasto, PWA cacheada días en iOS) muestra "sesión vencida" con
    // salida real. El bypass x-ravn-agente ya se resolvió arriba.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: "Sesión vencida" },
        { status: 401 }
      );
    }

    const isPreviewAutoLogin =
      process.env.PREVIEW_AUTO_LOGIN === "true" &&
      process.env.VERCEL_ENV !== "production";

    if (isPreviewAutoLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/api/auto-login";
      url.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
      return NextResponse.redirect(url);
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Volver a donde iba después de loguearse (clave para el atajo /gasto del
    // iPhone: sesión vencida no puede tirar a la home y perder el gasto).
    url.search =
      request.nextUrl.pathname !== "/"
        ? `?next=${encodeURIComponent(request.nextUrl.pathname)}`
        : "";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auto-login|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
