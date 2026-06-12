"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { ORIGEN_TAG } from "@/components/cockpit/modulo-actividad";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import type { EstadoEvento, Evento, OrigenEvento } from "@/types/centro-mando";

const ORIGENES: Array<"todos" | OrigenEvento> = [
  "todos",
  "whatsapp",
  "tablero",
  "daemon",
  "bot",
  "sistema",
];

const ESTADO_UI: Record<EstadoEvento, { label: string; cls: string }> = {
  procesado: { label: "Procesado", cls: "text-emerald-400" },
  pendiente_pregunta: { label: "Esperando respuesta", cls: "text-amber-300" },
  archivado: { label: "Archivado", cls: "text-red-400" },
  resuelto: { label: "Resuelto", cls: "text-cdm-accent" },
};

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Feed Actividad completo (spec §4.6): todo lo que hizo bot, daemon, tablero y agentes. */
export function ActividadScreen() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [origen, setOrigen] = useState<"todos" | OrigenEvento>("todos");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    let q = supabase
      .from("eventos")
      .select("*")
      .order("creado_at", { ascending: false })
      .limit(100);
    if (origen !== "todos") q = q.eq("origen", origen);
    const { data, error } = await q;
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setEventos((data as Evento[]) ?? []);
    }
    setCargando(false);
  }, [origen]);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  return (
    <div className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="relative pb-3">
          {/* Línea de horizonte detrás del header — mismo lenguaje que historial/obras. */}
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
            <span
              aria-hidden
              className="h-[5px] w-[5px] bg-cdm-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]"
            />
            Actividad
          </h1>
        </div>
        <p className="mt-4 text-sm text-cdm-muted">
          Registro permanente: todo lo que hizo el bot, el daemon y el tablero.
        </p>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {ORIGENES.map((o) => (
            <button
              key={o}
              onClick={() => setOrigen(o)}
              className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                origen === o
                  ? "border-cdm-accent bg-cdm-accent text-cdm-bg"
                  : "border-cdm-line text-cdm-muted hover:text-cdm-fg"
              }`}
            >
              {o === "todos" ? "Todos" : o}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <p className="mt-6 text-[11px] text-cdm-muted">Cargando…</p>
        )}
        {!error && !cargando && eventos.length === 0 && (
          <div className="mt-6 flex h-24 items-center justify-center border border-dashed border-cdm-line">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Sin eventos para este filtro
            </span>
          </div>
        )}

        <ul
          className={`cdm-glass mt-6 px-4 py-1 sm:px-5 ${
            eventos.length === 0 ? "hidden" : ""
          }`}
        >
          <AnimatePresence initial={false}>
            {eventos.map((e, i) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-baseline gap-3 px-1 py-3 text-[11px] ${
                  i > 0 ? "border-t border-cdm-line" : ""
                }`}
              >
                <span className="shrink-0 tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
                <span className="shrink-0 border border-cdm-line px-1 text-[8px] uppercase tracking-widest text-cdm-accent">
                  {ORIGEN_TAG[e.origen]}
                </span>
                <span className="min-w-0 flex-1 truncate text-cdm-fg/85">
                  {e.titulo}
                </span>
                {e.destino_tabla && (
                  <span className="hidden shrink-0 text-[9px] uppercase tracking-widest text-cdm-muted/70 sm:inline">
                    → {e.destino_tabla}
                  </span>
                )}
                <span
                  className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_UI[e.estado].cls}`}
                >
                  {ESTADO_UI[e.estado].label}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}
