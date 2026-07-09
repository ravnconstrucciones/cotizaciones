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
 *    tampoco va: sirve página anti-bot — verificado 2026-07-01). Queda
 *    dormido: sin token no se llama. Para activarlo: app gratis en
 *    developers.mercadolibre.com.ar.
 * 2. Cadena VTEX según RUBRO — la fuente automática por defecto. Cada gran
 *    cadena expone el MISMO endpoint de catálogo VTEX (JSON público, sin auth,
 *    precio del día), así que enrutamos el material a la cadena que es
 *    referencia real de su rubro (verificado en vivo 2026-07-09):
 *      · pintura            → Prestigio
 *      · cerámico / baño     → Blaisten (porcelanato, grifería, sanitarios)
 *      · resto (obra gris,
 *        electricidad,
 *        plomería, etc.)     → Easy
 *    Un material que no matchea ningún rubro cae a Easy, que es la más amplia.
 *
 * Cualquier falla devuelve null y el cotizador sigue con SISMAT+internet.
 */
import type { PrecioFechado } from "./tipos";

const ML_ENDPOINT = "https://api.mercadolibre.com/sites/MLA/search";
const TIMEOUT_MS = 6000;
const MAX_RESULTADOS = 12;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Sufijo del path de catálogo VTEX, común a todas las cadenas. */
const VTEX_PATH = "/api/catalog_system/pub/products/search/";

/** Id de cada cadena de referencia retail. */
export type CadenaId = "easy" | "prestigio" | "colorshop" | "blaisten";

/**
 * Cadenas VTEX verificadas en vivo (2026-07-09). Todas devuelven el mismo
 * JSON de catálogo, así que las lee el mismo parser (parsePrecioVtex).
 * `colorshop` queda cableada como segunda opción de pintura (más promo) para
 * comparar en la capa de UI; hoy el ruteo de pintura usa Prestigio.
 */
export const CADENAS: Record<CadenaId, { host: string; fuente: string }> = {
  easy: { host: "https://www.easy.com.ar", fuente: "Easy (ref. retail)" },
  prestigio: {
    host: "https://www.prestigio.com.ar",
    fuente: "Prestigio (ref. retail)",
  },
  colorshop: {
    host: "https://www.colorshop.com.ar",
    fuente: "Colorshop (ref. retail)",
  },
  blaisten: {
    host: "https://www.blaisten.com.ar",
    fuente: "Blaisten (ref. retail)",
  },
};

/**
 * Ruteo rubro → cadena por palabras clave sobre el nombre del material.
 * Orden de prioridad: se toma el PRIMER rubro que matchea. Pintura va antes que
 * cerámico/baño a propósito: "esmalte para azulejo" es una compra de pintura
 * (comprás el esmalte, no el azulejo). Sin match → Easy (default, la más amplia).
 * Claves ya normalizadas (minúsculas, sin acentos) — ver normalizar().
 */
const RUBROS: Array<{ cadena: CadenaId; claves: string[] }> = [
  {
    cadena: "prestigio",
    claves: [
      "latex",
      "esmalte",
      "esmalte sintetico",
      "fijador",
      "enduido",
      "barniz",
      "laca",
      "convertidor",
      "antioxido",
      "imprimacion",
      "aguarras",
      "diluyente",
      "pinceleta",
      "rodillo",
      "pintura",
      "entonador",
      "impregnante",
    ],
  },
  {
    cadena: "blaisten",
    claves: [
      "porcelanato",
      "porcellanato",
      "ceramico",
      "ceramica",
      "azulejo",
      "mayolica",
      "griferia",
      "canilla",
      "monocomando",
      "inodoro",
      "bidet",
      "vanitory",
      "lavatorio",
      "bacha",
      "mampara",
      "receptaculo",
      "ducha",
    ],
  },
];

type MLResp = { results?: Array<{ price?: unknown }> };
type VtexProducto = {
  items?: Array<{
    sellers?: Array<{
      commertialOffer?: { Price?: unknown; IsAvailable?: unknown };
    }>;
  }>;
};

/** minúsculas + sin acentos, para que "látex"/"latex"/"CERÁMICO" matcheen igual. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Elige la cadena de referencia para un material según su rubro. Exportada
 * para test y para que la UI muestre "de qué cadena sale este precio".
 */
export function elegirCadena(query: string): CadenaId {
  const n = normalizar(query);
  for (const r of RUBROS) {
    // \b al inicio de la clave: matchea "azulejos" (plural) pero NO el infijo
    // ("placa" ya NO cae en "laca" → Durlock deja de rutear a la pinturería).
    if (r.claves.some((k) => new RegExp(`\\b${k}`).test(n))) return r.cadena;
  }
  return "easy";
}

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
 * Mediana de los precios disponibles de una respuesta de catálogo VTEX
 * (Easy, Prestigio, Colorshop, Blaisten — todas comparten el formato).
 * Toma el primer seller del primer item de cada producto (el precio de lista
 * del resultado) y descarta los sin stock. Null si no hay ninguno.
 */
export function parsePrecioVtex(json: unknown, max = MAX_RESULTADOS): number | null {
  if (!Array.isArray(json)) return null;
  const precios = (json as VtexProducto[])
    .slice(0, max)
    .map((p) => p?.items?.[0]?.sellers?.[0]?.commertialOffer)
    .filter((o) => o && o.IsAvailable !== false)
    .map((o) => Number(o?.Price))
    .filter((p) => Number.isFinite(p) && p > 0);
  return mediana(precios);
}

/** Alias histórico: el parser VTEX nació leyendo Easy. */
export const parsePrecioEasy = parsePrecioVtex;

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
 * Trae un precio de referencia retail para `query`, de la cadena que es
 * referencia de su rubro (ver elegirCadena). Devuelve null ante cualquier
 * falla (red, timeout, sin resultados) — el cotizador sigue con SISMAT+internet.
 * `fetchImpl` inyectable para tests.
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

  // 2. Cadena VTEX según rubro del material (default: Easy).
  const cadena = CADENAS[elegirCadena(q)];
  const json = await fetchJson(
    `${cadena.host}${VTEX_PATH}?ft=${encodeURIComponent(q)}&_from=0&_to=${MAX_RESULTADOS - 1}`,
    { Accept: "application/json", "User-Agent": UA },
    fetchImpl
  );
  const valor = parsePrecioVtex(json);
  if (valor == null) return null;
  return { valor, fuente: cadena.fuente, fecha: hoy };
}
