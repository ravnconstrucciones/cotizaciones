/**
 * "TU DÍA" — el panel de las 8 ÁREAS DE VIDA de Ezequiel.
 *
 * Lógica PURA (parsers, sin red ni env): todo lo testeable vive acá y se
 * prueba con fixtures del vault real (repo boveda). La lectura server-side
 * (GitHub API + caché Next) está al fondo, reusando src/lib/vault.ts.
 *
 * Fuentes (vault de Obsidian):
 *  - Operación/<area>.md  → frontmatter + H1 (emoji+nombre) + secciones
 *    inline **Estado:** / **Próximo 1%:** / **Brújula:** + wikilinks.
 *  - Sistema/panel/dia.json → { fecha, maestro:{area,accion,porque},
 *    areas:{<area>: "<1% del día>"} } — el 1% del día por área + el maestro.
 *
 * NOTA — el 1% diario lo regenera el "cerebro nocturno" (daemon/morning.sh
 * que escribe Sistema/panel/dia.json). Ese job está PAUSADO: por eso la vista
 * muestra un sello de frescura si dia.json.fecha no es hoy. Esta vista SOLO
 * LEE lo que hay; no regenera nada.
 *
 * TODO(daemon): el job que reengancha la regeneración del 1% diario por área
 * vive fuera de este repo (vault: Sistema/panel/morning.sh + apply_dia.py, que
 * escriben Sistema/panel/dia.json en el repo boveda). Cuando se reactive, esta
 * vista lo levanta solo en la próxima revalidación (revalidate 300). No hay
 * nada que tocar acá — solo dejar el dia.json fresco del lado del vault.
 */

import { readVaultFile } from "@/lib/vault";

/* ------------------------------------------------------------------ */
/* Catálogo de las 8 áreas (orden de la vista: negocio primero)        */
/* ------------------------------------------------------------------ */

/**
 * `archivo` = nombre EXACTO de Operación/<archivo>.md y clave de dia.json.areas.
 * El emoji/título reales salen del H1 del .md; los de acá son sólo fallback
 * por si el archivo no carga (degradación elegante, no pantalla en blanco).
 */
// Tu Día queda enfocado en empresa + base operativa. Se sacaron las áreas de
// ocio personal (Música y Arte, Vínculos, Disfrute) por pedido de Eze. Cuerpo /
// Mente / Finanzas personales se mantienen (base que sostiene la ejecución).
export const AREAS_ORDEN = [
  { archivo: "Negocio", emojiFallback: "🏗️", grupo: "Negocio" },
  { archivo: "Construcción y Reformas", emojiFallback: "🧱", grupo: "Negocio" },
  { archivo: "Cuerpo", emojiFallback: "💪", grupo: "Vida" },
  { archivo: "Mente e Identidad", emojiFallback: "🧠", grupo: "Vida" },
  { archivo: "Finanzas personales", emojiFallback: "💰", grupo: "Vida" },
] as const;

export type AreaSlug = (typeof AREAS_ORDEN)[number]["archivo"];

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type AreaNota = {
  /** Nombre de archivo (clave estable; matchea dia.json.areas). */
  archivo: string;
  /** Emoji del H1 (o null si no hay). */
  emoji: string | null;
  /** Título limpio del H1 sin el emoji (o el nombre de archivo de fallback). */
  titulo: string;
  estado: string | null;
  proximo1: string | null;
  brujula: string | null;
  /** Wikilinks [[...]] del cuerpo, en orden de aparición, sin duplicados. */
  links: string[];
};

export type DiaMaestro = { area: string; accion: string; porque: string };

export type DiaJson = {
  fecha: string | null;
  maestro: DiaMaestro | null;
  /** 1% del día por área (clave = nombre de archivo del área). */
  areas: Record<string, string>;
};

/** Lo que la ruta /dia consume (todo junto, ya parseado). */
export type TuDiaData = {
  dia: DiaJson;
  areas: AreaNota[];
  /** Mensaje de error legible si el vault no se pudo leer (token, red). */
  error: string | null;
};

/* ------------------------------------------------------------------ */
/* Parsers PUROS                                                       */
/* ------------------------------------------------------------------ */

