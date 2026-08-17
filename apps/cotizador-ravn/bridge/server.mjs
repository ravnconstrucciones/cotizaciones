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
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { formatCliLine } from "../src/bridge/stream-format.ts";
import { extraerJson, validarPropuesta } from "../src/bridge/intake-contract.ts";
import { intakePrompt } from "./intake-prompt.mjs";
import { charlaPrompt } from "./charla-prompt.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.COTIZADOR_BRIDGE_PORT ?? 3011);
const TOKEN = process.env.COTIZADOR_BRIDGE_TOKEN ?? "";
// La ola de intake persiste la propuesta directo en la base compartida
// (cotizador_intake, PostgREST). Sin estas dos, el intake se rechaza al
// despachar — nunca se corre una ola cuyo resultado no tiene dónde guardarse.
const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
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

function agentCommand(agent, prompt, opciones = {}) {
  if (agent === "fable") {
    // El intake necesita Read: los archivos que bajó el bridge se leen del
    // disco (PDF y fotos incluidos). Fuera del intake, Read no se habilita.
    const tools = opciones.intake ? ["Read", "WebSearch", "WebFetch"] : ["WebSearch", "WebFetch"];
    return {
      command: "claude",
      args: ["-p", prompt, "--output-format", "stream-json", "--verbose", "--allowedTools", ...tools],
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
    // La ola de intake tiene un después: validar el JSON y persistir la
    // propuesta. Corre acá, cuando el último agente cerró.
    if (wave.alTerminar) void wave.alTerminar();
  }
}

function spawnAgent(agent, prompt, opciones = {}) {
  const { command, args } = agentCommand(agent, prompt, opciones);
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
    // La línea `result` del stream-json de claude trae el texto final ENTERO —
    // de ahí sale el JSON del intake o la respuesta de la charla. Se captura
    // crudo antes de formatear (el formateador lo resume a "Terminó · Ns").
    if (opciones.captura && agent === "fable" && wave) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.type === "result" && typeof parsed.result === "string") {
          wave.resultadoFable = parsed.result;
        }
      } catch {
        // línea no-JSON: sigue al formateador como siempre
      }
    }
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

/** GET por PostgREST con el service role. Devuelve el array de filas. */
async function pgLeer(pathConQuery) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathConQuery}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${pathConQuery.split("?")[0]}: ${res.status}`);
  const filas = await res.json().catch(() => null);
  if (!Array.isArray(filas)) throw new Error(`GET ${pathConQuery.split("?")[0]}: respuesta ilegible`);
  return filas;
}

/**
 * La respuesta de la charla entra al hilo REAL (cotizacion_mensajes) por
 * PostgREST. `respuesta_a` deja la traza de qué mensaje contesta — el mismo
 * índice que ya usa el puente legacy.
 */
async function persistirMensaje(cotizacionId, { autor, texto, respuestaA, tipo }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cotizacion_mensajes`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      cotizacion_id: cotizacionId,
      autor,
      texto,
      meta: { tipo, ...(respuestaA ? { respuesta_a: respuestaA } : {}) },
    }),
  });
  const filas = res.ok ? await res.json().catch(() => []) : [];
  if (!res.ok || !Array.isArray(filas) || filas.length === 0) {
    throw new Error(`POST cotizacion_mensajes: ${res.status}`);
  }
}

/** PATCH a cotizador_intake por PostgREST. 0 filas afectadas nunca es éxito. */
async function persistirIntake(cotizacionId, cambios) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cotizador_intake?cotizacion_id=eq.${encodeURIComponent(cotizacionId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ ...cambios, actualizado_at: new Date().toISOString() }),
    }
  );
  const filas = res.ok ? await res.json().catch(() => []) : [];
  if (!res.ok || !Array.isArray(filas) || filas.length === 0) {
    throw new Error(`PATCH cotizador_intake: ${res.status}, filas ${Array.isArray(filas) ? filas.length : "?"}`);
  }
}

