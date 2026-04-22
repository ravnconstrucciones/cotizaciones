import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Una sola instancia en el navegador, con sesión en cookies (compatible con middleware). */
let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    if (!browserClient) {
      browserClient = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
    }
    return browserClient;
  }

  // SSR fallback (Route Handlers que usen este cliente)
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
