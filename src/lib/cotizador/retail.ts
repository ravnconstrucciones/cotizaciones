/**
 * Referencia RETAIL por ítem — la tercera pata de la curva de precios.
 *
 * Se usa SOLO como desempate/referencia en la mesa (ver PrecioItem.retail en
 * tipos.ts): no entra en el total ni dispara alertas. Tomamos la MEDIANA de los
 * primeros resultados para aguantar outliers (accesorios, muestras, combos).
 *
 * Cómo sale el precio:
 *   Tres tipos de fuente, cada una con su fetcher (verificado en vivo 2026-07-10):
 *     · VTEX (Easy, Prestigio, Colorshop, Blaisten): endpoint de catálogo JSON
 *       público, sin auth, precio del día.
 *     · Sodimac: su API de búsqueda da 403 (anti-bot), pero la página de búsqueda
 *       renderiza server-side y trae TODO el resultado en el JSON __NEXT_DATA__
 *       embebido — se lee el HTML y se parsea ese JSON.
 *     · Tiendanube (Rojas Materiales, corralón): los productos de la búsqueda
 *       vienen embebidos en el dataLayer del HTML (item_name + price numérico).
 *   Ruteo del material a la cadena que es referencia real de su rubro:
 *     · pintura            → Prestigio (Colorshop como 2ª para comparar)
 *     · cerámico / baño     → Blaisten (porcelanato, grifería, sanitarios)
 *     · obra gris (cemento,
 *       cal, arena, hierro) → Rojas Materiales (corralón — es donde se compra de
 *                             verdad; Easy y Sodimac al lado para comparar)
 *     · resto (electricidad,
 *       plomería, gas)      → Easy (Sodimac como 2ª para comparar)
 *   Un material que no matchea ningún rubro cae a Easy, que es la más amplia.
 *
 * Rubros pendientes de cadena especializada (hoy caen a Easy, que cubre lo común
 * — se suma acá una cadena propia cuando encontremos una fuente pinchable y
 * verificada, NO se inventa):
 *     · artefactos de electricidad (tableros, térmicas, artefactos de luz)
 *     · artefactos de plomería (bombas, tanques, termotanques finos)
 *     · artefactos de gas (calefones, calderas, estufas)
 *
 * MercadoLibre quedó descartado (API sin token = 403, scrapeo = página anti-bot,
 * precios de reventa/combos que no son referencia — verificado 2026-07-09).
 *
 * Cualquier falla devuelve null y el cotizador sigue con SISMAT+internet.
 */
import type { PrecioFechado } from "./tipos";

const TIMEOUT_MS = 6000;
const MAX_RESULTADOS = 12;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Sufijo del path de catálogo VTEX, común a todas las cadenas. */
const VTEX_PATH = "/api/catalog_system/pub/products/search/";

/** Id de cada cadena de referencia retail. */
export type CadenaId =
  | "easy"
  | "prestigio"
  | "colorshop"
  | "blaisten"
  | "sodimac"
  | "rojas";

/** Cómo se le saca el precio a la cadena (qué fetcher/parser le toca). */
type TipoCadena = "vtex" | "sodimac" | "tiendanube";

/**
 * Cadenas verificadas en vivo (2026-07-10). Las VTEX devuelven el mismo JSON de
 * catálogo (parsePrecioVtex); Sodimac y Tiendanube se leen del HTML de búsqueda
 * (ver header). `nombre` es la etiqueta corta para la UI; `fuente` es la traza
 * que queda guardada en el precio (de dónde salió).
 */
export const CADENAS: Record<
  CadenaId,
  { nombre: string; host: string; fuente: string; tipo: TipoCadena }
