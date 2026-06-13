"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import {
  armarHilo,
  estadoMac,
  hayPensando,
  parcialVigente,
  parsearParcial,
  type MensajeTerminal,
  type ParcialHilo,
} from "@/lib/terminal-hilo";
import type { TrabajoCola } from "@/types/centro-mando";

/**
 * Módulo Terminal del cockpit: chat directo con el Claude Code de la Mac de
 * Eze, sobre el MISMO motor que la barra de comando (trabajos_cola + daemon).
 * Cada Enter inserta un trabajo 'consulta' con contexto.hilo_id; el daemon
 * corre Claude headless con --resume de la sesión del hilo y la respuesta
 * vuelve por Realtime. Estética: terminal — fondo más profundo que el resto
 * del cockpit, IBM Plex Mono para TODO, prompt ▸ parpadeante, Eze a la
 * derecha en cian tenue, la Mac a la izquierda en off-white.
 */

/** Web Speech API (mismo wiring que el CommandBar; lib.dom no lo declara). */
type ReconocimientoVoz = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type ReconocimientoVozCtor = new () => ReconocimientoVoz;

function ctorReconocimiento(): ReconocimientoVozCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: ReconocimientoVozCtor;
    webkitSpeechRecognition?: ReconocimientoVozCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Cursor de terminal: parpadeo en escalón (no fade), como un cursor real. */
function CursorPrompt({ activo = true }: { activo?: boolean }) {
  if (!activo) return <span className="text-cdm-accent">▸</span>;
  return (
    <motion.span
      aria-hidden
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 1.1, times: [0, 0.5, 0.5, 1], repeat: Infinity }}
      className="text-cdm-accent"
    >
      ▸
    </motion.span>
  );
}

function Mensaje({ m }: { m: MensajeTerminal }) {
  const esEze = m.rol === "eze";
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`flex ${esEze ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[86%] sm:max-w-[75%] ${esEze ? "text-right" : "text-left"}`}
      >
        <p
          className={`mb-1 text-[9px] uppercase tracking-[0.2em] ${
            esEze ? "text-cdm-accent/50" : "text-cdm-muted/70"
          }`}
        >
          {esEze ? "eze" : "mac"} · {fmtHora(m.ts)}
        </p>
        <div
          className={`whitespace-pre-wrap break-words border px-4 py-3 text-[13px] leading-relaxed ${
            m.esError
              ? "border-red-400/30 bg-red-400/5 text-red-400"
              : esEze
                ? "border-cdm-accent/20 bg-cdm-accent/5 text-cdm-accent/90"
                : "border-cdm-line bg-cdm-fg/[0.03] text-cdm-fg/90"
          }`}
        >
          {m.texto}
        </div>
      </div>
    </motion.div>
  );
}

