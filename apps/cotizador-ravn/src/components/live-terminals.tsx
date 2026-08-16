"use client";

import { Play, Radio, Square, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BridgeAgent, TerminalLineKind } from "../bridge/stream-format";

export type BridgeConfig = {
  url: string;
  token: string;
};

type BridgeHealth = "off" | "ready" | "running";

type TerminalEvent = {
  seq: number;
  at: string;
  agent: BridgeAgent | "wave";
  kind: TerminalLineKind;
  text: string;
};

const MAX_LINES = 600;
const HEALTH_INTERVAL_MS = 6000;

const AGENT_LABELS: Record<BridgeAgent, { name: string; cli: string }> = {
  codex: { name: "Codex", cli: "codex exec" },
  fable: { name: "Fable", cli: "claude -p" },
};

const HEALTH_LABELS: Record<BridgeHealth, string> = {
  off: "Bridge apagado · N/D",
  ready: "Bridge listo",
  running: "Ola corriendo",
};

function isTerminalEvent(value: unknown): value is TerminalEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TerminalEvent>;
  return (
    typeof candidate.seq === "number" &&
    typeof candidate.text === "string" &&
    (candidate.agent === "codex" || candidate.agent === "fable" || candidate.agent === "wave")
  );
}

export function LiveTerminals({ bridge }: { bridge: BridgeConfig | null }) {
  const [health, setHealth] = useState<BridgeHealth>("off");
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [waveNote, setWaveNote] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const streamingRef = useRef(false);

  const connectStream = useCallback(() => {
    if (!bridge || streamingRef.current) return;
    streamingRef.current = true;
    const source = new EventSource(
      `${bridge.url}/waves/current/stream?token=${encodeURIComponent(bridge.token)}`
    );
    sourceRef.current = source;
    source.onmessage = (message) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!isTerminalEvent(parsed)) return;
      const event = parsed;
      if (event.agent === "wave") {
        setWaveNote(event.text);
        if (event.kind === "result") setHealth("ready");
        return;
      }
      setEvents((current) => {
        const next = [...current, event];
        return next.length > MAX_LINES * 2 ? next.slice(next.length - MAX_LINES * 2) : next;
      });
    };
    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      streamingRef.current = false;
      setHealth("off");
    };
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${bridge.url}/health`, {
          headers: { "x-bridge-token": bridge.token },
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) throw new Error();
        const payload = (await response.json()) as {
          wave: { status: "running" | "done" } | null;
        };
        setHealth(payload.wave?.status === "running" ? "running" : "ready");
        if (payload.wave) connectStream();
      } catch {
        if (!cancelled) setHealth("off");
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), HEALTH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      sourceRef.current?.close();
      sourceRef.current = null;
      streamingRef.current = false;
    };
  }, [bridge, connectStream]);

  const launchWave = async () => {
    if (!bridge || launching) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setLaunching(true);
    setError(null);
    try {
      const response = await fetch(`${bridge.url}/waves`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-bridge-token": bridge.token },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "El bridge rechazó la ola.");
      setEvents([]);
      setWaveNote(null);
      setHealth("running");
      connectStream();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo lanzar la ola.");
    } finally {
      setLaunching(false);
    }
  };

  const stopWave = async () => {
    if (!bridge) return;
    try {
      await fetch(`${bridge.url}/waves/current/stop`, {
        method: "POST",
        headers: { "x-bridge-token": bridge.token },
      });
    } catch {
      // El health poll refleja el estado real.
    }
  };

  if (!bridge) {
    return (
      <section className="qz-terminals" aria-labelledby="terminals-title">
        <TerminalsHeader health="off" />
        <p className="qz-terminals__empty">
          Bridge no configurado: falta <code>COTIZADOR_BRIDGE_TOKEN</code> en{" "}
          <code>.env.local</code>. Sin bridge no hay terminales — nada se simula.
        </p>
      </section>
    );
  }

  return (
    <section className="qz-terminals" aria-labelledby="terminals-title">
      <TerminalsHeader health={health} />

      {health === "off" ? (
        <p className="qz-terminals__empty">
          El bridge no responde en <code>{bridge.url}</code>. Levantalo con{" "}
          <code>npm run bridge</code> en la Mac; este panel se conecta solo.
        </p>
      ) : (
        <>
          <form
            className="qz-terminals__launcher"
            onSubmit={(event) => {
              event.preventDefault();
              void launchWave();
            }}
          >
            <label className="qz-sr-only" htmlFor="wave-prompt">
              Qué tiene que investigar la ola
            </label>
            <input
              id="wave-prompt"
              type="text"
              value={prompt}
              disabled={health === "running" || launching}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ej.: Precio actual del m2 de porcelanato 60×60 instalado en zona norte GBA, con fuentes"
            />
            {health === "running" ? (
              <button type="button" className="qz-terminals__stop" onClick={() => void stopWave()}>
                <Square size={13} aria-hidden="true" />
                Cortar ola
              </button>
            ) : (
              <button type="submit" disabled={launching || prompt.trim().length === 0}>
                <Play size={13} aria-hidden="true" />
                Lanzar ola
              </button>
            )}
          </form>
          <p className="qz-terminals__note" role="status" aria-live="polite">
            {error ??
              waveNote ??
              "Cada ola abre una sesión real por CLI y consume las dos suscripciones (Codex y Claude)."}
          </p>

          <div className="qz-terminals__grid">
            {(["codex", "fable"] as const).map((agent) => (
              <TerminalPane
                key={agent}
                agent={agent}
                running={health === "running"}
                events={events.filter((event) => event.agent === agent).slice(-MAX_LINES)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TerminalsHeader({ health }: { health: BridgeHealth }) {
  return (
    <header className="qz-section-bar">
      <div>
        <h2 id="terminals-title">Terminales en vivo</h2>
        <p>Sesiones reales de Codex y Fable con las suscripciones locales, sin API.</p>
      </div>
      <span className="qz-terminals__health" data-state={health}>
        <Radio size={13} aria-hidden="true" />
        {HEALTH_LABELS[health]}
      </span>
    </header>
  );
}

function TerminalPane({
  agent,
  running,
  events,
}: {
  agent: BridgeAgent;
  running: boolean;
  events: TerminalEvent[];
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const label = AGENT_LABELS[agent];

  useEffect(() => {
    const body = bodyRef.current;
    if (body && pinnedRef.current) body.scrollTop = body.scrollHeight;
  }, [events]);

  return (
    <article className="qz-terminal" data-running={running && events.length > 0}>
      <header>
        <TerminalSquare size={15} strokeWidth={1.5} aria-hidden="true" />
        <h3>{label.name}</h3>
        <span>{label.cli}</span>
      </header>
      <div
        className="qz-terminal__body"
        ref={bodyRef}
        role="log"
        aria-label={`Salida en vivo de ${label.name}`}
        onScroll={() => {
          const body = bodyRef.current;
          if (!body) return;
          pinnedRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 48;
        }}
      >
        {events.length === 0 ? (
          <p className="qz-terminal__idle">
            {running ? "Esperando salida…" : "Sin sesión lanzada."}
          </p>
        ) : (
          events.map((event) => (
            <p key={event.seq} data-kind={event.kind}>
              {event.text}
            </p>
          ))
        )}
      </div>
    </article>
  );
}
