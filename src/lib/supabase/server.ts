import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Cliente Supabase para Route Handlers (misma clave anónima que el browser). */
export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno."
    );
  }
  return createClient(url, key);
}
