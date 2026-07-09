/**
 * Seed de `precios_items` desde el histórico de `cotizaciones` — corre UNA vez
 * (lo lanza el orquestador, no el daemon).
 *
 * Recorre `desglose.items[]` de todas las cotizaciones con desglose cargado y
 * upsertea cada precio (sismat/internet/retail) conservando `fuente` y `fecha`
 * ORIGINALES — nunca `now()`. Ley 1: precios viejos quedan viejos, el
 * vencimiento los marca en el panel; eso es honesto, no un bug. Si el mismo
 * ítem+origen aparece en varias cotizaciones, gana el de `fecha` más nueva.
 *
 * Uso:  npx tsx scripts/cotizador/sembrar-precios.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Desglose, PrecioItemRow } from "../../src/lib/cotizador/tipos";

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

/** Junta las filas más nuevas por clave item+origen a partir de un desglose. */
function filasDeDesglose(desglose: Desglose, acumulado: Map<string, PrecioItemRow>): void {
  for (const item of desglose.items ?? []) {
    const origenes = item.precios ?? {};
    for (const origen of ["sismat", "internet", "retail"] as const) {
      const p = origenes[origen];
      if (!p) continue; // ítem sin ese precio: no hay nada que sembrar (ley 1)
      const clave = `${item.nombre}::${origen}`;
      const previa = acumulado.get(clave);
      if (previa && previa.fecha >= p.fecha) continue; // gana la fecha más nueva
      acumulado.set(clave, {
        item: item.nombre,
        origen,
        valor: p.valor,
        fuente: p.fuente,
        fecha: p.fecha,
        // Medianoche UTC de la fecha ORIGINAL del precio, NUNCA now(): el panel
        // tiene que decir la verdad sobre cuándo se revisó ese dato.
        revisado_at: `${p.fecha}T00:00:00Z`,
      });
    }
  }
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

  // Traemos todo `desglose` y filtramos "no vacío" en JS: la igualdad jsonb
  // por filtro PostgREST (`eq={}`) es frágil, y el volumen de cotizaciones es
  // chico — no hace falta empujar el filtro a la base.
  const { data: filas, error } = await sb.from("cotizaciones").select("desglose");

  if (error) {
    console.error("Error consultando cotizaciones:", error.message);
    process.exit(1);
  }

  const acumulado = new Map<string, PrecioItemRow>();
  let filasConDesglose = 0;
  for (const fila of filas ?? []) {
    const desglose = fila.desglose as Desglose | null;
    if (!desglose || !Array.isArray(desglose.items) || desglose.items.length === 0) continue;
    filasConDesglose++;
    filasDeDesglose(desglose, acumulado);
  }

  const paraSembrar = [...acumulado.values()];
  if (paraSembrar.length === 0) {
    console.log("sembrados: 0 ítems (0 filas)");
    return;
  }

  const { error: errUpsert } = await sb
    .from("precios_items")
    .upsert(paraSembrar, { onConflict: "item,origen" });

  if (errUpsert) {
    console.error("Error sembrando precios_items:", errUpsert.message);
    process.exit(1);
  }

  console.log(`sembrados: ${paraSembrar.length} ítems (${filasConDesglose} filas)`);
}

main().catch((e) => {
  console.error("sembrar-precios falló:", e?.message || e);
  process.exit(1);
});
