"use client";

import { Square, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { highlight } from "../bridge/highlight";
import type { BridgeAgent, TerminalLineKind } from "../bridge/stream-format";

export type BridgeConfig = {
  url: string;
  token: string;
};

/**
 * Pedido de ola que baja desde el chat (pedido 14 de Eze): el composer de la
 * conversación es el ÚNICO disparador — acá no hay input propio. `seq`
 * distingue envíos aunque el texto se repita.
 */
export type WaveRequest = {
  prompt: string;
  seq: number;
  /**
   * Conversación operativa (17/08): el mensaje YA persistió en el hilo real y
   * la ola es de CHARLA — Fable contesta con el expediente a la vista y su
   * respuesta entra al mismo hilo. Sin esto, la ola es la genérica de dos
   * agentes.
   */
  charla?: { cotizacionId: string; mensajeId: string };
};

export type BridgeHealth = "off" | "ready" | "running";

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
  off: "Bridge apagado",
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

/**
 * La banda de la ola: el estado real de la máquina al pie del tablero. El
 * monolito ya no vive acá — es el fondo de la conversación (pedido 6) y gira
 * con el estado que este componente publica por `onHealth`.
 */
export function LiveTerminals({
  bridge,
  request,
  onHealth,
  onWaveOutcome,
  onWaveResult,
}: {
  bridge: BridgeConfig | null;
  request: WaveRequest | null;
  onHealth?: (health: BridgeHealth) => void;
  /**
   * Lo que REALMENTE pasó con la ola, para el que la disparó. El composer vive
   * en la conversación y esta banda en el tablero: en mobile son solapas
   * distintas, así que sin esto el error de despacho quedaba en una pantalla
   * que Eze no está mirando mientras la otra le decía que ya estaba lanzada.
   */
  onWaveOutcome?: (message: string) => void;
  /**
   * Cada evento `result` de la ola, en orden. La charla persiste su respuesta
   * DESPUÉS del "Ola terminada" (corre en el alTerminar del bridge), así que
   * el que quiera refrescar el hilo tiene que escuchar TODOS los results, no
   * solo el primero.
   */
  onWaveResult?: (text: string) => void;
}) {
  const [health, setHealth] = useState<BridgeHealth>("off");
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [waveNote, setWaveNote] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const streamingRef = useRef(false);
  const handledSeqRef = useRef(0);
  // Por ref para que un callback nuevo no reconecte el stream (dep de
  // connectStream es solo el bridge).
  const onWaveResultRef = useRef(onWaveResult);
  useEffect(() => {
    onWaveResultRef.current = onWaveResult;
  }, [onWaveResult]);

  const effectiveHealth: BridgeHealth = bridge ? health : "off";

  useEffect(() => {
    onHealth?.(effectiveHealth);
  }, [effectiveHealth, onHealth]);

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
        if (event.kind === "result") {
          setHealth("ready");
          onWaveResultRef.current?.(event.text);
        }
        return;
      }
      setEvents((current) => {
        // El stream se corta seguido (el bridge se reinicia, la máquina duerme)
        // y al reconectar el bridge replica la ola desde el principio. Sin este
        // filtro las líneas viejas se APILABAN sobre las que ya estaban: la
        // terminal mostraba todo dos veces y React chocaba las keys, que son la
        // seq. Una línea es la misma si es del mismo agente con la misma seq.
        if (current.some((old) => old.agent === event.agent && old.seq === event.seq)) {
          return current;
        }
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
        // El bridge contestó: cualquier error viejo ya no describe la realidad.
        // Sin esto, el aviso "sin bridge configurado no hay ola que lanzar"
        // quedaba clavado para siempre y seguía en pantalla contradiciendo a la
        // lámpara, que ya decía "Bridge listo".
        setError(null);
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

  const launchWave = useCallback(
    async (waveRequest: WaveRequest) => {
      if (!bridge) return;
      const trimmed = waveRequest.prompt.trim();
      if (!trimmed) return;
      setLaunching(true);
      setError(null);
      try {
        const body = waveRequest.charla
          ? {
              kind: "charla",
              cotizacionId: waveRequest.charla.cotizacionId,
              mensajeId: waveRequest.charla.mensajeId,
              texto: trimmed,
            }
          : { prompt: trimmed };
        const response = await fetch(`${bridge.url}/waves`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-bridge-token": bridge.token },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "El bridge rechazó la ola.");
        setEvents([]);
        setWaveNote(null);
        setHealth("running");
        connectStream();
        onWaveOutcome?.(
          waveRequest.charla
            ? "Ola despachada: Fable está contestando en el hilo."
            : "Ola despachada: Codex y Fable la están trabajando."
        );
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "No se pudo lanzar la ola.";
        setError(message);
        onWaveOutcome?.(`La ola no salió: ${message}`);
      } finally {
        setLaunching(false);
      }
    },
    [bridge, connectStream, onWaveOutcome]
  );

  useEffect(() => {
    if (!request || request.seq <= handledSeqRef.current) return;
    handledSeqRef.current = request.seq;
    if (!bridge) {
      const message = request.charla
        ? "El mensaje quedó guardado en el hilo. Sin bridge configurado no hay ola que conteste: levantalo en la Mac (npm run bridge) y reenviá."
        : "El mensaje quedó en la conversación: sin bridge configurado no hay ola que lanzar.";
      setError(message);
      onWaveOutcome?.(message);
      return;
    }
    void launchWave(request);
  }, [request, bridge, launchWave, onWaveOutcome]);

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

  const open = Boolean(bridge) && effectiveHealth !== "off";

  return (
    <section className="qz-wave qz-panel" data-open={open} aria-labelledby="wave-title">
      <header className="qz-wave__head">
        <h2 id="wave-title">La ola</h2>
        <span className="qz-lamp" data-state={effectiveHealth}>
          <i aria-hidden="true" />
          {HEALTH_LABELS[effectiveHealth]}
        </span>
        <p role="status" aria-live="polite">
          {error ??
            (!bridge ? (
              <>
                Falta <code>COTIZADOR_BRIDGE_TOKEN</code> en <code>.env.local</code>. Sin bridge no
                hay terminales: nada se simula.
              </>
            ) : effectiveHealth === "off" ? (
              <>
                El bridge no responde en <code>{bridge.url}</code>. Levantalo con{" "}
                <code>npm run bridge</code>.
              </>
            ) : launching ? (
              "Despachando la ola…"
            ) : (
              (waveNote ??
                (effectiveHealth === "running"
                  ? "Codex y Fable trabajando en paralelo."
                  : "Escribí el trabajo en la conversación: eso dispara la ola."))
            ))}
        </p>
        {effectiveHealth === "running" ? (
          <button type="button" className="qz-wave__stop" onClick={() => void stopWave()}>
            <Square size={12} aria-hidden="true" />
            Cortar
          </button>
        ) : null}
      </header>

      {open ? (
        <div className="qz-wave__grid">
          {(["codex", "fable"] as const).map((agent) => (
            <TerminalPane
              key={agent}
              agent={agent}
              running={effectiveHealth === "running"}
              events={events.filter((event) => event.agent === agent).slice(-MAX_LINES)}
            />
          ))}
        </div>
      ) : null}
    </section>
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
        <TerminalSquare size={13} strokeWidth={1.5} aria-hidden="true" />
        <h3>{label.name}</h3>
        <span>{label.cli}</span>
        {events.length > 0 ? <span className="qz-terminal__count">{events.length}</span> : null}
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
          <p className="qz-terminal__idle">{running ? "Esperando salida…" : "Sin sesión lanzada."}</p>
        ) : (
          events.map((event) => (
            <p key={event.seq} data-kind={event.kind}>
              {/* el kind pinta el fondo de la línea; el tokenizador pinta adentro */}
              {highlight(event.text, event.kind === "tool").map((piece, index) => (
                <span key={index} data-tk={piece.token}>
                  {piece.text}
                </span>
              ))}
            </p>
          ))
        )}
      </div>
    </article>
  );
}
