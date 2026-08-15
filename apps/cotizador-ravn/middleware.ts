import { NextRequest, NextResponse } from "next/server";
import { verifyBasicAuthorization } from "./src/auth/basic-auth";

export function middleware(request: NextRequest) {
  const username = process.env.COTIZADOR_BASIC_USER;
  const password = process.env.COTIZADOR_BASIC_PASSWORD;

  if (!username || !password) {
    return new NextResponse("Cotizador RAVN no tiene autenticación configurada.", {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  if (!verifyBasicAuthorization(request.headers.get("authorization"), username, password)) {
    return new NextResponse("Autenticación requerida.", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "WWW-Authenticate": 'Basic realm="Cotizador RAVN", charset="UTF-8"',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
