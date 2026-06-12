import type { CerebroData } from "@/types/centro-mando";
import {
  extractBullets,
  extractSiguientePaso,
  extractTopBullets,
  pickLatestOrientacion,
  tituloOrientacion,
} from "@/lib/vault-parse";

/**
 * Lectura SERVER-SIDE del vault (repo GitHub "boveda") con caché de Next
 * (`next: { revalidate: 300 }` = ~5 min, decisión del spec §3).
 * No importar desde componentes client — solo server components / API routes.
 */

const REVALIDATE_S = 300;

function vaultRepo(): string {
  // Mismo nombre de env var que el bot (Frente C): VAULT_GITHUB_REPO.
  return process.env.VAULT_GITHUB_REPO ?? "ravnconstrucciones/boveda";
}

function ghUrl(path: string): string {
  const safe = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${vaultRepo()}/contents/${safe}`;
}

function ghHeaders(raw: boolean): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

type GhEntry = { name: string; type: string };

/** Nombres de archivo de una carpeta del vault. [] si no existe o falla. */
export async function listVaultDir(path: string): Promise<string[]> {
  const res = await fetch(ghUrl(path), {
    headers: ghHeaders(false),
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as GhEntry[];
  if (!Array.isArray(data)) return [];
  return data.filter((e) => e.type === "file").map((e) => e.name);
}

/** Contenido crudo de un archivo del vault, o null si no existe o falla. */
export async function readVaultFile(path: string): Promise<string | null> {
  const res = await fetch(ghUrl(path), {
    headers: ghHeaders(true),
    next: { revalidate: REVALIDATE_S },
  });
  if (!res.ok) return null;
  return res.text();
}

const CEREBRO_VACIO: Omit<CerebroData, "error"> = {
  orientacion: null,
  patrones: { potencian: [], frenan: [] },
  foda: { fortalezas: [], oportunidades: [], debilidades: [], amenazas: [] },
};

/** Todo lo que el módulo "El cerebro" muestra: última Orientación + Patrones + FODA. */
export async function getCerebro(): Promise<CerebroData> {
  if (!process.env.GITHUB_TOKEN) {
    return {
      ...CEREBRO_VACIO,
      error: "Falta GITHUB_TOKEN: el cerebro no puede leer el vault.",
    };
  }
  try {
    const [nombres, patronesMd, f, o, d, a] = await Promise.all([
      listVaultDir("Orientación"),
      readVaultFile("Yo/Patrones.md"),
      readVaultFile("FODA/Fortalezas.md"),
      readVaultFile("FODA/Oportunidades.md"),
      readVaultFile("FODA/Debilidades.md"),
      readVaultFile("FODA/Amenazas.md"),
    ]);

    const ultimo = pickLatestOrientacion(nombres);
    const orientacionMd = ultimo
      ? await readVaultFile(`Orientación/${ultimo}`)
      : null;

    return {
      orientacion: ultimo
        ? {
            titulo: tituloOrientacion(ultimo),
            siguientePaso: orientacionMd ? extractSiguientePaso(orientacionMd) : null,
          }
        : null,
      patrones: {
        potencian: patronesMd ? extractBullets(patronesMd, "potencian", 4) : [],
        frenan: patronesMd ? extractBullets(patronesMd, "frenan", 4) : [],
      },
      foda: {
        fortalezas: f ? extractTopBullets(f) : [],
        oportunidades: o ? extractTopBullets(o) : [],
        debilidades: d ? extractTopBullets(d) : [],
        amenazas: a ? extractTopBullets(a) : [],
      },
      error: null,
    };
  } catch (e) {
    return {
      ...CEREBRO_VACIO,
      error: e instanceof Error ? e.message : "Error leyendo el vault",
    };
  }
}
