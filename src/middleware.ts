import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_NETWORK_TIMEOUT_MS = 2_500;

type ResultadoClaims = {
  data: { claims: { sub?: unknown } | null } | null;
  error: { name?: string; status?: number } | null;
};

export type EstadoAutenticacion =
  | { tipo: "autenticado" }
  | { tipo: "no_autenticado" }
  | { tipo: "no_disponible" };

/**
 * Supabase Auth no puede retener el middleware hasta el timeout de Vercel.
 * El aborto también corta el fetch subyacente: un Promise.race solo devolvería
 * antes, pero dejaría la renovación de token golpeando Auth en segundo plano.
 */
export function crearFetchConTimeout(
  fetchBase: typeof fetch,
  timeoutMs: number
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const signalOriginal = init?.signal;
    const propagarAborto = () => controller.abort(signalOriginal?.reason);

    if (signalOriginal?.aborted) {
      propagarAborto();
    } else {
      signalOriginal?.addEventListener("abort", propagarAborto, { once: true });
    }

    const timeout = setTimeout(
      () => controller.abort(new DOMException("Supabase Auth timeout", "AbortError")),
      timeoutMs
    );

    try {
      return await fetchBase(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signalOriginal?.removeEventListener("abort", propagarAborto);
    }
  };
}

/**
 * `getClaims()` valida localmente los JWT ES256 de RAVN. Solo toca la red para
 * obtener JWKS (cacheado) o renovar una sesión próxima a vencer. Una falla de
 * infraestructura no se confunde con logout para no borrar una sesión válida.
 */
export async function obtenerEstadoAutenticacion(
  getClaims: () => Promise<ResultadoClaims>
): Promise<EstadoAutenticacion> {
  try {
    const { data, error } = await getClaims();

    if (data?.claims?.sub) return { tipo: "autenticado" };
    if (!error) return { tipo: "no_autenticado" };

    const transitorio =
      error.status === 409 ||
      error.status === 429 ||
      (typeof error.status === "number" && error.status >= 500) ||
      error.name === "AuthRetryableFetchError" ||
      error.name === "AbortError";

    return { tipo: transitorio ? "no_disponible" : "no_autenticado" };
  } catch {
    return { tipo: "no_disponible" };
  }
}

function respuestaAuthNoDisponible(request: NextRequest): NextResponse {
  const headers = {
    "Cache-Control": "no-store",
    "Retry-After": "3",
  };

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "RAVN está reconectando. Reintentá en unos segundos." },
      { status: 503, headers }
    );
  }

  return new NextResponse(
    "RAVN está reconectando con la base. Reintentá en unos segundos.",
    { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } }
  );
}

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

/**
 * Frontera exclusiva de lectura para el producto Cotizador RAVN.
 * Se mantiene separada del secreto del puente legacy: esta credencial no
 * puede escribir mensajes, desglose, propuesta ni archivos aunque se filtre.
 */
const RUTAS_BYPASS_COTIZADOR_READ: Array<{ patron: RegExp; metodos: string[] }> = [
  { patron: /^\/api\/cotizaciones$/, metodos: ["GET"] },
  { patron: /^\/api\/cotizaciones\/[^/]+$/, metodos: ["GET"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/mensajes$/, metodos: ["GET"] },
  // Puerta de entrada (17/08): el visor firma las URLs de los archivos que la
  // ola de intake baja para leer. Solo GET — subir es de la credencial de
  // escritura.
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos$/, metodos: ["GET"] },
];

/**
 * Frontera de ESCRITURA del Cotizador: el pase del expediente + la puerta de
 * entrada (17/08). Es la línea taller / oficina sostenida por permisos y no
 * por buena voluntad — con esta credencial el Cotizador puede dejar el
 * extracto y el número, crear un BORRADOR, adjuntarle archivos, confirmar el
 * reconocimiento (receta candidata + en_revision) y dejar mensajes de CHARLA
 * en el hilo (conversación operativa, 17/08), y NADA más: aprobar, emitir,
 * crear obra o mover plata quedan afuera aunque el secreto se filtre.
 *
 * Se mantiene separada de la credencial de lectura a propósito: la de lectura
 * sigue siendo incapaz de escribir.
 */