/**
 * La ola de INTAKE (puerta de entrada): baja los archivos persistidos, corre
 * SOLO Fable con Read habilitado y, al terminar, valida el JSON contra el
 * contrato compartido y deja la propuesta en cotizador_intake. Si algo no
 * cierra, el estado queda en `error` con el motivo — nunca se simula éxito.
 */
async function startIntakeWave({ cotizacionId, texto, archivos }) {
  const dir = await mkdtemp(join(tmpdir(), "ravn-intake-"));
  const locales = [];
  for (const [i, archivo] of archivos.entries()) {
    const res = await fetch(archivo.url);
    if (!res.ok) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`No se pudo bajar "${archivo.titulo}" (${res.status})`);
    }
    const ext = extname(new URL(archivo.url).pathname) || ".bin";
    const pathLocal = join(dir, `archivo-${i + 1}${ext}`);
    await writeFile(pathLocal, Buffer.from(await res.arrayBuffer()));
    locales.push({ titulo: archivo.titulo, pathLocal });
  }
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const prompt = intakePrompt({ texto, archivos: locales, hoy });

  wave = {
    id: randomUUID(),
    prompt: `[intake ${cotizacionId}]`,
    startedAt: new Date().toISOString(),
    status: "running",
    seq: 0,
    events: [],
    children: new Map(),
    timeout: null,
    resultadoFable: null,
    alTerminar: async () => {
      try {
        const crudo = wave.resultadoFable ?? "";
        const json = extraerJson(crudo);
        if (json === null) {
          throw new Error(crudo.trim() ? crudo.slice(0, 500) : "La ola no devolvió una propuesta.");
        }
        const v = validarPropuesta(json);
        if (!v.ok) throw new Error(`Propuesta inválida: ${v.motivo}`);
        await persistirIntake(cotizacionId, {
          estado: "propuesta_lista",
          propuesta: v.propuesta,
          error: null,
        });
        pushEvent("wave", "result", "Propuesta de reconocimiento persistida — abrila en el visor");
      } catch (error) {
        const motivo = String(error?.message ?? error);
        await persistirIntake(cotizacionId, { estado: "error", error: motivo }).catch((e) =>
          pushEvent("wave", "raw", `✗ No se pudo persistir el error: ${e.message}`)
        );
        pushEvent("wave", "raw", `✗ Intake sin propuesta: ${motivo.slice(0, 300)}`);
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
  pushEvent("wave", "status", `Ola de intake · ${locales.length} archivo(s) · desmenuzando con Fable`);
  spawnAgent("fable", prompt, { intake: true, captura: true });
  wave.timeout = setTimeout(() => stopWave("Corte por tiempo máximo de ola"), WAVE_TIMEOUT_MS);
  wave.timeout.unref();
  return wave.id;
}

/**
 * La ola de CHARLA (conversación operativa, 17/08): el mensaje de Eze YA está
 * persistido en el hilo — acá Fable lo lee con el expediente a la vista,
 * contesta, y la respuesta entra al MISMO hilo como autor `fable`. Si la ola
 * no puede responder, el motivo también queda en el hilo (autor `sistema`):
 * un fallo que solo se ve en una terminal es un fallo invisible.
 */
async function startCharlaWave({ cotizacionId, mensajeId, texto }) {
  const [cotizaciones, hiloDesc] = await Promise.all([
    pgLeer(
      `cotizaciones?id=eq.${encodeURIComponent(cotizacionId)}&select=titulo,zona,estado,desglose,total_min,total_max,precio_propuesta`
    ),
    pgLeer(
      `cotizacion_mensajes?cotizacion_id=eq.${encodeURIComponent(cotizacionId)}&select=autor,texto,creado_at&order=creado_at.desc&limit=30`
    ),
  ]);
  const cotizacion = cotizaciones[0];
  if (!cotizacion) throw new Error("La cotización de la charla no existe en la base.");
  const hilo = hiloDesc.reverse();

  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const prompt = charlaPrompt({ cotizacion, hilo, texto, hoy });

  wave = {
    id: randomUUID(),
    prompt: `[charla ${cotizacionId}]`,
    startedAt: new Date().toISOString(),
    status: "running",
    seq: 0,
    events: [],
    children: new Map(),
    timeout: null,
    resultadoFable: null,
    alTerminar: async () => {
      try {
        const respuesta = (wave.resultadoFable ?? "").trim();
        if (!respuesta) throw new Error("La ola terminó sin respuesta.");
        await persistirMensaje(cotizacionId, {
          autor: "fable",
          texto: respuesta.slice(0, 4000),
          respuestaA: mensajeId,
          tipo: "charla",
        });
        pushEvent("wave", "result", "Respuesta persistida en el hilo — se ve en el visor");
      } catch (error) {
        const motivo = String(error?.message ?? error);
        await persistirMensaje(cotizacionId, {
          autor: "sistema",
          texto: `La ola de charla no pudo responder: ${motivo.slice(0, 300)}. Reintentá desde el composer.`,
          respuestaA: mensajeId,
          tipo: "aviso",
        }).catch((e) => pushEvent("wave", "raw", `✗ No se pudo dejar el aviso en el hilo: ${e.message}`));
        pushEvent("wave", "raw", `✗ Charla sin respuesta: ${motivo.slice(0, 300)}`);
      }
    },
  };
  pushEvent("wave", "status", "Ola de charla · Fable contesta con el expediente a la vista");
  spawnAgent("fable", prompt, { captura: true });
  wave.timeout = setTimeout(() => stopWave("Corte por tiempo máximo de ola"), WAVE_TIMEOUT_MS);
  wave.timeout.unref();
  return wave.id;
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
    let body;
    try {
      body = await readBody(req);
      prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    } catch {
      json(res, 400, { error: "Body inválido." });
      return;
    }
    if (body.kind === "intake") {
      const cotizacionId = typeof body.cotizacionId === "string" ? body.cotizacionId.trim() : "";
      const texto = typeof body.texto === "string" ? body.texto.slice(0, 16_000) : "";
      const archivos = Array.isArray(body.archivos)
        ? body.archivos.filter(
            (a) => a && typeof a.titulo === "string" && typeof a.url === "string" && a.url.startsWith("https://")
          )
        : [];
      if (!cotizacionId) {
        json(res, 400, { error: "Falta la cotización del intake." });
        return;
      }
      if (!texto && archivos.length === 0) {
        json(res, 400, { error: "No hay nada que desmenuzar." });
        return;
      }
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        json(res, 503, {
          error: "El bridge no tiene SUPABASE_URL/SERVICE_ROLE_KEY: la propuesta no tendría dónde persistir.",
        });
        return;
      }
      try {
        const id = await startIntakeWave({ cotizacionId, texto, archivos });
        json(res, 201, { waveId: id });
      } catch (error) {
        json(res, 502, { error: `La ola de intake no arrancó: ${error.message}` });
      }
      return;
    }
    if (body.kind === "charla") {
      const cotizacionId = typeof body.cotizacionId === "string" ? body.cotizacionId.trim() : "";
      const mensajeId = typeof body.mensajeId === "string" ? body.mensajeId.trim() : "";
      const texto = typeof body.texto === "string" ? body.texto.slice(0, MAX_PROMPT_LENGTH) : "";
      if (!cotizacionId || !texto) {
        json(res, 400, { error: "A la charla le falta la cotización o el mensaje." });
        return;
      }
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        json(res, 503, {
          error: "El bridge no tiene SUPABASE_URL/SERVICE_ROLE_KEY: la respuesta no tendría dónde persistir.",
        });
        return;
      }
      try {
        const id = await startCharlaWave({ cotizacionId, mensajeId, texto });
        json(res, 201, { waveId: id });
      } catch (error) {
        json(res, 502, { error: `La ola de charla no arrancó: ${error.message}` });
      }
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
