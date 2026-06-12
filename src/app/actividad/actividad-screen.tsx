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
  resuelto: { label: "Resuelto", cls: "text-cdm-taupe" },
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
    <div className="min-h-screen bg-cdm-bg px-4 py-8 text-cdm-fg sm:px-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-raleway text-xs uppercase tracking-[0.35em] text-cdm-taupe">
          Actividad
        </h1>
        <p className="mt-1 text-[11px] text-cdm-muted">
          Registro permanente: todo lo que hizo el bot, el daemon y el tablero.
        </p>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {ORIGENES.map((o) => (
            <button
              key={o}
              onClick={() => setOrigen(o)}
              className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                origen === o
                  ? "border-cdm-taupe bg-cdm-taupe text-cdm-bg"
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
          <p className="mt-6 text-[11px] text-cdm-muted">
            Sin eventos para este filtro.
          </p>
        )}

        <ul className="mt-4 border-t border-cdm-line">
          <AnimatePresence initial={false}>
            {eventos.map((e) => (
              <motion.li
                key={e.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-baseline gap-3 border-b border-cdm-line px-1 py-2.5 text-[11px]"
              >
                <span className="shrink-0 tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
                <span className="shrink-0 border border-cdm-line px-1 text-[8px] uppercase tracking-widest text-cdm-taupe">
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