export function TerminalScreen() {
  const [hilo, setHilo] = useState<string | null>(null);
  const [trabajos, setTrabajos] = useState<TrabajoCola[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latido, setLatido] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [escuchando, setEscuchando] = useState(false);
  const [micDisponible, setMicDisponible] = useState(false);
  /** Respuesta escribiéndose en vivo (broadcast "parcial" del daemon). */
  const [parcial, setParcial] = useState<ParcialHilo | null>(null);

  const hiloRef = useRef<string | null>(null);
  const recRef = useRef<ReconocimientoVoz | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const finRef = useRef<HTMLDivElement>(null);

  // ── hidratación: retoma el último hilo activo o abre uno nuevo ───────────
  useEffect(() => {
    setMicDisponible(ctorReconocimiento() !== null);
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/terminal");
        const j = await res.json();
        if (!vivo) return;
        const id: string = j.hilo ?? crypto.randomUUID();
        hiloRef.current = id;
        setHilo(id);
        setTrabajos((j.trabajos as TrabajoCola[]) ?? []);
      } catch {
        if (!vivo) return;
        const id = crypto.randomUUID();
        hiloRef.current = id;
        setHilo(id);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
      recRef.current?.stop();
    };
  }, []);

  // ── recarga del hilo (Realtime sobre trabajos_cola dispara esto) ─────────
  const cargar = useCallback(async () => {
    const id = hiloRef.current;
    if (!id) return;
    try {
      const res = await fetch(`/api/terminal?hilo=${id}`);
      const j = await res.json();
      if (res.ok && hiloRef.current === id) {
        setTrabajos((j.trabajos as TrabajoCola[]) ?? []);
      }
    } catch {
      // Realtime va a reintentar en el próximo cambio; no ensuciamos la UI.
    }
  }, []);
  useRealtimeTable("trabajos_cola", cargar);

  // ── streaming en vivo: broadcast del daemon en el topic hilo:<hilo_id> ───
  // El topic acá DEBE ser exacto (no admite el sufijo aleatorio del gotcha de
  // use-realtime-table): si quedó una instancia previa del mismo topic
  // (StrictMode dev / re-mount), se espera a que termine de irse antes de
  // crear la nueva — channel(topic) devolvería el canal moribundo y la
  // suscripción quedaría sorda.
  useEffect(() => {
    if (!hilo) return;
    const supabase = createClient();
    const topic = `hilo:${hilo}`;
    let vivo = true;
    let canal: RealtimeChannel | null = null;

    void (async () => {
      const previo = supabase
        .getChannels()
        .find((c) => c.topic === `realtime:${topic}`);
      if (previo) await supabase.removeChannel(previo);
      if (!vivo) return;
      canal = supabase
        .channel(topic)
        .on("broadcast", { event: "parcial" }, ({ payload }) => {
          const p = parsearParcial(payload);
          if (p) setParcial(p);
        })
        .on("broadcast", { event: "fin" }, ({ payload }) => {
          // Texto completo al instante; el refetch fija el mensaje desde la
          // tabla y ahí el parcial muere solo (parcialVigente → false).
          const p = parsearParcial(payload);
          if (p) setParcial(p);
          void cargar();
        })
        .subscribe();
    })();

    return () => {
      vivo = false;
      setParcial(null);
      if (canal) void supabase.removeChannel(canal);
    };
  }, [hilo, cargar]);

  // ── latido de la Mac (sistema_estado, singleton id=1) cada 30s ───────────
  const cargarLatido = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("sistema_estado")
      .select("ultimo_latido")
      .eq("id", 1)
      .maybeSingle();
    setLatido((data?.ultimo_latido as string | null) ?? null);
    setAhora(Date.now());
  }, []);

  useEffect(() => {
    void cargarLatido();
    const id = setInterval(() => void cargarLatido(), 30_000);
    return () => clearInterval(id);
  }, [cargarLatido]);

  const mensajes = armarHilo(trabajos);
  const pensando = hayPensando(trabajos);
  const mac = estadoMac(latido, new Date(ahora));
  // El parcial solo vive mientras su trabajo siga pensando; cuando la tabla
  // trae la respuesta final, manda la tabla.
  const parcialActivo = parcialVigente(parcial, trabajos) ? parcial : null;
  const parcialLen = parcialActivo?.texto.length ?? 0;

  // ── autoscroll al fondo con cada mensaje nuevo / pensando / streaming ────
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length, pensando, parcialLen]);

  function alternarDictado() {
    if (escuchando) {
      recRef.current?.stop();
      return;
    }
    const Ctor = ctorReconocimiento();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "es-AR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const dictado = Array.from(e.results, (r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (dictado) setTexto((p) => (p ? `${p} ${dictado}` : dictado));
    };
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    recRef.current = rec;
    setEscuchando(true);
    rec.start();
  }

  async function enviar() {
    const mensaje = texto.trim();
    const id = hiloRef.current;
    if (!mensaje || !id || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hilo_id: id, mensaje }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      setTexto("");
      // Eco inmediato sin esperar el round-trip de Realtime.
      setTrabajos((prev) =>
        prev.some((t) => t.id === j.trabajo.id) ? prev : [...prev, j.trabajo]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  }

  function nuevoHilo() {
    const id = crypto.randomUUID();
    hiloRef.current = id;
    setHilo(id);
    setTrabajos([]);
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div
      className="font-mono-hud relative flex min-h-[100dvh] flex-col text-cdm-fg"
      style={{
        // Fondo más profundo que el resto del cockpit: la terminal es el sótano.
        background:
          "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34, 211, 238, 0.06), transparent 60%), color-mix(in srgb, var(--cdm-bg) 62%, black)",
      }}
    >
      {/* ── header HUD ──────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 border-b border-cdm-line backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--cdm-bg) 52%, black)",
        }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-8">
          <h1 className="flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">
              {"//////"}
            </span>
            Terminal — Claude Code @ Mac de Eze
          </h1>
          <div className="ml-auto flex items-center gap-4">
            {mac === "en_linea" ? (
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-emerald-400">
                <motion.span
                  aria-hidden
                  animate={{ opacity: [1, 0.35, 1] }}
                  transition={{ repeat: Infinity, duration: 2.2 }}
                >
                  ●
                </motion.span>
                Mac en línea
              </p>
            ) : (
              <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">
                ○ Mac dormida — los mensajes esperan en cola
              </p>
            )}
            <button
              type="button"
              onClick={nuevoHilo}
              className="text-[10px] uppercase tracking-[0.18em] text-cdm-muted transition-colors hover:text-cdm-accent"
            >
              [Nuevo hilo]
            </button>
          </div>
        </div>
      </div>

      {/* ── hilo de conversación ────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-8">
        {cargando ? (
          <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-muted">
            <CursorPrompt /> conectando con la cola…
          </p>
        ) : mensajes.length === 0 ? (
          <div className="space-y-2 text-[12px] leading-relaxed text-cdm-muted">
            <p>
              <CursorPrompt activo={false} /> hilo nuevo
              {hilo ? ` · ${hilo.slice(0, 8)}` : ""}.
            </p>
            <p>
              Esto habla directo con el Claude Code de la Mac. Lo que escribas
              acá entra a la cola de trabajos y la respuesta vuelve al hilo —
              como una sesión de terminal, pero desde cualquier lado.
            </p>
            {mac === "dormida" && (
              <p className="text-amber-300/80">
                La Mac está dormida ahora: tus mensajes quedan en cola y los
                agarra apenas despierta.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <AnimatePresence initial={false}>
              {mensajes.map((m) => (
                <Mensaje key={m.id} m={m} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* respuesta escribiéndose en vivo (broadcast "parcial" del daemon) */}
        {parcialActivo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="mt-5 flex justify-start"
          >
            <div className="max-w-[86%] text-left sm:max-w-[75%]">
              <p className="mb-1 text-[9px] uppercase tracking-[0.2em] text-cdm-muted/70">
                mac · escribiendo
              </p>
              <div className="whitespace-pre-wrap break-words border border-cdm-line bg-cdm-fg/[0.03] px-4 py-3 text-[13px] leading-relaxed text-cdm-fg/90">
                {parcialActivo.texto}
                <motion.span
                  aria-hidden
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{
                    duration: 0.9,
                    times: [0, 0.5, 0.5, 1],
                    repeat: Infinity,
                  }}
                  className="text-cdm-accent"
                >
                  ▍
                </motion.span>
              </div>
            </div>
          </motion.div>
        )}

        {/* "pensando": trabajo en cola/procesando, solo hasta el PRIMER chunk */}
        <AnimatePresence>
          {pensando && !parcialActivo && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-5 flex items-center gap-2 text-[12px] ${
                mac === "en_linea" ? "text-cdm-accent/70" : "text-amber-300/80"
              }`}
            >
              <CursorPrompt />
              {mac === "en_linea"
                ? "la Mac está pensando"
                : "en cola — la Mac está dormida, responde cuando despierte"}
              <motion.span
                aria-hidden
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
              >
                …
              </motion.span>
            </motion.p>
          )}
        </AnimatePresence>
        <div ref={finRef} />
      </div>

      {/* ── input: prompt de terminal ───────────────────────────────────── */}
      <div
        className="sticky bottom-0 z-20 border-t border-cdm-line backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--cdm-bg) 52%, black)",
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-4 sm:px-8"
        >
          <CursorPrompt activo={!texto} />
          <input
            ref={inputRef}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              escuchando ? "escuchando…" : "escribile a la Mac y Enter…"
            }
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-cdm-fg caret-cdm-accent placeholder:text-cdm-muted/40 focus:outline-none"
          />
          {micDisponible && (
            <button
              type="button"
              onClick={alternarDictado}
              title={escuchando ? "Detener dictado" : "Dictar mensaje"}
              aria-label={escuchando ? "Detener dictado" : "Dictar mensaje por voz"}
              className={`flex h-8 w-8 shrink-0 items-center justify-center transition-colors ${
                escuchando
                  ? "text-red-400"
                  : "text-cdm-muted hover:text-cdm-fg"
              }`}
            >
              {escuchando ? (
                <span className="relative flex items-center justify-center">
                  <motion.span
                    aria-hidden
                    animate={{ opacity: [0.8, 0.2, 0.8] }}
                    transition={{ repeat: Infinity, duration: 1.4 }}
                    className="absolute -inset-1.5 rounded-full border border-red-400/60"
                  />
                  <Square className="h-3.5 w-3.5 fill-current" />
                </span>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={!texto.trim() || enviando}
            className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-cdm-accent transition-opacity disabled:opacity-30"
          >
            {enviando ? "[enviando…]" : "[enviar]"}
          </button>
        </form>
        {error && (
          <p className="mx-auto w-full max-w-3xl px-4 pb-3 text-[11px] text-red-400 sm:px-8">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
