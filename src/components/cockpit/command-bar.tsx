"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { parseComandoInline } from "@/lib/comando-inline";
import {
  TIPOS_TRABAJO,
  type TipoTrabajo,
  type TrabajoCola,
} from "@/types/centro-mando";

const ESTADO_LABEL: Record<TrabajoCola["estado"], string> = {
  pendiente: "En cola",
  esperando_datos: "Esperando datos",
  procesando: "Procesando",
  en_revision: "En revisión",
  completado: "Completado",
  error: "Error",
  cancelado: "Cancelado",
};

const ESTADO_COLOR: Record<TrabajoCola["estado"], string> = {
  pendiente: "text-cdm-muted",
  esperando_datos: "text-amber-300",
  procesando: "text-cdm-taupe",
  en_revision: "text-amber-300",
  completado: "text-emerald-400",
  error: "text-red-400",
  cancelado: "text-cdm-muted",
};

/**
 * Dictado por voz (Web Speech API). lib.dom no declara SpeechRecognition,
 * así que definimos el mínimo que usamos (Chrome/Safari: webkit prefix).
 */
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

/**
 * Módulo 1 del cockpit (spec §4.1): la orden viaja a `trabajos_cola` vía
 * POST /api/trabajos y el daemon Mac la levanta; el progreso se ve en vivo
 * por Realtime (la fila cambia de estado → refetch). EXCEPCIÓN inline:
 * "anotá X" crea la tarea directa en `tareas` (parseComandoInline) sin
 * pasar por la cola — confirmación inmediata, sin daemon.
 *
 * Skin: prompt box flotante (referencia "AI Prompt Box" de 21st.dev) —
 * única pieza con radius generoso del cockpit; el resto mantiene radius 0.
 */
export function CommandBar() {
  const [prompt, setPrompt] = useState("");
  const [tipo, setTipo] = useState<TipoTrabajo>("orden");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [trabajos, setTrabajos] = useState<TrabajoCola[]>([]);
  const [escuchando, setEscuchando] = useState(false);
  const [micDisponible, setMicDisponible] = useState(false);
  const recRef = useRef<ReconocimientoVoz | null>(null);

  useEffect(() => {
    setMicDisponible(ctorReconocimiento() !== null);
    return () => recRef.current?.stop();
  }, []);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("trabajos_cola")
      .select("*")
      .order("creado_at", { ascending: false })
      .limit(4);
    setTrabajos((data as TrabajoCola[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("trabajos_cola", cargar);

  /** Dicta el comando con la Web Speech API y lo agrega al prompt. */
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
      if (dictado) setPrompt((p) => (p ? `${p} ${dictado}` : dictado));
    };
    rec.onend = () => setEscuchando(false);
    rec.onerror = () => setEscuchando(false);
    recRef.current = rec;
    setEscuchando(true);
    rec.start();
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = prompt.trim();
    if (!texto || enviando) return;
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      // Caso inline (spec §4.1): "anotá …" → tarea directa en `tareas`,
      // la MISMA tabla que usa el módulo Pendientes. Sin trabajos_cola.
      const inline = parseComandoInline(texto);
      if (inline.inline) {
        const supabase = createClient();
        const { error: insErr } = await supabase
          .from("tareas")
          .insert({ texto: inline.texto, origen: "web" });
        if (insErr) {
          setError(insErr.message);
          return;
        }
        setPrompt("");
        setOk(`Anotado en Pendientes: "${inline.texto}"`);
        return;
      }

      const res = await fetch("/api/trabajos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, prompt: texto }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      setPrompt("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="cdm-prompt relative z-10 overflow-hidden rounded-[26px]"
    >
      <form onSubmit={enviar}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Ordená algo: "cotizame baño completo en Pilar", "anotá llamar a Oribe", "redactá el detalle de la obra Saavedra"…'
          className="w-full bg-transparent px-5 pb-2 pt-4 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-1">
          <button
            type="button"
            aria-disabled
            title="Adjuntar — próximamente"
            aria-label="Adjuntar archivo (próximamente)"
            className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full text-cdm-muted/50 transition-colors hover:bg-cdm-fg/5 hover:text-cdm-muted"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <span aria-hidden className="mx-1 h-4 w-px bg-cdm-line" />
          {TIPOS_TRABAJO.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                tipo === t
                  ? "border-cdm-taupe bg-cdm-taupe text-cdm-bg"
                  : "border-cdm-line text-cdm-muted hover:border-cdm-taupe/40 hover:text-cdm-fg"
              }`}
            >
              {t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={alternarDictado}
              title={
                micDisponible
                  ? escuchando
                    ? "Detener dictado"
                    : "Dictar comando"
                  : "Dictado no disponible en este navegador"
              }
              aria-label="Dictar comando por voz"
              className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                escuchando
                  ? "bg-cdm-taupe/20 text-cdm-taupe"
                  : "text-cdm-muted hover:bg-cdm-fg/5 hover:text-cdm-fg"
              } ${micDisponible ? "" : "cursor-not-allowed opacity-40"}`}
            >
              {escuchando && (
                <motion.span
                  aria-hidden
                  animate={{ opacity: [0.8, 0.2, 0.8] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                  className="absolute inset-0 rounded-full border border-cdm-taupe/70"
                />
              )}
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={enviando || !prompt.trim()}
              aria-label="Ejecutar comando"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed ${
                prompt.trim()
                  ? "bg-cdm-taupe text-cdm-bg shadow-[0_0_16px_rgba(200,180,154,0.35)] hover:opacity-90"
                  : "bg-cdm-fg/10 text-cdm-muted"
              } ${enviando ? "opacity-50" : ""}`}
            >
              {enviando ? (
                <motion.span
                  aria-hidden
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                  className="h-3.5 w-3.5 rounded-full border border-cdm-bg/30 border-t-cdm-bg"
                />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </form>
      {error && (
        <p className="border-t border-cdm-line px-5 py-2 text-[11px] text-red-400">
          {error}
        </p>
      )}
      {ok && (
        <p className="border-t border-cdm-line px-5 py-2 text-[11px] text-emerald-400">
          {ok}
        </p>
      )}
      {trabajos.length > 0 && (
        <ul className="flex flex-col divide-y divide-cdm-line border-t border-cdm-line sm:flex-row sm:divide-x sm:divide-y-0">
          <AnimatePresence initial={false}>
            {trabajos.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex min-w-0 flex-1 items-center gap-2 px-4 py-2"
              >
                {(t.estado === "procesando" || t.estado === "pendiente") && (
                  <motion.span
                    animate={{ opacity: [1, 0.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="h-1.5 w-1.5 shrink-0 bg-cdm-taupe"
                  />
                )}
                <span className="truncate text-[11px] text-cdm-muted">{t.prompt}</span>
                <span
                  className={`ml-auto shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_COLOR[t.estado]}`}
                >
                  {ESTADO_LABEL[t.estado]}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
