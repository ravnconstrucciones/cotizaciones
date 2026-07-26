import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ejecutar = promisify(execFile);

const CODEX_BIN = "/opt/homebrew/bin/codex";
const TIMEOUT_MS = Number(process.env.PUENTE_CODEX_TIMEOUT_MS ?? 180_000);

/**
 * Env allowlist (fix ronda final finding 2): Codex solo busca precios en
 * internet, nunca toca la app ni Supabase — no necesita RAVN_APP_URL,
 * RAVN_AGENTE_SECRET ni, sobre todo, SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.
 * Lo mínimo para que el binario arranque.
 */
function envPermitido(): NodeJS.ProcessEnv {
  const { NODE_ENV, PATH, HOME, TERM, USER, SHELL } = process.env;
  return { NODE_ENV, PATH, HOME, TERM, USER, SHELL };
}

/**
 * Búsqueda de Codex (segunda opinión, spec: doble motor solo en búsquedas).
 * Devuelve el texto final o null si falló/expiró — el puente publica el aviso.
 *
 * OJO flags (verificado con `codex --help` / `codex exec --help` en v0.145.0):
 * `--search` es una opción GLOBAL de `codex`, no de `codex exec` — hay que
 * pasarla ANTES del subcomando (`codex --search exec ...`); puesta después
 * (`codex exec --search`) tira "unexpected argument". El resto de los flags
 * del brief (`--skip-git-repo-check`, `-C`, `--output-last-message`) sí son
 * de `codex exec` y están confirmados tal cual.
 */
export async function correrCodex(consigna: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "puente-codex-"));
  const salida = join(dir, "ultimo.txt");
  try {
    await ejecutar(
      CODEX_BIN,
      [
        "--search",
        "exec",
        "--skip-git-repo-check",
        "-C", process.env.HOME ?? "/",
        "--output-last-message", salida,
        `Sos el buscador de precios de RAVN Construcciones (zona norte GBA/CABA). ${consigna}. Respondé CORTO: tabla de valores con moneda, unidad y FUENTE (link) de cada uno, fecha de hoy. Nunca inventes: si no encontrás, decilo.`,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, env: envPermitido() }
    );
    const texto = (await readFile(salida, "utf8")).trim();
    return texto || null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
