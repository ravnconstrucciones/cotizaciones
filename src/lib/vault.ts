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

/**
 * 401/403 = token vencido o sin permisos: NUNCA tragarlo en silencio
 * (el consumidor quedaba en blanco sin aviso). 404 sí es silencioso: el
 * archivo puede no existir todavía.
 */
function throwSiAuthFalla(status: number): void {
  if (status === 401 || status === 403) {
    throw new Error(
      "GITHUB_TOKEN inválido o vencido — renovar el token del vault (boveda)."
    );
  }
}

/** Contenido crudo de un archivo del vault, o null si no existe o falla. */
export async function readVaultFile(path: string): Promise<string | null> {
  const res = await fetch(ghUrl(path), {
    headers: ghHeaders(true),
    next: { revalidate: REVALIDATE_S },
  });
  throwSiAuthFalla(res.status);
  if (!res.ok) return null;
  return res.text();
}
