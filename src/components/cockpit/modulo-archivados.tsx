"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import type { Evento } from "@/types/centro-mando";

/** Módulo 7: ítems sin clasificar esperando a Eze — nada se pierde (spec §4.7). */
export function ModuloArchivados({ className }: { className?: string }) {
  const [filas, setFilas] = useState<Evento[]>([]);
  const [total, setTotal] = useState(0);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, count } = await supabase
      .from("eventos")
      .select("*", { count: "exact" })
      .eq("estado", "archivado")
      .order("creado_at", { ascending: false })
      .limit(3);
    setFilas((data as Evento[]) ?? []);
    setTotal(count ?? 0);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  return (
    <Panel
      titulo="Archivados"
      className={className}
      accion={
        total > 0 ? (
          <span className="bg-cdm-taupe px-1.5 text-[10px] font-bold tabular-nums text-cdm-bg">
            {total}
          </span>
        ) : undefined
      }
    >
      {total === 0 ? (
        <p className="text-[11px] text-cdm-muted">
          Nada sin clasificar. Pérdida: cero.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {filas.map((e) => (
              <li key={e.id} className="truncate text-[11px] text-cdm-fg/85">
                {e.titulo}
              </li>
            ))}
          </ul>
          <Link
            href="/archivados"
            className="mt-3 inline-block text-[9px] uppercase tracking-[0.2em] text-cdm-taupe hover:text-cdm-fg"
          >
            Resolver →
          </Link>
        </>
      )}
    </Panel>
  );
}
