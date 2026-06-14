"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { ORIGEN_TAG } from "@/components/cockpit/modulo-actividad";
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
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      {/* Header — mismo lenguaje que obras-screen */}
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Actividad
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Registro permanente del bot, daemon y tablero
          </p>
        </div>
      </header>

      <div className="relative z-10 px-6 pt-6 md:px-10">
        {/* Filtros de origen — pill style igual a toggle de obras */}
        <div className="flex flex-wrap gap-2">
          {ORIGENES.map((o) => {
            const activo = origen === o;
            return (
              <button
                key={o}
                onClick={() => setOrigen(o)}
                className={`font-mono-hud inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                  activo
                    ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                    : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
                }`}
              >
                {o === "todos" ? "Todos" : o}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <p className="font-mono-hud mt-6 text-[11px] uppercase tracking-[0.14em] text-cdm-muted">
            Cargando…
          </p>
        )}
        {!error && !cargando && eventos.length === 0 && (
          <div className="mt-6 flex h-24 items-center justify-center rounded-[24px] ring-1 ring-cdm-line">
            <span className="font-mono-hud text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Sin eventos para este filtro
            </span>
          </div>
        )}

        {/* Feed de eventos — card geist */}
        {eventos.length > 0 && (
          <motion.ul
            className="mt-6 rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 px-4 py-1 sm:px-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <AnimatePresence initial={false}>
              {eventos.map((e, i) => (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-baseline gap-3 px-1 py-3 ${
                    i > 0 ? "border-t border-cdm-line" : ""
                  }`}
                >
                  <span className="font-mono-hud shrink-0 tabular-nums text-[10px] text-cdm-muted">
                    {fmtFechaHora(e.creado_at)}
                  </span>
                  <span className="font-mono-hud shrink-0 rounded-full border border-cdm-accent/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cdm-accent">
                    {ORIGEN_TAG[e.origen]}
                  </span>
                  <span className="font-geist min-w-0 flex-1 truncate text-[13px] text-cdm-fg/85">
                    {e.titulo}
                  </span>
                  {e.destino_tabla && (
                    <span className="font-mono-hud hidden shrink-0 text-[9px] uppercase tracking-widest text-cdm-muted/70 sm:inline">
                      → {e.destino_tabla}
                    </span>
                  )}
                  <span
                    className={`font-mono-hud shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_UI[e.estado].cls}`}
                  >
                    {ESTADO_UI[e.estado].label}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>
    </div>
  );
}
