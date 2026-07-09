/**
 * Refresco batch de precios retail — lo corre el daemon (job `precios`, 1x/día).
 *
 * Junta los MATERIALES de todas las recetas y busca su precio retail vivo en la
 * cadena de referencia del rubro (retail.ts). Upsertea en `precios_items` con
 * timestamp — es lo que hace que el "revisado hace X h" del panel sea verdad.
 * Los ítems sin resultado NO se escriben (ley 1: sin dato no hay fila).
 *
 * Uso: npx tsx scripts/cotizador/refrescar-precios.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { refrescarRetail } from "../../src/lib/cotizador/precios-cache";
import { materialesDeReceta } from "../../src/lib/cotizador/takeoff-helpers";
import type { Receta } from "../../src/lib/cotizador/tipos";

// Mismo patrón que scripts/gastos-obra.ts: .env.local del repo, cae a process.env.
function cargarEnv(): Record<string, string> {
  const raiz = join(__dirname, "..", "..");
  const env: Record<string, string> = {};
  try {
    for (const linea of readFileSync(join(raiz, ".env.local"), "utf8").split("\n")) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* sin .env.local: caemos a process.env */
  }
  return { ...env, ...process.env } as Record<string, string>;
}

async function main(): Promise<void> {
  const env = cargarEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: recetas, error } = await sb.from("recetas").select("etapas");
  if (error) {
    console.error("Error consultando recetas:", error.message);
    process.exit(1);
  }

  const materiales = new Set<string>();
  for (const receta of recetas ?? []) {
    for (const nombre of materialesDeReceta(receta as Pick<Receta, "etapas">)) {
      materiales.add(nombre);
    }
  }
  const listaMateriales = [...materiales];

  const hoy = new Date().toISOString().slice(0, 10);
  const filas = await refrescarRetail(listaMateriales, hoy);

  if (filas.length > 0) {
    const { error: errUpsert } = await sb
      .from("precios_items")
      .upsert(filas, { onConflict: "item,origen" });
    if (errUpsert) {
      console.error("Error actualizando precios_items:", errUpsert.message);
      process.exit(1);
    }
  }

  const encontrados = new Set(filas.map((f) => f.item));
  const sinPrecio = listaMateriales.filter((m) => !encontrados.has(m));

  console.log(
    `precios retail: ${filas.length} actualizados / ${listaMateriales.length} materiales; ` +
      `sin precio: [${sinPrecio.join(", ")}]`
  );
}

main().catch((e) => {
  console.error("refrescar-precios falló:", e?.message || e);
  process.exit(1);
});
