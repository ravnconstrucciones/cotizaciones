import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_SECONDS,
  ACCESS_QUERY_PARAM,
  accessCookieIsValid,
  accessKeyMatches,
  deriveAccessCookie,
} from "./auth/access-link";

/**
 * Sin `WWW-Authenticate` a propósito: ese header ES el diálogo del navegador.
 * La puerta se cruza con el enlace, no tipeando.
 */
function paginaSinAcceso(status: number, mensaje: string): NextResponse {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cotizador RAVN</title>
<style>
html,body{margin:0;height:100%;background:#070707;color:#f2efe8;
font-family:Raleway,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:300}
main{height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 8vw;gap:1.5rem}
.wordmark{font-size:0.92rem;letter-spacing:0.517em;font-weight:300}
p{margin:0;max-width:44ch;line-height:1.7;color:#f2efe8;opacity:.72;font-size:0.75rem}
</style></head><body><main>
<div class="wordmark">RAVN.</div><p>${mensaje}</p></main></body></html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export async function middleware(request: NextRequest) {
  const key = process.env.COTIZADOR_ACCESS_KEY;

  if (!key) {
    return paginaSinAcceso(503, "El cotizador no tiene el acceso configurado.");
  }

  if (await accessCookieIsValid(request.cookies.get(ACCESS_COOKIE)?.value, key)) {
    return NextResponse.next();
  }

  // La llave viaja en el enlace una sola vez: se canjea por la cookie y se borra
  // de la URL, para que no quede en la barra ni en lo que él comparta.
  const provided = request.nextUrl.searchParams.get(ACCESS_QUERY_PARAM);
  if (accessKeyMatches(provided, key)) {
    const destino = request.nextUrl.clone();
    destino.searchParams.delete(ACCESS_QUERY_PARAM);

    const response = NextResponse.redirect(destino);
    response.cookies.set({
      name: ACCESS_COOKIE,
      value: await deriveAccessCookie(key),
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: ACCESS_MAX_AGE_SECONDS,
    });
    return response;
  }

  return paginaSinAcceso(401, "Esta herramienta se abre con tu enlace de acceso.");
}

/**
 * `manifest.webmanifest` queda afuera igual que el favicon: el navegador lo pide
 * SIN credenciales y con auth devolvía 401 en cada carga. No expone nada — sólo
 * el nombre y los colores de la app.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
