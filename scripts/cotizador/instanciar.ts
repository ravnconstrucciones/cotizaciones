/**
 * CLI determinístico del Cotizador 2.0 — lo invoca Claude Code headless (daemon).
 *
 * Uso:  npx tsx scripts/cotizador/instanciar.ts < entrada.json
 *
 * stdin:  EntradaCotizacion (ver src/lib/cotizador/cotizar.ts)
 * stdout: {"desglose": ..., "revision": ..., "total_min": N, "total_max": N}
 *         | {"error": "faltan_parametros", "faltan": ["superficie_m2"]}  (exit 0: preguntar la ficha)
 *         | {"error": "<mensaje>"}                                        (exit 1)
 *
 * Regla madre (spec §6.2.1): la IA piensa, este código suma. La IA NUNCA
 * calcula cantidades ni totales a mano.
 */
import {
  cotizar,
  FaltanParametrosError,
  type EntradaCotizacion,
} from "../../src/lib/cotizador/cotizar";
import { fetchPrecioML } from "../../src/lib/cotizador/mercadolibre";

async function leerStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Enriquece la entrada con un precio de referencia de MercadoLibre, SOLO para
 * materiales que ya tienen doble precio (SISMAT + internet) y todavía no tienen
 * ML: ahí ML hace de desempate en la mesa. Falla en silencio (no frena la
 * cotización). Se puede apagar con COTIZADOR_SIN_ML=1.
 */
async function enriquecerConML(entrada: EntradaCotizacion): Promise<void> {
  if (process.env.COTIZADOR_SIN_ML) return;
  const hoy = entrada.hoy ?? new Date().toISOString().slice(0, 10);
  const nombres = new Set<string>();
  for (const etapa of entrada.receta?.etapas ?? []) {
    for (const item of etapa.items ?? []) {
      if (item.tipo !== "material") continue;
      const p = entrada.precios?.[item.nombre];
      if (p && p.sismat && p.internet && !p.mercadolibre) nombres.add(item.nombre);
    }
  }
  if (nombres.size === 0) return;
  await Promise.all(
    [...nombres].map(async (nombre) => {
      const ml = await fetchPrecioML(nombre, hoy);
      if (ml) entrada.precios[nombre].mercadolibre = ml;
    })
  );
}

async function main(): Promise<void> {
  const crudo = await leerStdin();
  let entrada: EntradaCotizacion;
  try {
    entrada = JSON.parse(crudo) as EntradaCotizacion;
  } catch {
    console.log(JSON.stringify({ error: "json_invalido: el stdin no es JSON parseable" }));
    process.exitCode = 1;
    return;
  }
  try {
    await enriquecerConML(entrada);
    const resultado = cotizar(entrada);
    console.log(JSON.stringify(resultado));
  } catch (e) {
    if (e instanceof FaltanParametrosError) {
      console.log(JSON.stringify({ error: "faltan_parametros", faltan: e.faltan }));
      return; // exit 0: es una respuesta válida — hay que preguntar la ficha
    }
    console.log(JSON.stringify({ error: e instanceof Error ? e.message : "error desconocido" }));
    process.exitCode = 1;
  }
}

void main();
