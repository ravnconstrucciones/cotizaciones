"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import type { EstadoCotizacion } from "@/lib/cotizador/tipos";
import type { MensajeHilo } from "@/lib/cotizador/conversacion";
import { useRealtimeTable } from "@/hooks/use-realtime-table";

/**
 * Conversación de la cotización (iteración 4): EL lugar donde Eze dialoga
 * con el sistema sobre ESTA cotización. Historial = hilo que arma
 * /api/cotizaciones/[id]/conversacion (trabajo de origen + derivados +
 * eventos); input = mini prompt-box. Si la cotización está en_revision el
 * mensaje aplica el mecanismo CORREGIR (rechaza + lección + re-encola);
 * si ya está cerrada encola una consulta. El panel lo dice SIN letra chica:
 * el botón cambia de etiqueta según el modo.
 */

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
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex flex-col ${esEze ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[88%] border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
          esEze
            ? "border-cdm-accent/40 bg-cdm-accent/10 text-cdm-fg"
            : "cdm-chip border-cdm-line text-cdm-fg/90"
        }`}
      >
        {mensaje.texto}
      </div>
      <span className="mt-1 text-[9px] uppercase tracking-[0.14em] text-cdm-muted/70">
        {esEze ? "Eze" : "Sistema"} · {mensaje.etiqueta} · {horaCorta(mensaje.fecha)}
      </span>
    </motion.li>
  );
}

export function ConversacionPanel({
  cotizacionId,
  estado,
  onCambioEstado,
}: {
  cotizacionId: string;
  estado: EstadoCotizacion;
  /** El modo corrección rechaza la cotización: la mesa debe recargarse. */
  onCambioEstado: () => void;
}) {
  const [mensajes, setMensajes] = useState<MensajeHilo[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  const esCorreccion = estado === "en_revision";

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/conversacion`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setMensajes(json.mensajes ?? []);
    } catch {
      // panel best-effort: la mesa sigue funcionando sin el hilo
    }
  }, [cotizacionId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);
  useRealtimeTable("trabajos_cola", cargar);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const mensaje = texto.trim();
    if (!mensaje || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacionId}/conversacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al enviar");
      setTexto("");
      await cargar();
      if (json.modo === "correccion") onCambioEstado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="cdm-glass flex min-h-0 flex-col" aria-label="Conversación de la cotización">
      <header className="flex items-baseline justify-between gap-2 border-b border-cdm-line bg-[linear-gradient(90deg,rgba(34,211,238,0.07),transparent_60%)] px-4 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-accent">
          Conversación
        </h2>
        <span className="text-[9px] uppercase tracking-[0.14em] text-cdm-muted/70">
          {esCorreccion ? "modo corrección" : "modo consulta"}
        </span>
      </header>

      <div className="min-h-0 max-h-[420px] flex-1 overflow-y-auto p-4">
        {mensajes === null ? (
          <SkeletonGlass filas={3} alto="h-2.5" anchos={["w-3/4", "w-1/2", "w-2/3"]} />
        ) : mensajes.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-cdm-muted">
            Sin conversación todavía. Lo que escribas acá abajo queda en el hilo
            de ESTA cotización.
          </p>
        ) : (
          <ul className="space-y-3">
            {mensajes.map((m) => (
              <Burbuja key={m.id} mensaje={m} />
            ))}
          </ul>
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
            placeholder={
              esCorreccion
                ? "Qué corregir de esta cotización…"
                : "Preguntale al sistema sobre esta cotización…"
            }
            aria-label="Mensaje para el sistema"
            className="cdm-textarea max-h-32 w-full resize-none bg-transparent text-xs leading-relaxed text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            title={esCorreccion ? "Corregir y re-cotizar" : "Enviar consulta"}
            aria-label={esCorreccion ? "Corregir y re-cotizar" : "Enviar consulta"}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-cdm-accent text-cdm-bg shadow-[0_0_16px_rgba(34,211,238,0.35)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
        <p className="mt-2 text-[9px] uppercase tracking-[0.14em] leading-relaxed text-cdm-muted/60">
          {esCorreccion
            ? "Corregir = rechaza esta versión, guarda la lección y encola la re-cotización (igual que CORREGIR por WhatsApp)."
            : "La consulta se encola al sistema y la respuesta aparece en este hilo."}
        </p>
        {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      </form>
    </section>
  );
}
