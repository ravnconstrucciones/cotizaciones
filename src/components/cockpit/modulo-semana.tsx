"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Panel } from "./panel";
import { itemsDelDia, semanaCorriente, type DiaSemana } from "@/lib/semana";
import type { CalendarioEvento, Tarea } from "@/types/centro-mando";

/**
 * Módulo SEMANA (Ola B): banda horizontal lunes→domingo debajo de la barra de
 * comando. Cada día junta los eventos del calendario (espejo del Calendar de
 * la Mac vía job_calendario + manuales) y las tareas con fecha. HOY respira
 * con glow cian; las tareas se completan con un click ahí mismo (y se pueden
 * desmarcar con otro). Vista mono/terminal, tokens cdm — ambos temas.
 */
export function ModuloSemana({ className }: { className?: string }) {
  const [dias, setDias] = useState<DiaSemana[]>(() =>
    semanaCorriente(new Date())
  );
  const [eventos, setEventos] = useState<CalendarioEvento[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [error, setError] = useState<string | null>(null);

  const desde = dias[0].fecha;
  const hasta = dias[6].fecha;

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [evs, ts] = await Promise.all([
      supabase
        .from("calendario_eventos")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta),
      supabase
        .from("tareas")
        .select("*")
        .gte("fecha", desde)
        .lte("fecha", hasta),
    ]);
    if (evs.error || ts.error) {
      setError(evs.error?.message ?? ts.error?.message ?? "Error");
      return;
    }
    setError(null);
    setEventos((evs.data as CalendarioEvento[]) ?? []);
    setTareas((ts.data as Tarea[]) ?? []);
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
    // Si la pestaña queda abierta de un día para otro, HOY se recalcula.
    const timer = setInterval(
      () => setDias(semanaCorriente(new Date())),
      60_000
    );
    return () => clearInterval(timer);
  }, [cargar]);
  useRealtimeTable("calendario_eventos", cargar);
  useRealtimeTable("tareas", cargar);

  const porDia = useMemo(
    () =>
      new Map(dias.map((d) => [d.fecha, itemsDelDia(d.fecha, eventos, tareas)])),
    [dias, eventos, tareas]
  );

  async function alternarTarea(id: string, hecha: boolean) {
    const supabase = createClient();
    await supabase
      .from("tareas")
      .update({ estado: hecha ? "pendiente" : "hecha" })
      .eq("id", id);
    await cargar();
  }

  return (
    <Panel
      titulo="Semana"
      className={className}
      accion={
        <span className="font-mono-hud text-[9px] uppercase tracking-[0.12em] text-cdm-muted/70 tabular-nums">
          {desde.slice(8)}/{desde.slice(5, 7)} — {hasta.slice(8)}/
          {hasta.slice(5, 7)}
        </span>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="-m-4 overflow-x-auto">
        <div className="grid min-w-[820px] grid-cols-7 divide-x divide-cdm-line/60">
          {dias.map((d) => {
            const items = porDia.get(d.fecha) ?? [];
            return (
              <div
                key={d.fecha}
                className={`min-h-[110px] px-2.5 pb-3 pt-2 ${
                  d.esHoy ? "bg-cdm-accent/[0.06]" : ""
                }`}
              >
                <p
                  className={`font-mono-hud mb-2 text-[9px] uppercase tracking-[0.2em] tabular-nums ${
                    d.esHoy ? "font-semibold text-cdm-accent" : "text-cdm-muted/70"
                  }`}
                  style={
                    d.esHoy
                      ? { textShadow: "0 0 14px var(--cdm-glow)" }
                      : undefined
                  }
                >
                  {d.label} {String(d.dia).padStart(2, "0")}
                  {d.esHoy && <span aria-hidden className="ml-1.5">●</span>}
                </p>
                <ul className="space-y-1.5">
                  {items.map((it) =>
                    it.clase === "evento" ? (
                      <li
                        key={`e-${it.id}`}
                        className="font-mono-hud flex items-baseline gap-1.5 text-[10px] leading-snug text-cdm-fg/85"
                      >
                        <span aria-hidden className="shrink-0 text-cdm-accent">
                          ◆
                        </span>
                        <span className="min-w-0">
                          {it.hora && (
                            <span className="mr-1 tabular-nums text-cdm-accent/80">
                              {it.hora}
                            </span>
                          )}
                          {it.texto}
                        </span>
                      </li>
                    ) : (
                      <li
                        key={`t-${it.id}`}
                        className="flex items-start gap-1.5 text-[10px] leading-snug"
                      >
                        <button
                          type="button"
                          onClick={() => void alternarTarea(it.id, it.hecha)}
                          aria-label={
                            it.hecha ? "Volver a pendiente" : "Marcar hecha"
                          }
                          className={`mt-[3px] h-2.5 w-2.5 shrink-0 border transition-colors ${
                            it.hecha
                              ? "border-cdm-accent bg-cdm-accent"
                              : "border-cdm-line hover:border-cdm-accent hover:bg-cdm-accent/30"
                          }`}
                        />
                        <span
                          className={`min-w-0 ${
                            it.hecha
                              ? "text-cdm-muted/60 line-through"
                              : "text-cdm-fg/85"
                          }`}
                        >
                          {it.hora && (
                            <span className="font-mono-hud mr-1 tabular-nums text-cdm-muted">
                              {it.hora}
                            </span>
                          )}
                          {it.texto}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
