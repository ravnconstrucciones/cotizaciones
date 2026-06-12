"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import type { Evento, OrigenEvento } from "@/types/centro-mando";

export const ORIGEN_TAG: Record<OrigenEvento, string> = {
  whatsapp: "WA",
  tablero: "TAB",
  daemon: "DMN",
  bot: "BOT",
  sistema: "SYS",
};

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Módulo 6 (ex-oficina): feed de `eventos` — todo lo que hizo el sistema (spec §4.6). */
export function ModuloActividad({ className }: { className?: string }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("eventos")
      .select("*")
      .order("creado_at", { ascending: false })
      .limit(12);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setEventos((data as Evento[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  return (
    <Panel
      titulo="Actividad"
      className={className}
      accion={
        <Link
          href="/actividad"
          className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted hover:text-cdm-fg"
        >
          Ver todo →
        </Link>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && eventos.length === 0 && (
        <p className="text-[11px] text-cdm-muted">Sin actividad todavía.</p>
      )}
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {eventos.map((e) => (
            <motion.li
              key={e.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-baseline gap-2 text-[11px]"
            >
              <span className="shrink-0 tabular-nums text-cdm-muted">
                {fmtHora(e.creado_at)}
              </span>
              <span className="shrink-0 border border-cdm-line px-1 text-[8px] uppercase tracking-widest text-cdm-accent">
                {ORIGEN_TAG[e.origen]}
              </span>
              <span className="truncate text-cdm-fg/85">{e.titulo}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Panel>
  );
}
