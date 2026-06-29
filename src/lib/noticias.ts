/**
 * NOTICIAS DEL DÍA — 3 economía / 3 construcción / 3 inmobiliario (propiedades).
 *
 * Las llena el job `job_noticias.py` (daemon, com.ravn.jobs, diario ~7am) en la
 * tabla `noticias` del mismo Supabase. Esta vista SOLO LEE. La tabla tiene RLS
 * (solo authenticated), por eso se lee con el admin client (service role) desde
 * el server component de /dia.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type CatNoticia = "economia" | "construccion" | "inmobiliario";

export type Noticia = {
  id: string;
  fecha: string;
  categoria: CatNoticia;
  orden: number;
  titulo: string;
  porque: string;
  fuente: string | null;
  url: string | null;
};

/** Catálogo de las 3 categorías, en orden de la vista, con su emoji. */
export const CATS_NOTICIA: { key: CatNoticia; emoji: string; label: string }[] = [
  { key: "economia", emoji: "📈", label: "Economía" },
  { key: "construccion", emoji: "🧱", label: "Construcción" },
  { key: "inmobiliario", emoji: "🏠", label: "Inmobiliario" },
];

/**
 * Devuelve las noticias de la fecha MÁS reciente cargada (las 9 de hoy),
 * descartando días viejos. Falla suave: si no hay tabla/datos o revienta la
 * red, devuelve [] y la vista simplemente no muestra el bloque.
 */
export async function getNoticiasDelDia(): Promise<Noticia[]> {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb
      .from("noticias")
      .select("id, fecha, categoria, orden, titulo, porque, fuente, url")
      .order("fecha", { ascending: false })
      .order("categoria", { ascending: true })
      .order("orden", { ascending: true })
      .limit(30);
    if (error || !data?.length) return [];

    const ultima = data[0].fecha;
    return data.filter((n) => n.fecha === ultima) as Noticia[];
  } catch {
    return [];
  }
}