function sinAcentos(s: string): string {
  // Rango U+0300–U+036F (marcas combinantes) por escapes: copy/paste-safe.
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Quita el bloque de frontmatter YAML (--- … ---) del inicio, si existe. */
function quitarFrontmatter(md: string): string {
  return md.replace(/^\s*---\n[\s\S]*?\n---\n?/, "");
}

/** Primer emoji (pictográfico) del comienzo de una cadena, o null. */
function tomarEmojiInicial(s: string): { emoji: string | null; resto: string } {
  // \p{Extended_Pictographic} cubre los emojis del set; capturamos también
  // un posible variation selector (️) que les sigue.
  const m = s.match(/^(\p{Extended_Pictographic}️?)\s*/u);
  if (m) return { emoji: m[1], resto: s.slice(m[0].length) };
  return { emoji: null, resto: s };
}

/**
 * Valor de una sección inline tipo `**Etiqueta:** valor` (insensible a
 * acentos/mayúsculas). `etiqueta` se compara ya sin acentos.
 */
function valorInline(md: string, etiquetaSinAcento: string): string | null {
  for (const linea of md.split("\n")) {
    // **Estado:** ...  |  **Próximo 1%:** ...  |  **Brújula:** ...
    const m = linea.match(/^\s*\*\*([^:*]+):\*\*\s*(.*)$/);
    if (!m) continue;
    if (sinAcentos(m[1].trim()) === etiquetaSinAcento) {
      const v = m[2].trim();
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

/** Wikilinks [[...]] del markdown, en orden, sin duplicados. */
function extraerLinks(md: string): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  const re = /\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const link = m[1].trim();
    if (link && !vistos.has(link)) {
      vistos.add(link);
      out.push(link);
    }
  }
  return out;
}

/**
 * Parsea un Operación/<area>.md → { emoji, título, estado, próximo 1%,
 * brújula, links }. Robusto a campos ausentes (todo a null/[]).
 */
export function parseAreaNota(md: string, archivo: string): AreaNota {
  const cuerpo = quitarFrontmatter(md);

  // Título: primer H1. Le sacamos el emoji inicial.
  let emoji: string | null = null;
  let titulo = archivo;
  const h1 = cuerpo.match(/^#\s+(.+)$/m);
  if (h1) {
    const { emoji: e, resto } = tomarEmojiInicial(h1[1].trim());
    emoji = e;
    if (resto.trim()) titulo = resto.trim();
  }

  return {
    archivo,
    emoji,
    titulo,
    estado: valorInline(cuerpo, "estado"),
    proximo1: valorInline(cuerpo, "proximo 1%"),
    brujula: valorInline(cuerpo, "brujula"),
    links: extraerLinks(cuerpo),
  };
}

/**
 * Parsea Sistema/panel/dia.json. Degrada elegante (todo null/{}) ante JSON
 * inválido o null — NUNCA tira.
 */
export function parseDiaJson(raw: string | null): DiaJson {
  const vacio: DiaJson = { fecha: null, maestro: null, areas: {} };
  if (!raw) return vacio;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return vacio;
  }
  if (typeof data !== "object" || data === null) return vacio;
  const obj = data as Record<string, unknown>;

  const fecha = typeof obj.fecha === "string" ? obj.fecha : null;

  let maestro: DiaMaestro | null = null;
  const m = obj.maestro;
  if (m && typeof m === "object") {
    const mo = m as Record<string, unknown>;
    if (
      typeof mo.area === "string" &&
      typeof mo.accion === "string" &&
      typeof mo.porque === "string"
    ) {
      maestro = { area: mo.area, accion: mo.accion, porque: mo.porque };
    }
  }

  const areas: Record<string, string> = {};
  if (obj.areas && typeof obj.areas === "object") {
    for (const [k, v] of Object.entries(obj.areas as Record<string, unknown>)) {
      if (typeof v === "string") areas[k] = v;
    }
  }

  return { fecha, maestro, areas };
}

/* ------------------------------------------------------------------ */
/* Lectura server-side (GitHub API del vault + caché Next vía vault.ts) */
/* ------------------------------------------------------------------ */

const TU_DIA_VACIO: TuDiaData = { dia: { fecha: null, maestro: null, areas: {} }, areas: [], error: null };

/**
 * Levanta TODO lo que /dia muestra: dia.json + las 8 notas de área.
 * Si falta el token o una lectura falla por auth, devuelve `error` legible
 * (la vista lo muestra) en vez de romper.
 */
export async function getTuDia(): Promise<TuDiaData> {
  if (!process.env.GITHUB_TOKEN) {
    return {
      ...TU_DIA_VACIO,
      error: "Falta GITHUB_TOKEN: TU DÍA no puede leer el vault.",
    };
  }
  try {
    const [diaRaw, ...notasRaw] = await Promise.all([
      readVaultFile("Sistema/panel/dia.json"),
      ...AREAS_ORDEN.map((a) => readVaultFile(`Operación/${a.archivo}.md`)),
    ]);

    const areas: AreaNota[] = AREAS_ORDEN.map((a, i) => {
      const md = notasRaw[i];
      if (md) return parseAreaNota(md, a.archivo);
      // Archivo no disponible: card mínima con el fallback, sin romper la grilla.
      return {
        archivo: a.archivo,
        emoji: a.emojiFallback,
        titulo: a.archivo,
        estado: null,
        proximo1: null,
        brujula: null,
        links: [],
      };
    });

    return { dia: parseDiaJson(diaRaw), areas, error: null };
  } catch (e) {
    return {
      ...TU_DIA_VACIO,
      error: e instanceof Error ? e.message : "Error leyendo el vault",
    };
  }
}
