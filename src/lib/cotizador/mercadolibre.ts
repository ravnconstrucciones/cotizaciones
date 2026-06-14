/**
 * MercadoLibre — precio de REFERENCIA retail por ítem.
 * GET https://api.mercadolibre.com/sites/MLA/search?q=<q> → { results:[{price}] }.
 *
 * Se usa SOLO como desempate/referencia en la mesa (ver PrecioItem.mercadolibre
 * en tipos.ts): no entra en el total ni dispara alertas. Tomamos la MEDIANA de
 * los primeros resultados para aguantar outliers (accesorios, muestras, combos).
 *
 * IMPORTANTE (jun 2026): ML cerró el search anónimo → responde 403 sin token.
 * Para activarlo: registrar una app gratis en developers.mercadolibre.com.ar,
 * sacar un access token OAuth y exponerlo como env `ML_ACCESS_TOKEN` donde corre
 * el daemon. Sin token la llamada devuelve null y el cotizador sigue igual
 * (la columna "ML ref." queda vacía) — cero ruido, listo para enchufar.
 */
import type { PrecioFechado } from "./tipos";

const ML_ENDPOINT = "https://api.mercadolibre.com/sites/MLA/search";
const TIMEOUT_MS = 6000;
const MAX_RESULTADOS = 12;

type MLResp = { results?: Array<{ price?: unknown }> };

/** Mediana de los precios válidos de la respuesta ML. Null si no hay ninguno. */
export function parsePrecioML(json: unknown, max = MAX_RESULTADOS): number | null {
  const results = (json as MLResp | null)?.results;
  if (!Array.isArray(results)) return null;
  const precios = results
    .slice(0, max)
    .map((r) => Number(r?.price))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (precios.length === 0) return null;
  const mid = Math.floor(precios.length / 2);
  return precios.length % 2 === 1
    ? precios[mid]
    : Math.round((precios[mid - 1] + precios[mid]) / 2);
}

/**
 * Trae un precio de referencia de ML para `query`. Devuelve null ante cualquier
 * falla (red, timeout, sin resultados) — el cotizador sigue con SISMAT+internet.
 * `fetchImpl` inyectable para tests.
 */
export async function fetchPrecioML(
  query: string,
  hoy: string,
  fetchImpl: typeof fetch = fetch
): Promise<PrecioFechado | null> {
  const q = query.trim();
  if (!q) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${ML_ENDPOINT}?q=${encodeURIComponent(q)}&limit=${MAX_RESULTADOS}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = process.env.ML_ACCESS_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(url, { signal: ctrl.signal, headers });
    if (!res.ok) return null;
    const valor = parsePrecioML(await res.json());
    if (valor == null) return null;
    return { valor, fuente: "MercadoLibre (ref. retail)", fecha: hoy };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