> = {
  easy: {
    nombre: "Easy",
    host: "https://www.easy.com.ar",
    fuente: "Easy (ref. retail)",
    tipo: "vtex",
  },
  prestigio: {
    nombre: "Prestigio",
    host: "https://www.prestigio.com.ar",
    fuente: "Prestigio (ref. retail)",
    tipo: "vtex",
  },
  colorshop: {
    nombre: "Colorshop",
    host: "https://www.colorshop.com.ar",
    fuente: "Colorshop (ref. retail)",
    tipo: "vtex",
  },
  blaisten: {
    nombre: "Blaisten",
    host: "https://www.blaisten.com.ar",
    fuente: "Blaisten (ref. retail)",
    tipo: "vtex",
  },
  sodimac: {
    nombre: "Sodimac",
    host: "https://www.sodimac.com.ar",
    fuente: "Sodimac (ref. retail)",
    tipo: "sodimac",
  },
  rojas: {
    nombre: "Rojas Materiales",
    host: "https://www.rojasmateriales.com.ar",
    fuente: "Rojas Materiales (corralón)",
    tipo: "tiendanube",
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
  {
    // Obra gris → corralón: es donde se compra de verdad (Easy/Sodimac quedan
    // al lado en la comparación). "cal" va con sufijos explícitos porque el
    // match es por prefijo (\bcal solo agarraría "calefón" y "calibre").
    cadena: "rojas",
    claves: [
      "cemento",
      "hormigon",
      "plasticor",
      "cal hidrat",
      "cal aerea",
      "cal hidraulica",
      "arena",
      "piedra partida",
      "canto rodado",
      "granza",
      "cascote",
      "ladrillo",
      "bloque de hormigon",
      "hierro",
      "malla sima",
      "alambre",
    ],
  },
];

/**
 * Rubros que vale la pena COMPARAR entre varias cadenas (lo consume la capa 3).
 * Clave = cadena principal que devuelve elegirCadena; valor = lista de cadenas a
 * mostrar lado a lado. Pintura se compara Prestigio vs Colorshop (dos
 * pinturerías, promos distintas); obra gris compara corralón vs las dos grandes;
 * el default (Easy) siempre lleva Sodimac al lado. Blaisten queda solo en su
 * rubro (sanitarios: Sodimac también tiene, se puede sumar si suma).
 */
const COMPARACION: Partial<Record<CadenaId, CadenaId[]>> = {
  prestigio: ["prestigio", "colorshop"],
  rojas: ["rojas", "easy", "sodimac"],
  easy: ["easy", "sodimac"],
};

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

/**
 * Cadenas a comparar para un material (capa 3). Devuelve la principal + las
 * alternativas de su rubro; si no hay comparación definida, solo la principal.
 */
export function cadenasComparacion(query: string): CadenaId[] {
  const principal = elegirCadena(query);
  return COMPARACION[principal] ?? [principal];
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

/** Forma mínima del __NEXT_DATA__ de la búsqueda de Sodimac. */
type SodimacNextData = {
  props?: {
    pageProps?: {
      searchProps?: {
        searchData?: {
          results?: Array<{
            prices?: Array<{ type?: unknown; priceWithoutFormatting?: unknown }>;
          }>;
        };
      };
    };
  };
};

/**
 * Mediana de los precios del HTML de búsqueda de Sodimac. La página renderiza
 * server-side: los resultados vienen completos en el JSON __NEXT_DATA__
 * embebido (su API directa da 403 anti-bot, esto NO — verificado 2026-07-10).
 * De cada producto se toma el precio tipo NORMAL (el de lista, no PRECIOS_PRO).
 */
export function parsePrecioSodimac(html: string, max = MAX_RESULTADOS): number | null {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!m) return null;
  let data: SodimacNextData;
  try {
    data = JSON.parse(m[1]) as SodimacNextData;
  } catch {
    return null;
  }
  const results = data.props?.pageProps?.searchProps?.searchData?.results;
  if (!Array.isArray(results)) return null;
  const precios = results
    .slice(0, max)
    .map((r) => r?.prices?.find((p) => p?.type === "NORMAL") ?? r?.prices?.[0])
    .map((p) => Number(p?.priceWithoutFormatting))
    .filter((p) => Number.isFinite(p) && p > 0);
  return mediana(precios);
}

/** Palabras de la query que no dicen nada del material (no sirven para filtrar). */
const STOPWORDS = new Set(["del", "los", "las", "con", "sin", "por", "para", "una"]);

/**
 * Mediana de los precios del HTML de búsqueda de una tienda Tiendanube (Rojas).
 * Los productos del resultado van embebidos en el dataLayer de la página como
 * {"item_id":"...","item_name":"...","price":N}. El mismo ítem aparece varias
 * veces (la página pushea más de un evento), así que se deduplica por item_id.
 *
 * Dos filtros que la búsqueda de Tiendanube hace necesarios (verificado
 * 2026-07-10: "cemento 25kg" devolvía micropisos de $415k y la mediana daba
 * $46k contra los $9k reales del cemento):
 *   1. Relevancia: el nombre del ítem tiene que matchear al menos UNA palabra
 *      significativa de la query (prefijo con \b, igual que el ruteo de rubros).
 *   2. Combos/promos afuera: son paquetes armados, no precio de UN material.
 */
export function parsePrecioTiendanube(
  html: string,
  query: string,
  max = MAX_RESULTADOS
): number | null {
  const tokens = normalizar(query)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !/^\d/.test(t) && !STOPWORDS.has(t));
  const re =
    /"item_id":"(\d+)"[^{}]*?"item_name":"((?:[^"\\]|\\.)*)"[^{}]*?"price":([0-9]+(?:\.[0-9]+)?)/g;
  const vistos = new Set<string>();
  const precios: number[] = [];
  for (const m of html.matchAll(re)) {
    const [, id, nombre, precio] = m;
    if (vistos.has(id)) continue;
    vistos.add(id);
    if (/\b(combo|promo)/i.test(nombre)) continue;
    const n = normalizar(nombre);
    if (tokens.length > 0 && !tokens.some((t) => new RegExp(`\\b${t}`).test(n))) continue;
    const p = Number(precio);
    if (Number.isFinite(p) && p > 0) precios.push(p);
    if (precios.length >= max) break;
  }
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

