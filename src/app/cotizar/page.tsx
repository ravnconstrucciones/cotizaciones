import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CotizarScreen, type RecetaOpcion } from "./cotizar-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cotizar — RAVN",
};

export default async function CotizarPage() {
  const sb = createSupabaseAdminClient();
  const { data, error } = await sb
    .from("recetas")
    .select("id, nombre, titulo, estado, parametros, preguntas_abiertas, version")
    .order("titulo");

  if (error) {
    console.error("[cotizar] recetas:", error.message);
  }

  const recetas = (Array.isArray(data) ? data : []) as unknown as RecetaOpcion[];

  return <CotizarScreen recetas={recetas} />;
}
