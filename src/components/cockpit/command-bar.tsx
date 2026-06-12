"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
 * Módulo 1 del cockpit (spec §4.1): la orden viaja a `trabajos_cola` vía
 * POST /api/trabajos y el daemon Mac la levanta; el progreso se ve en vivo
 * por Realtime (la fila cambia de estado → refetch). EXCEPCIÓN inline:
 * "anotá X" crea la tarea directa en `tareas` (parseComandoInline) sin
 * pasar por la cola — confirmación inmediata, sin daemon.
 */
export function CommandBar() {
  const [prompt, setPrompt] = useState("");
  const [tipo, setTipo] = useState<TipoTrabajo>("orden");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [trabajos, setTrabajos] = useState<TrabajoCola[]>([]);

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
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="border border-cdm-line bg-cdm-panel"
    >
      <form onSubmit={enviar} className="flex items-stretch">
        <div className="flex shrink-0">
          {TIPOS_TRABAJO.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`px-3 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                tipo === t
                  ? "bg-cdm-taupe text-cdm-bg"
                  : "text-cdm-muted hover:text-cdm-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='Ordená algo: "cotizame baño completo en Pilar", "anotá llamar a Oribe", "redactá el detalle de la obra Saavedra"…'
          className="font-raleway w-full border-l border-cdm-line bg-transparent px-4 py-4 text-sm text-cdm-fg placeholder:text-cdm-muted/50 focus:outline-none"
        />
        <button
          type="submit"
          disabled={enviando || !prompt.trim()}
          className="shrink-0 bg-cdm-fg px-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-cdm-bg transition-opacity hover:opacity-85 disabled:opacity-30"
        >
          {enviando ? "Enviando…" : "Ejecutar"}
        </button>
      </form>
      {error && (
        <p className="border-t border-cdm-line px-4 py-2 text-[11px] text-red-400">
          {error}
        </p>
      )}
      {ok && (
        <p className="border-t border-cdm-line px-4 py-2 text-[11px] text-emerald-400">
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
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
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
