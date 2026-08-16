/**
 * cotizador-bridge — F1 (terminales crudas).
 *
 * Proceso local A DEMANDA (no daemon): se levanta con `npm run bridge` solo
 * mientras se cotiza y se apaga solo tras 30 min sin ola ni clientes.
 * Expone en 127.0.0.1 (nunca 0.0.0.0) un endpoint SSE con el stream en vivo
 * de una ola: una sesión headless de Claude Code (`claude -p`) y una de
 * Codex CLI (`codex exec`), ambas por suscripción local, nunca API.
 *
 * Fail-closed: sin COTIZADOR_BRIDGE_TOKEN no arranca; sin bridge el visor
 * muestra N/D. Regla del subsistema: terminal real o nada.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { formatCliLine } from "../src/bridge/stream-format.ts";

const HOST = "127.0.0.1";
const PORT = Number(process.env.COTIZADOR_BRIDGE_PORT ?? 3011);
const TOKEN = process.env.COTIZADOR_BRIDGE_TOKEN ?? "";
const ALLOWED_ORIGIN = process.env.COTIZADOR_BRIDGE_ALLOWED_ORIGIN ?? "http://localhost:3010";
const WAVE_TIMEOUT_MS = Number(process.env.COTIZADOR_BRIDGE_WAVE_TIMEOUT_MS ?? 10 * 60 * 1000);
const IDLE_EXIT_MS = 30 * 60 * 1000;
const MAX_EVENTS = 3000;
const MAX_PROMPT_LENGTH = 4000;

if (!TOKEN) {
  console.error(
    "cotizador-bridge: falta COTIZADOR_BRIDGE_TOKEN (definilo en apps/cotizador-ravn/.env.local). No arranco sin token."
  );
  process.exit(1);
}

/** @type {{
 *   id: string,
 *   prompt: string,
 *   startedAt: string,
 *   status: "running" | "done",
 *   seq: number,
 *   events: Array<{seq: number, at: string, agent: string, kind: string, text: string}>,
 *   children: Map<string, import("node:child_process").ChildProcess>,
 *   timeout: NodeJS.Timeout | null,
 * } | null} */
let wave = null;

/** @type {Set<import("node:http").ServerResponse>} */
const clients = new Set();

let lastActivity = Date.now();

function touch() {
  lastActivity = Date.now();
}

setInterval(() => {
  const idle = Date.now() - lastActivity;
  const busy = (wave && wave.status === "running") || clients.size > 0;
  if (!busy && idle >= IDLE_EXIT_MS) {
    console.log("cotizador-bridge: 30 min sin actividad, me apago (no soy un daemon).");
    process.exit(0);
  }
}, 60_000).unref();

function tokenOk(candidate) {
  if (typeof candidate !== "string" || candidate.length === 0) return false;
  const expected = Buffer.from(TOKEN);
  const received = Buffer.from(candidate);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function authorized(req, url) {
  return tokenOk(req.headers["x-bridge-token"] ?? url.searchParams.get("token") ?? "");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "content-type, x-bridge-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify(body));
}

function waveSummary() {
  if (!wave) return null;
  return {
    id: wave.id,
    prompt: wave.prompt,
    startedAt: wave.startedAt,
    status: wave.status,
    eventCount: wave.events.length,
  };
}

function pushEvent(agent, kind, text) {
  if (!wave) return;
  const event = {
    seq: (wave.seq += 1),
    at: new Date().toISOString(),
    agent,
    kind,
    text,
  };
  wave.events.push(event);
  if (wave.events.length > MAX_EVENTS) wave.events.splice(0, wave.events.length - MAX_EVENTS);
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) client.write(payload);
  touch();
}

