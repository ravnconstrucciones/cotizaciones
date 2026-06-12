"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUp,
  Calculator,
  MessageCircleQuestion,
  Mic,
  Paperclip,
  PenLine,
  Square,
  X,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { parseComandoInline } from "@/lib/comando-inline";
import { validarImagenAdjunta } from "@/lib/adjunto-imagen";
import {
  REFERENCIAS_BUCKET,
  uploadImagenTablero,
} from "@/lib/referencias-storage";
import {
  TIPOS_TRABAJO,
  type TipoTrabajo,
  type TrabajoCola,
} from "@/types/centro-mando";
import { LiquidGlass } from "./liquid-glass";

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
  procesando: "text-cdm-accent",
  en_revision: "text-amber-300",
  completado: "text-emerald-400",
  error: "text-red-400",
  cancelado: "text-cdm-muted",
};

const CHIP_ICONO: Record<TipoTrabajo, React.ElementType> = {
  cotizar: Calculator,
  redactar: PenLine,
  consulta: MessageCircleQuestion,
  orden: Zap,
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

function formatoTimer(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Visualizador de barras del dictado (ref. VoiceRecorder del AI Prompt Box
 * de 21st.dev). Decorativo: la Web Speech API no expone niveles de audio,
 * así que las barras laten con alturas pseudoaleatorias — feedback de
 * "te estoy escuchando" sin abrir un segundo stream de micrófono.
 */
function VisualizadorBarras() {
  const reducirMovimiento = useReducedMotion();
  const alturas = useMemo(
    () => Array.from({ length: 28 }, () => 6 + Math.random() * 14),
    []
  );
  return (
    <div aria-hidden className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden">
      {alturas.map((h, i) =>
        reducirMovimiento ? (
          <span
            key={i}
            className="w-[2px] rounded-full bg-cdm-accent/60"
            style={{ height: h * 0.6 }}
          />
        ) : (
          <motion.span
            key={i}
            className="w-[2px] rounded-full bg-cdm-accent/70"
            animate={{ height: [4, h, 4] }}
            transition={{
              repeat: Infinity,
              duration: 0.9 + (i % 5) * 0.12,
              delay: i * 0.04,
              ease: "easeInOut",
            }}
          />
        )
      )}
    </div>
  );
}

/**
 * Módulo 1 del cockpit (spec §4.1): la orden viaja a `trabajos_cola` vía
 * POST /api/trabajos y el daemon Mac la levanta; el progreso se ve en vivo
 * por Realtime (la fila cambia de estado → refetch). EXCEPCIÓN inline:
 * "anotá X" crea la tarea directa en `tareas` (parseComandoInline) sin
 * pasar por la cola — confirmación inmediata, sin daemon. Si hay imagen
 * adjunta SIEMPRE se encola (la tabla `tareas` no tiene media; el daemon sí
 * sabe leer `contexto.media`).
 *
 * Skin iteración 2: AI Prompt Box completo (ref. easemize/ai-prompt-box de
 * 21st.dev) — textarea autosize (Enter envía, Shift+Enter salto), imagen
 * real (clip + paste + drag&drop → bucket `referencias` → contexto.media),
 * dictado con visualizador de barras, chips de tipo con spring y botón
 * contextual. Superficie liquid glass (LiquidGlass, dark). Sin Radix: el
 * dialog de la imagen es propio (Escape + backdrop) y los tooltips son
 * `title` nativos — menos dependencias, mismo resultado.
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
  const [recSeg, setRecSeg] = useState(0);
  const [imagen, setImagen] = useState<File | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [verImagen, setVerImagen] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const recRef = useRef<ReconocimientoVoz | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imagenUrlRef = useRef<string | null>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    setMicDisponible(ctorReconocimiento() !== null);
    return () => {
      recRef.current?.stop();
      if (imagenUrlRef.current) URL.revokeObjectURL(imagenUrlRef.current);
    };
  }, []);

  // Autosize del textarea (hasta 240px, después scrollea — .cdm-textarea).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [prompt]);

  // Timer mm:ss mientras se dicta.
  useEffect(() => {
    if (!escuchando) {
      setRecSeg(0);
      return;
    }
    const id = setInterval(() => setRecSeg((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [escuchando]);

  // Escape cierra el dialog de la imagen.
  useEffect(() => {
    if (!verImagen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVerImagen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verImagen]);

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

  function adjuntarImagen(file: File) {
    const err = validarImagenAdjunta(file);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (imagenUrlRef.current) URL.revokeObjectURL(imagenUrlRef.current);
    const url = URL.createObjectURL(file);
    imagenUrlRef.current = url;
    setImagen(file);
    setImagenUrl(url);
  }

  function quitarImagen() {
    if (imagenUrlRef.current) URL.revokeObjectURL(imagenUrlRef.current);
    imagenUrlRef.current = null;
    setImagen(null);
    setImagenUrl(null);
    setVerImagen(false);
  }

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

  async function enviar() {
    const texto = prompt.trim();
    if ((!texto && !imagen) || enviando) return;
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      // Caso inline (spec §4.1): "anotá …" → tarea directa en `tareas`,
      // la MISMA tabla que usa el módulo Pendientes. Solo sin imagen.
      const inline = imagen
        ? ({ inline: false } as const)
        : parseComandoInline(texto);
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

      // Imagen adjunta: primero al bucket `referencias`, el path viaja en
      // contexto.media — conexión REAL, no decorativa.
      let contexto: Record<string, unknown> = {};
      if (imagen) {
        const { path, error: upErr } = await uploadImagenTablero(imagen);
        if (upErr) {
          setError(`No se pudo subir la imagen: ${upErr}`);
          return;
        }
        contexto = {
          media: [{ bucket: REFERENCIAS_BUCKET, path, tipo: "imagen" }],
        };
      }

      const res = await fetch("/api/trabajos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          prompt: texto || "Imagen adjunta (sin texto).",
          contexto,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      setPrompt("");
      quitarImagen();
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  const hayContenido = Boolean(prompt.trim() || imagen);

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="relative z-10"
    >
      <LiquidGlass className="cdm-prompt rounded-[26px]" blur={14} tint={0.06}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setArrastrando(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setArrastrando(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setArrastrando(false);
            const file = Array.from(e.dataTransfer.files).find((f) =>
              f.type.startsWith("image/")
            );
            if (file) adjuntarImagen(file);
          }}
          className="relative"
        >
          {arrastrando && (
            <div className="pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-[22px] border border-dashed border-cdm-accent/60 bg-cdm-bg/70">
              <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-accent">
                Soltá la imagen
              </p>
            </div>
          )}

          {/* Preview de la imagen adjunta: click amplía, X la saca. */}
          <AnimatePresence>
            {imagen && imagenUrl && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 px-5 pt-3">
                  <div className="group relative h-14 w-14 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVerImagen(true)}
                      className="h-14 w-14 cursor-pointer overflow-hidden rounded-xl border border-cdm-line transition-transform hover:scale-[1.04]"
                      aria-label="Ver imagen adjunta"
                      title="Ver imagen"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- object URL local, next/image no aplica */}
                      <img
                        src={imagenUrl}
                        alt="Imagen adjunta"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={quitarImagen}
                      aria-label="Quitar imagen adjunta"
                      title="Quitar imagen"
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-cdm-line bg-cdm-bg text-cdm-muted shadow-md transition-colors hover:text-cdm-fg"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="truncate text-[10px] text-cdm-muted">
                    {imagen.name || "imagen pegada"} · va al trabajo como
                    referencia
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Textarea autosize ⟷ visualizador de dictado (swap animado). */}
          <AnimatePresence mode="wait" initial={false}>
            {escuchando ? (
              <motion.div
                key="rec"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-3 px-5 pb-2 pt-4"
              >
                <motion.span
                  aria-hidden
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="h-2 w-2 shrink-0 rounded-full bg-red-400"
                />
                <span className="shrink-0 text-[11px] uppercase tracking-[0.2em] text-cdm-accent">
                  Escuchando
                </span>
                <VisualizadorBarras />
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-cdm-muted">
                  {formatoTimer(recSeg)}
                </span>
              </motion.div>
            ) : (
              <motion.textarea
                key="ta"
                ref={taRef}
                rows={1}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                onPaste={(e) => {
                  const item = Array.from(e.clipboardData.items).find((i) =>
                    i.type.startsWith("image/")
                  );
                  const file = item?.getAsFile();
                  if (file) {
                    e.preventDefault();
                    adjuntarImagen(file);
                  }
                }}
                placeholder='Ordená algo: "cotizame baño completo en Pilar", "anotá llamar a Oribe", "redactá el detalle de la obra Saavedra"…'
                className="cdm-textarea w-full resize-none bg-transparent px-5 pb-2 pt-4 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none"
              />
            )}
          </AnimatePresence>

          <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) adjuntarImagen(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Adjuntar imagen (también podés pegarla o arrastrarla)"
              aria-label="Adjuntar imagen"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-cdm-muted transition-colors hover:bg-cdm-fg/5 hover:text-cdm-fg"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <span aria-hidden className="h-4 w-px bg-cdm-line" />

            {/* Chips de tipo: segmentado liquid glass + píldora cian spring. */}
            <LiquidGlass className="rounded-full" blur={4} tint={0.05}>
              <div className="flex items-center gap-0.5 p-0.5">
                {TIPOS_TRABAJO.map((t) => {
                  const activo = tipo === t;
                  const Icono = CHIP_ICONO[t];
                  return (
                    <motion.button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      whileTap={{ scale: 0.95 }}
                      aria-pressed={activo}
                      className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                        activo
                          ? "text-cdm-bg"
                          : "text-cdm-muted hover:text-cdm-fg"
                      }`}
                    >
                      {activo && (
                        <motion.span
                          layoutId="cdm-chip-activo"
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-cdm-accent shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 32,
                          }}
                        />
                      )}
                      <motion.span
                        aria-hidden
                        className="relative"
                        animate={{ rotate: activo ? 360 : 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 260,
                          damping: 24,
                        }}
                      >
                        <Icono className="h-3 w-3" />
                      </motion.span>
                      <span className="relative">{t}</span>
                    </motion.button>
                  );
                })}
              </div>
            </LiquidGlass>

            <div className="ml-auto flex items-center gap-2">
              {/* Mic secundario: solo cuando ya hay texto (el botón principal pasa a enviar). */}
              {hayContenido && micDisponible && !escuchando && (
                <button
                  type="button"
                  onClick={alternarDictado}
                  title="Dictar más texto"
                  aria-label="Dictar comando por voz"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-cdm-muted transition-colors hover:bg-cdm-fg/5 hover:text-cdm-fg"
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}

              {/* Botón contextual (ref. AI Prompt Box): Stop ◀ dictando / ↑ con contenido / Mic vacío. */}
              {escuchando ? (
                <button
                  type="button"
                  onClick={alternarDictado}
                  title="Detener dictado"
                  aria-label="Detener dictado"
                  className="relative flex h-8 w-8 items-center justify-center rounded-full bg-cdm-fg/10 text-red-400 transition-colors hover:bg-cdm-fg/15"
                >
                  <motion.span
                    aria-hidden
                    animate={{ opacity: [0.8, 0.2, 0.8] }}
                    transition={{ repeat: Infinity, duration: 1.4 }}
                    className="absolute inset-0 rounded-full border border-red-400/60"
                  />
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : hayContenido || enviando ? (
                <button
                  type="submit"
                  disabled={enviando || !hayContenido}
                  title="Ejecutar comando"
                  aria-label="Ejecutar comando"
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed ${
                    hayContenido
                      ? "bg-cdm-accent text-cdm-bg shadow-[0_0_16px_rgba(34,211,238,0.35)] hover:opacity-90"
                      : "bg-cdm-fg/10 text-cdm-muted"
                  } ${enviando ? "opacity-50" : ""}`}
                >
                  {enviando ? (
                    <motion.span
                      aria-hidden
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.9,
                        ease: "linear",
                      }}
                      className="h-3.5 w-3.5 rounded-full border border-cdm-bg/30 border-t-cdm-bg"
                    />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={alternarDictado}
                  disabled={!micDisponible}
                  title={
                    micDisponible
                      ? "Dictar comando"
                      : "Dictado no disponible en este navegador"
                  }
                  aria-label="Dictar comando por voz"
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-cdm-fg/10 text-cdm-muted transition-colors hover:bg-cdm-fg/15 hover:text-cdm-fg ${
                    micDisponible ? "" : "cursor-not-allowed opacity-40"
                  }`}
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
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
                      className="h-1.5 w-1.5 shrink-0 bg-cdm-accent"
                    />
                  )}
                  <span className="truncate text-[11px] text-cdm-muted">
                    {t.prompt}
                  </span>
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
      </LiquidGlass>

      {/* Dialog de vista de la imagen (propio, sin Radix: Escape + backdrop). */}
      <AnimatePresence>
        {verImagen && imagenUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Imagen adjunta ampliada"
            onClick={() => setVerImagen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-cdm-bg/85 p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 6 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[82vh] max-w-3xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL local */}
              <img
                src={imagenUrl}
                alt="Imagen adjunta ampliada"
                className="max-h-[82vh] w-auto border border-cdm-line object-contain shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
              />
              <button
                type="button"
                onClick={() => setVerImagen(false)}
                aria-label="Cerrar vista de imagen"
                className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-cdm-line bg-cdm-bg text-cdm-fg shadow-lg transition-colors hover:bg-cdm-panel"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
