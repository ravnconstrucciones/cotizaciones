"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import type { MensajeHilo } from "@/lib/cotizador/conversacion";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

/**
 * Chat de la mesa a tres voces (spec 2026-07-25): el hilo vivo de
 * cotizacion_mensajes donde Eze, Fable y Codex conversan sobre ESTA
 * cotización. Hermano de ConversacionPanel (hilo legacy trabajos+eventos);
 * este consume /mensajes, que además mezcla ambos hilos en una sola línea
 * de tiempo. El chip de motor lee `puente_latidos` vía `motor_conectado`.
 */

/** Identidad visual de cada voz del hilo (mesa conversacional). */
const VOZ: Record<string, { nombre: string; clase: string }> = {
  eze: { nombre: "Eze", clase: "border-cdm-accent/40 bg-cdm-accent/10 text-cdm-fg" },
  fable: { nombre: "Fable", clase: "cdm-chip border-cdm-line text-cdm-fg/90" },
  codex: { nombre: "Codex", clase: "border-emerald-400/30 bg-emerald-400/5 text-cdm-fg/90" },
  sistema: { nombre: "Sistema", clase: "border-cdm-line bg-transparent text-cdm-muted" },
};

function horaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Burbuja({ mensaje }: { mensaje: MensajeHilo }) {
  const esEze = mensaje.autor === "eze";
  const voz = VOZ[mensaje.autor] ?? VOZ.sistema;
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex flex-col ${esEze ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[88%] border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${voz.clase}`}
      >
        {mensaje.texto}
      </div>
      <span className="mt-1 text-[9px] uppercase tracking-[0.14em] text-cdm-muted/70">
        {voz.nombre} · {mensaje.etiqueta} · {horaCorta(mensaje.fecha)}
      </span>
    </motion.li>
  );
}

export function MesaChat({
  cotizacionId,
  onActividadMotor,
}: {
  cotizacionId: string;
  /** Se dispara cuando llega un mensaje de fable/codex (refrescar desglose/propuesta). */
  onActividadMotor: () => void;
}) {
  const [mensajes, setMensajes] = useState<MensajeHilo[] | null>(null);
  const [motorConectado, setMotorConectado] = useState<boolean | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const ultimoMotorRef = useRef<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/mensajes`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return;
      setMensajes(json.mensajes ?? []);
      setMotorConectado(Boolean(json.motor_conectado));
      // Si llegó un mensaje nuevo de un motor, la mesa refresca datos.
      const ultimoMotor = [...(json.mensajes ?? [])]
        .reverse()
        .find((m: MensajeHilo) => m.autor === "fable" || m.autor === "codex");
      if (ultimoMotor && ultimoMotor.id !== ultimoMotorRef.current) {
        ultimoMotorRef.current = ultimoMotor.id;
        onActividadMotor();
      }
    } catch {
      // best-effort: la mesa sigue funcionando sin el hilo
    }
  }, [cotizacionId, onActividadMotor]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("cotizacion_mensajes", cargar);
  // Latido: el estado del motor se refresca aunque no haya mensajes nuevos.
  useEffect(() => {
    const t = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(t);
  }, [cargar]);
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes]);

  // "Fable está laburando…": el último mensaje es de Eze y el motor está vivo.
  const esperandoMotor =
    motorConectado === true &&
    (mensajes?.length ?? 0) > 0 &&
    mensajes![mensajes!.length - 1].autor === "eze";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al enviar");
      setTexto("");
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cdm-glass flex min-h-0 flex-col" aria-label="Mesa a tres voces">
      <header className="flex items-baseline justify-between gap-2 border-b border-cdm-line bg-[linear-gradient(90deg,rgba(34,211,238,0.07),transparent_60%)] px-4 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
          Mesa
        </h2>
        <span
          className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] ${
            motorConectado === null
              ? "text-cdm-muted"
              : motorConectado
                ? "text-emerald-400"
                : "text-red-400"
          }`}
        >
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              motorConectado === null
                ? "bg-cdm-muted"
                : motorConectado
                  ? "bg-emerald-400"
                  : "bg-red-400"
            }`}
          />
          {/* null = todavía no llegó el primer fetch del latido: no afirmamos
              "desconectado" en rojo antes de saber el estado real (fix ronda 1,
              finding 3). */}
          {motorConectado === null
            ? "verificando motor…"
            : motorConectado
              ? "motor conectado"
              : "motor desconectado — la Mac tiene que estar prendida"}
        </span>
      </header>

      <div className="min-h-0 max-h-[420px] flex-1 overflow-y-auto p-4">
        {mensajes === null ? (
          <SkeletonGlass filas={3} alto="h-2.5" anchos={["w-3/4", "w-1/2", "w-2/3"]} />
        ) : mensajes.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-cdm-muted">
            Sin conversación todavía. Escribile a Fable qué hay que cotizar y la mesa arranca acá.
          </p>
        ) : (
          <ul className="space-y-3">
            {mensajes.map((m) => (
              <Burbuja key={m.id} mensaje={m} />
            ))}
          </ul>
        )}
        {esperandoMotor && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-[10px] uppercase tracking-[0.14em] text-cdm-accent/70"
          >
            Fable está laburando…
          </motion.p>
        )}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} className="border-t border-cdm-line p-3">
        <div className="cdm-prompt flex items-end gap-2 rounded-[26px] px-3 py-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(e);
              }
            }}
            rows={2}
            placeholder="Contale a Fable qué hay que cotizar…"
            aria-label="Mensaje para la mesa"
            className="cdm-textarea max-h-32 w-full resize-none bg-transparent text-xs leading-relaxed text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            title="Enviar"
            aria-label="Enviar mensaje"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-cdm-accent text-cdm-bg shadow-[0_0_16px_rgba(34,211,238,0.35)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
        {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      </form>
    </section>
  );
}