async function fetchTexto(
  url: string,
  fetchImpl: typeof fetch
): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { Accept: "text/html", "User-Agent": UA },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Precio de una cadena puntual para `query`. Null ante cualquier falla. */
async function fetchPrecioCadena(
  cadena: CadenaId,
  query: string,
  fetchImpl: typeof fetch
): Promise<number | null> {
  const { host, tipo } = CADENAS[cadena];
  if (tipo === "vtex") {
    const json = await fetchJson(
      `${host}${VTEX_PATH}?ft=${encodeURIComponent(query)}&_from=0&_to=${MAX_RESULTADOS - 1}`,
      { Accept: "application/json", "User-Agent": UA },
      fetchImpl
    );
    return parsePrecioVtex(json);
  }
  const url =
    tipo === "sodimac"
      ? `${host}/sodimac-ar/search?Ntt=${encodeURIComponent(query)}`
      : `${host}/search/?q=${encodeURIComponent(query)}`;
  const html = await fetchTexto(url, fetchImpl);
  if (html == null) return null;
  return tipo === "sodimac" ? parsePrecioSodimac(html) : parsePrecioTiendanube(html, query);
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
  const cadena = elegirCadena(q);
  const valor = await fetchPrecioCadena(cadena, q, fetchImpl);
  if (valor == null) return null;
  return { valor, fuente: CADENAS[cadena].fuente, fecha: hoy };
}

/** Precio vivo de una cadena, con su traza (de dónde y de cuándo). */
export type PrecioCadena = {
  cadena: CadenaId;
  nombre: string;
  fuente: string;
  precio: PrecioFechado | null; // null = esa cadena no devolvió dato
};

/**
 * Precio de `query` en TODAS las cadenas que vale comparar para su rubro
 * (capa 3: panel de precios vivos). Cada entrada trae de qué cadena salió y con
 * qué fecha; `precio: null` marca la cadena que no tenía el ítem. Nunca lanza:
 * las cadenas que fallan quedan en null.
 */
export async function fetchPreciosComparados(
  query: string,
  hoy: string,
  fetchImpl: typeof fetch = fetch
): Promise<PrecioCadena[]> {
  const q = query.trim();
  if (!q) return [];
  const ids = cadenasComparacion(q);
  return Promise.all(
    ids.map(async (cadena): Promise<PrecioCadena> => {
      const { nombre, fuente } = CADENAS[cadena];
      const valor = await fetchPrecioCadena(cadena, q, fetchImpl);
      return {
        cadena,
        nombre,
        fuente,
        precio: valor == null ? null : { valor, fuente, fecha: hoy },
      };
    })
  );
}
