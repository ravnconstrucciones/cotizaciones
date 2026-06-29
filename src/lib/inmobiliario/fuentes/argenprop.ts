import type { AvisoNormalizado } from "@/lib/inmobiliario/tipos";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/** Entidades nombradas mínimas que aparecen en los avisos de Argenprop. */
const ENTIDADES_NOMBRADAS: Record<string, string> = {
  "&plus;": "+",
  "&aacute;": "á",
  "&eacute;": "é",
  "&iacute;": "í",
  "&oacute;": "ó",
  "&uacute;": "ú",
  "&ntilde;": "ñ",
  "&Aacute;": "Á",
  "&Eacute;": "É",
  "&Iacute;": "Í",
  "&Oacute;": "Ó",
  "&Uacute;": "Ú",
  "&Ntilde;": "Ñ",
  "&amp;": "&",
  "&nbsp;": " ",
};

/** Decodifica las entidades HTML presentes en el texto de los avisos. */
function decodificarEntidades(s: string): string {
  let out = s;
  // Entidades específicas relevantes (m² y º van primero por frecuencia).
  out = out.replace(/&#xB2;/g, "²").replace(/&#xBA;/g, "º");
  for (const [ent, val] of Object.entries(ENTIDADES_NOMBRADAS)) {
    out = out.split(ent).join(val);
  }
  // Numéricas hexadecimales restantes (&#xNN;).
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  // Numéricas decimales restantes (&#NNN;).
  out = out.replace(/&#(\d+);/g, (_m, dec) =>
    String.fromCodePoint(parseInt(dec, 10)),
  );
  return out;
}

/** Hash de cadena estable (variante djb2) devuelto como hex. */
function hashTexto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  // Forzar a entero sin signo de 32 bits y a hex.
  return (h >>> 0).toString(16);
}

/**
 * Parser puro de la página de listado de Argenprop.
 * Divide el HTML por cada card de precio y extrae precio (USD), m² y sub-barrio.
 */
export function parsearArgenprop(
  html: string,
  zonaNombre: string,
): AvisoNormalizado[] {
  const capturadoEn = new Date().toISOString();
  // El primer chunk es la cabecera de la página, antes del primer card.
  const chunks = html.split('class="card__price"').slice(1);
  const avisos: AvisoNormalizado[] = [];

  for (const chunk of chunks) {
    const bruto = chunk.slice(0, 1600);
    let texto = bruto.replace(/<[^>]+>/g, " ");
    texto = decodificarEntidades(texto);
    texto = texto.replace(/\s+/g, " ").trim();

    const mPrecio = texto.match(/USD\s*([\d.]+)/);
    const mM2 =
      texto.match(/(\d{1,4})\s*m²\s*cub/) || texto.match(/(\d{1,4})\s*m²/);
    if (!mPrecio || !mM2) continue;

    const precioUsd = parseInt(mPrecio[1].replace(/\./g, ""), 10);
    const m2 = parseInt(mM2[1], 10);
    if (!precioUsd || !m2) continue;
    if (precioUsd <= 10000) continue;
    if (m2 < 15 || m2 >= 2000) continue;

    const mBarrio = texto.match(/en Venta en ([^,]+),/);
    const zonaMatch = mBarrio ? mBarrio[1].trim() : zonaNombre;

    const usdPorM2 = Math.round(precioUsd / m2);
    const fuenteId = hashTexto(`${texto.slice(0, 120)}|${precioUsd}|${m2}`);

    avisos.push({
      fuente: "argenprop",
      tipoDato: "publicacion",
      fuenteId,
      zonaMatch,
      operacion: "venta",
      tipoProp: "departamento",
      precioUsd,
      m2,
      usdPorM2,
      ambientes: null,
      antiguedad: null,
      capturadoEn,
    });
  }

  return avisos;
}

/**
 * Obtiene la página en vivo de Argenprop y la parsea.
 * Lanza si la respuesta no es 200 para que el caller maneje el error.
 */
export async function obtenerArgenprop(
  zonaNombre: string,
  slug: string,
): Promise<AvisoNormalizado[]> {
  const url = `https://www.argenprop.com/departamentos/venta/${slug}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Argenprop ${res.status} para ${slug}`);
  return parsearArgenprop(await res.text(), zonaNombre);
}