const RUTAS_BYPASS_COTIZADOR_WRITE: Array<{ patron: RegExp; metodos: string[] }> = [
  { patron: /^\/api\/cotizaciones\/[^/]+\/pase$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/intake$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos\/firmar$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/archivos\/confirmar$/, metodos: ["POST"] },
  { patron: /^\/api\/cotizaciones\/[^/]+\/confirmar-reconocimiento$/, metodos: ["POST"] },
  // Conversación operativa (17/08): el composer del visor escribe la charla.
  { patron: /^\/api\/cotizaciones\/[^/]+\/mensajes$/, metodos: ["POST"] },
];

/** true si `metodo` sobre `pathname` está en la allowlist de arriba. */
export function bypassAgentePermitido(pathname: string, metodo: string): boolean {
  return RUTAS_BYPASS_AGENTE.some((r) => r.patron.test(pathname) && r.metodos.includes(metodo));
}

/** true sólo para el pase del expediente. */
export function bypassCotizadorWritePermitido(pathname: string, metodo: string): boolean {
  return RUTAS_BYPASS_COTIZADOR_WRITE.some(
    (ruta) => ruta.patron.test(pathname) && ruta.metodos.includes(metodo)
  );
}

/**
 * La credencial de escritura debe existir y ser distinta de las otras dos. Si
 * alguien la provisiona con el mismo valor que la de lectura o la del puente
 * legacy, el bypass no existe: una mala provisión falla cerrada en vez de
 * ampliar permisos en silencio.
 */
export function credencialCotizadorWriteValida(
  presentada: string | null,
  escritura: string | undefined,
  lectura: string | undefined,
  agenteLegacy: string | undefined
): boolean {
  return Boolean(
    presentada &&
      escritura &&
      escritura !== lectura &&
      escritura !== agenteLegacy &&
      presentada === escritura
  );
}

/** true sólo para las lecturas que consume el Cotizador standalone. */
export function bypassCotizadorReadPermitido(pathname: string, metodo: string): boolean {
  return RUTAS_BYPASS_COTIZADOR_READ.some(
    (ruta) => ruta.patron.test(pathname) && ruta.metodos.includes(metodo)
  );
}

/**
 * La credencial read-only debe existir y ser distinta del secreto con
 * permisos de escritura del puente legacy. Una mala provisión falla cerrada.
 */
export function credencialCotizadorReadValida(
  presentada: string | null,
  lectura: string | undefined,
  agenteLegacy: string | undefined
): boolean {
  return Boolean(
    presentada && lectura && lectura !== agenteLegacy && presentada === lectura
  );
}

export async function middleware(request: NextRequest) {
  // El Cotizador standalone recibe una credencial distinta, incapaz de usar
  // las escrituras que el puente conversacional legacy todavía necesita.
  const claveCotizadorRead = request.headers.get("x-ravn-cotizador-read");
  if (
    credencialCotizadorReadValida(
      claveCotizadorRead,
      process.env.RAVN_COTIZADOR_READ_SECRET,
      process.env.RAVN_AGENTE_SECRET
    ) &&
    bypassCotizadorReadPermitido(request.nextUrl.pathname, request.method)
  ) {
    return NextResponse.next({ request });
  }

  // El pase del expediente: el Cotizador deja el extracto y el número en App
  // RAVN. Credencial propia, una sola ruta — no puede aprobar ni emitir.
  const claveCotizadorWrite = request.headers.get("x-ravn-cotizador-write");
  if (
    credencialCotizadorWriteValida(
      claveCotizadorWrite,
      process.env.RAVN_COTIZADOR_WRITE_SECRET,
      process.env.RAVN_COTIZADOR_READ_SECRET,
      process.env.RAVN_AGENTE_SECRET
    ) &&
    bypassCotizadorWritePermitido(request.nextUrl.pathname, request.method)
  ) {
    return NextResponse.next({ request });
  }

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
      global: {
        fetch: crearFetchConTimeout(globalThis.fetch, AUTH_NETWORK_TIMEOUT_MS),
      },
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

  const auth = await obtenerEstadoAutenticacion(() => supabase.auth.getClaims());

  if (auth.tipo === "no_disponible") {
    console.warn("[middleware] Supabase Auth no disponible", {
      pathname: request.nextUrl.pathname,
    });
    return respuestaAuthNoDisponible(request);
  }

  const autenticado = auth.tipo === "autenticado";

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!autenticado && !isLoginPage) {
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

  if (autenticado && isLoginPage) {
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
