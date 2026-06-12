/**
 * Parsers PUROS del markdown del vault (repo boveda). Sin red, sin env:
 * todo lo testeable del módulo "El cerebro" vive acá (Vitest).
 */

function sinAcentos(s: string): string {
  // Rango de marcas combinantes U+0300-U+036F escrito con escapes unicode:
  // con caracteres literales (invisibles) un copy/paste entre editores lo rompe.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Último archivo de Orientación: los nombres "YYYY-MM-DD …" ordenan lexicográficamente. */
export function pickLatestOrientacion(nombres: string[]): string | null {
  const md = nombres.filter((n) => n.toLowerCase().endsWith(".md")).sort();
  return md.length > 0 ? md[md.length - 1] : null;
}

export function tituloOrientacion(nombreArchivo: string): string {
  return nombreArchivo.replace(/\.md$/i, "");
}

/**
 * "Siguiente paso" de una Orientación:
 * 1) cuerpo de la sección cuyo heading contiene "siguiente/próximo paso";
 * 2) fallback: primer párrafo después del H1 (saltea citas, headings y hr).
 */
export function extractSiguientePaso(md: string): string | null {
  const lineas = md.split("\n");
  let captura: string[] | null = null;
  for (const linea of lineas) {
    const h = linea.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      if (captura) break;
      if (/(siguiente|proximo)s?\s+pasos?/.test(sinAcentos(h[1]))) captura = [];
      continue;
    }
    if (captura) captura.push(linea);
  }
  if (captura) {
    const texto = captura.join("\n").trim();
    if (texto) return texto;
  }
  // Fallback: primer párrafo después del H1.
  const sinH1 = md.replace(/^#\s+.*$/m, "");
  for (const bloque of sinH1.split(/\n\s*\n/)) {
    const t = bloque.trim();
    if (t && !t.startsWith("#") && !t.startsWith(">") && !t.startsWith("---")) {
      return t;
    }
  }
  return null;
}

/** Bullets de la sección cuyo heading contiene sectionTitle, hasta el próximo heading. */
export function extractBullets(md: string, sectionTitle: string, max = 5): string[] {
  const objetivo = sinAcentos(sectionTitle);
  const out: string[] = [];
  let dentro = false;
  for (const linea of md.split("\n")) {
    const h = linea.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      if (dentro) break;
      dentro = sinAcentos(h[1]).includes(objetivo);
      continue;
    }
    if (dentro) {
      const b = linea.match(/^\s*[-*]\s+(.*)$/);
      if (b) out.push(b[1].replace(/\*\*/g, "").trim());
      if (out.length >= max) break;
    }
  }
  return out;
}

/** Primeros bullets de un archivo completo (los FODA son listas planas). */
export function extractTopBullets(md: string, max = 3): string[] {
  const out: string[] = [];
  for (const linea of md.split("\n")) {
    const b = linea.match(/^\s*[-*]\s+(.*)$/);
    if (b) {
      out.push(b[1].replace(/\*\*/g, "").trim());
      if (out.length >= max) break;
    }
  }
  return out;
}
