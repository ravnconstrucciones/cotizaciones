import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auto-login para deployments de preview en Vercel.
 *
 * Doble guardia: PREVIEW_AUTO_LOGIN === "true" y VERCEL_ENV !== "production".
 * Si alguna falla → 404. Nunca activo en producción.
 */
export async function GET(request: NextRequest) {
  const isEnabled = process.env.PREVIEW_AUTO_LOGIN === "true";
  const isProduction = process.env.VERCEL_ENV === "production";

  if (!isEnabled || isProduction) {
    return new NextResponse(null, { status: 404 });
  }

  const email = process.env.PREVIEW_LOGIN_EMAIL;
  const password = process.env.PREVIEW_LOGIN_PASSWORD;

  if (!email || !password) {
    return new NextResponse("Credenciales de preview no configuradas.", {
      status: 500,
    });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return new NextResponse(`Auto-login fallido: ${error.message}`, {
      status: 401,
    });
  }

  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = next;
  redirectUrl.search = "";

  return NextResponse.redirect(redirectUrl);
}
