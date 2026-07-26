import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

const CLAUDE_BIN = `${process.env.HOME}/.local/bin/claude`;
const MODELO = process.env.PUENTE_MODELO ?? "sonnet";
const TIMEOUT_MS = 10 * 60 * 1000;

export type RespuestaFable = { texto: string; sessionId: string | null };

/**
 * Un turno de Fable vía Claude Code headless. Sesión persistente por
 * cotización (--resume) — el contexto de la charla vive en el CLI.
 * Env heredado: RAVN_APP_URL y RAVN_AGENTE_SECRET para los curl de Fable.
 */
export async function correrFable(args: {
  prompt: string;
  sistema: string;
  sesionPrevia: string | null;
}): Promise<RespuestaFable> {
  const cli = [
    "-p",
    "--model", MODELO,
    "--output-format", "json",
    "--dangerously-skip-permissions",
    "--append-system-prompt", args.sistema,
    ...(args.sesionPrevia ? ["--resume", args.sesionPrevia] : []),
    args.prompt,
  ];
  const { stdout } = await ejecutar(CLAUDE_BIN, cli, {
    timeout: TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    cwd: process.env.HOME,
    env: process.env,
  });
  const salida = JSON.parse(stdout) as { result?: string; session_id?: string };
  return { texto: salida.result ?? "", sessionId: salida.session_id ?? null };
}