function agentCommand(agent, prompt) {
  if (agent === "fable") {
    return {
      command: "claude",
      args: [
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
        "--allowedTools",
        "WebSearch",
        "WebFetch",
      ],
    };
  }
  return {
    command: "codex",
    args: ["exec", "--json", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never", prompt],
  };
}

function markAgentDone(agent, code) {
  if (!wave) return;
  wave.children.delete(agent);
  pushEvent(
    agent,
    code === 0 ? "status" : "raw",
    code === 0 ? "Sesión cerrada" : `✗ Sesión cerrada con código ${code ?? "?"}`
  );
  if (wave.children.size === 0 && wave.status === "running") {
    wave.status = "done";
    if (wave.timeout) clearTimeout(wave.timeout);
    pushEvent("wave", "result", "Ola terminada");
  }
}

function spawnAgent(agent, prompt) {
  const { command, args } = agentCommand(agent, prompt);
  let child;
  try {
    child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    markAgentDone(agent, null);
    pushEvent(agent, "raw", `✗ No se pudo lanzar ${command}: ${error.message}`);
    return;
  }
  wave.children.set(agent, child);
  pushEvent(agent, "status", `Lanzado ${command} (pid ${child.pid})`);

  createInterface({ input: child.stdout }).on("line", (line) => {
    for (const formatted of formatCliLine(agent, line)) {
      pushEvent(agent, formatted.kind, formatted.text);
    }
  });
  createInterface({ input: child.stderr }).on("line", (line) => {
    const flat = line.trim();
    if (flat) pushEvent(agent, "raw", flat.slice(0, 400));
  });

  child.on("error", (error) => {
    pushEvent(agent, "raw", `✗ ${command}: ${error.message}`);
    markAgentDone(agent, null);
  });
  child.on("exit", (code) => markAgentDone(agent, code));
}

function stopWave(reason) {
  if (!wave || wave.status !== "running") return;
  pushEvent("wave", "status", reason);
  for (const child of wave.children.values()) child.kill("SIGTERM");
}

function startWave(prompt) {
  wave = {
    id: randomUUID(),
    prompt,
    startedAt: new Date().toISOString(),
    status: "running",
    seq: 0,
    events: [],
    children: new Map(),
    timeout: null,
  };
  pushEvent("wave", "status", "Ola lanzada · una sesión por CLI, suscripciones locales");
  spawnAgent("codex", prompt);
  spawnAgent("fable", prompt);
  wave.timeout = setTimeout(() => stopWave("Corte por tiempo máximo de ola"), WAVE_TIMEOUT_MS);
  wave.timeout.unref();
  return wave.id;
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) throw new Error("body demasiado grande");
  }
  return body ? JSON.parse(body) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  touch();

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (!authorized(req, url)) {
    json(res, 401, { error: "Token inválido o ausente." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true, wave: waveSummary() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/waves") {
    if (wave && wave.status === "running") {
      json(res, 409, { error: "Ya hay una ola corriendo. Cortala antes de lanzar otra." });
      return;
    }
    let prompt = "";
    try {
      const body = await readBody(req);
      prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    } catch {
      json(res, 400, { error: "Body inválido." });
      return;
    }
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
      json(res, 400, { error: `El prompt es obligatorio (máx. ${MAX_PROMPT_LENGTH} caracteres).` });
      return;
    }
    const id = startWave(prompt);
    json(res, 201, { waveId: id });
    return;
  }

  if (req.method === "POST" && url.pathname === "/waves/current/stop") {
    if (!wave || wave.status !== "running") {
      json(res, 409, { error: "No hay una ola corriendo." });
      return;
    }
    stopWave("Ola cortada a pedido");
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/waves/current/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      ...corsHeaders(),
    });
    res.write(`data: ${JSON.stringify({ seq: 0, at: new Date().toISOString(), agent: "wave", kind: "status", text: wave ? "Conectado al bridge" : "Conectado al bridge · sin ola lanzada" })}\n\n`);
    if (wave) {
      for (const event of wave.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    clients.add(res);
    const heartbeat = setInterval(() => res.write(": latido\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(res);
      touch();
    });
    return;
  }

  json(res, 404, { error: "Ruta desconocida." });
});

server.listen(PORT, HOST, () => {
  console.log(`cotizador-bridge escuchando en http://${HOST}:${PORT} (origen permitido: ${ALLOWED_ORIGIN})`);
  console.log("Se apaga solo tras 30 min sin ola ni clientes conectados.");
});

process.on("SIGINT", () => {
  stopWave("Bridge apagado");
  process.exit(0);
});
