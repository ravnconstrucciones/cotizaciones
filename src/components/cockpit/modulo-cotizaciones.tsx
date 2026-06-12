"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import { formatMoneyInt } from "@/lib/format-currency";
import type { CotizacionResumen, EstadoCotizacion } from "@/types/centro-mando";

const ESTADO_UI: Record<EstadoCotizacion, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "text-cdm-muted" },
  en_revision: { label: "En revisión", cls: "text-amber-300" },
  aprobada: { label: "Aprobada", cls: "text-emerald-400" },
  rechazada: { label: "Rechazada", cls: "text-red-400" },
  documento_emitido: { label: "Emitida", cls: "text-cdm-taupe" },
};

/** Módulo 5: cotizaciones en proceso + historial con estado de aprobación (spec §4.5). */
export function ModuloCotizaciones({ className }: { className?: string }) {
  const [filas, setFilas] = useState<CotizacionResumen[]>([]);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cotizaciones")
      .select("id, creado_at, titulo, zona, estado, total_min, total_max")
      .order("creado_at", { ascending: false })
      .limit(6);
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setFilas((data as CotizacionResumen[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("cotizaciones", cargar);

  return (
    <Panel titulo="Cotizaciones" className={className}>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && filas.length === 0 && (
        <p className="text-[11px] text-cdm-muted">
          Sin cotizaciones. Pedila por la barra o por WhatsApp.
        </p>
      )}
      <ul className="space-y-3">
        {filas.map((c) => (
          <li key={c.id} className="border-b border-cdm-line pb-2 last:border-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-cdm-fg">{c.titulo}</span>
              <span
                className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${ESTADO_UI[c.estado].cls}`}
              >
                {ESTADO_UI[c.estado].label}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] tabular-nums text-cdm-muted">
              {c.zona ? `${c.zona} · ` : ""}
              {c.total_min !== null && c.total_max !== null
                ? `${formatMoneyInt(c.total_min)} – ${formatMoneyInt(c.total_max)}`
                : "Sin total aún"}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
