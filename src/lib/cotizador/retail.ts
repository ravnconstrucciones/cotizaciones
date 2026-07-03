/**
 * Referencia RETAIL por ítem — la tercera pata de la curva de precios.
 *
 * Se usa SOLO como desempate/referencia en la mesa (ver PrecioItem.mercadolibre
 * en tipos.ts — el campo conserva el nombre histórico, hoy guarda la referencia
 * retail venga de donde venga): no entra en el total ni dispara alertas.
 * Tomamos la MEDIANA de los primeros resultados para aguantar outliers
 * (accesorios, muestras, combos).
 *
 * Fuentes, en orden:
 * 1. MercadoLibre API oficial — SOLO si hay `ML_ACCESS_TOKEN` (el search
 *    anónimo devuelve 403 desde jun 2026, y scrapear el listado público
 *    tampoco va: sirve página anti-bot — verificado 2026-07-01). Para
 *    activarla: app gratis en developers.mercadolibre.com.ar.
 * 2. Easy (VTEX catalog API) — pública, sin auth, JSON estable con precio
 *    del día. Es la fuente automática por defecto.
 *
 * Cualquier falla devuelve null y el cotizador sigue con SISMAT+internet.
 */
import type { PrecioFechado } from "./tipos";

const ML_ENDPOINT = "https://api.mercadolibre.com/sites/MLA/search";
const EASY_ENDPOINT =
  "https://www.easy.com.ar/api/catalog_system/pub/products/search/";
const TIMEOUT_MS = 6000;
const MAX_RESULTADOS = 12;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

type MLResp = { results?: Array<{ price?: unknown }> };
type EasyProducto = {
  items?: Array<{
    sellers?: Array<{
      commertialOffer?: { Price?: unknown; IsAvailable?: unknown };
    }>;
  }>;
};

/** Mediana de una lista de precios ya filtrados. Null si está vacía. */
function mediana(precios: number[]): number | null {
  if (precios.length === 0) return null;
  const orden = [...precios].sort((a, b) => a - b);
  const mid = Math.floor(orden.length / 2);
  return orden.length % 2 === 1
    ? orden[mid]
    : Math.round((orden[mid - 1] + orden[mid]) / 2);
}

/** Mediana de los precios válidos de la respuesta ML. Null si no hay ninguno. */
export function parsePrecioML(json: unknown, max = MAX_RESULTADOS): number | null {
  const results = (json as MLResp | null)?.results;
  if (!Array.isArray(results)) return null;
  const precios = results
    .slice(0, max)
    .map((r) => Number(r?.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  return mediana(precios);
}

/**
 * Mediana de los precios disponibles de la respuesta Easy (VTEX).
 * Toma el primer seller del primer item de cada producto (el precio de lista
 * del resultado) y descarta los sin stock. Null si no hay ninguno.
 */
export function parsePrecioEasy(json: unknown, max = MAX_RESULTADOS): number | null {
  if (!Array.isArray(json)) return null;
  const precios = (json as EasyProducto[])
    .slice(0, max)
    .map((p) => p?.items?.[0]?.sellers?.[0]?.commertialOffer)
    .filter((o) => o && o.IsAvailable !== false)
    .map((o) => Number(o?.Price))
    .filter((p) => Number.isFinite(p) && p > 0);
  return mediana(precios);
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers });
    if (!res.ok && res.status !== 206) return null; // VTEX pagina con 206
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Trae un precio de referencia retail para `query`. Devuelve null ante
 * cualquier falla (red, timeout, sin resultados) — el cotizador sigue con
 * SISMAT+internet. `fetchImpl` inyectable para tests.
 */
export async function fetchPrecioRetail(
  query: string,
  hoy: string,
  fetchImpl: typeof fetch = fetch
): Promise<PrecioFechado | null> {
  const q = query.trim();
  if (!q) return null;

  // 1. MercadoLibre, solo con token (sin token es 403 seguro: ni gastamos la llamada).
  const token = process.env.ML_ACCESS_TOKEN;
  if (token) {
    const json = await fetchJson(
      `${ML_ENDPOINT}?q=${encodeURIComponent(q)}&limit=${MAX_RESULTADOS}`,
      { Accept: "application/json", Authorization: `Bearer ${token}` },
      fetchImpl
    );
    const valor = parsePrecioML(json);
    if (valor != null)
      return { valor, fuente: "MercadoLibre (ref. retail)", fecha: hoy };
  }

  // 2. Easy (VTEX) — fuente automática por defecto.
  const json = await fetchJson(
    `${EASY_ENDPOINT}?ft=${encodeURIComponent(q)}&_from=0&_to=${MAX_RESULTADOS - 1}`,
    { Accept: "application/json", "User-Agent": UA },
    fetchImpl
  );
  const valor = parsePrecioEasy(json);
  if (valor == null) return null;
  return { valor, fuente: "Easy (ref. retail)", fecha: hoy };
}
