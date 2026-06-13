"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "./panel";
import { SkeletonGlass } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import {
  clasificarEstadoObra,
  derivarSeguimiento,
  proximaAccion,
} from "@/lib/obra-gestion";
import { cuandoDisplay } from "./seccion-proyecto";
import type { ObraAvance, Tarea } from "@/types/centro-mando";
import { NuevaObraModal } from "./nueva-obra-modal";

/**
 * Módulo 2 de la home: GESTIÓN DE OBRAS. Por cada obra activa, el cuadro
 * responde a "el estado de las obras y cuál es la actividad para avanzar":
 *   nombre + ESTADO/instancia + ÚLTIMO AVANCE (verde) + PRÓXIMA ACCIÓN para
 *   avanzar (el primer pendiente vinculado a la obra).
 * Los gastos viven en el orbital; acá manda el seguimiento operativo.
 * Datos: /cashflow/resumen (obras activas) + obra_avances + tareas vinculadas,
 * con Realtime — igual patrón que la galería /obras.
 */

type ObraActiva = {
  obra_id: string;
  presupuesto_id: string;
  nombre_obra: string;
  cobranza_cerrada?: boolean;
  finalizada: boolean;
};

type ResumenCashflow = {
  obras_activas: ObraActiva[];
};

type ObraVista = {
  obraId: string;
  presupuestoId: string;
  nombre: string;
  estadoLabel: string;
  estadoCls: string;
  instancia: string | null;
  ultimoAvance: { texto: string; creadoAt: string } | null;
  proximaAccion: { display: string; hay: boolean };
};

export function ModuloObras({ className }: { className?: string }) {
  const [obras, setObras] = useState<ObraVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const supabase = createClient();
      const [res, avancesRes, tareasRes] = await Promise.all([
        fetchCompartido("/cashflow/resumen"),
        supabase
          .from("obra_avances")
          .select("*")
          .order("creado_at", { ascending: false }),
        supabase
          .from("tareas")
          .select("*")
          .eq("estado", "pendiente")
          .not("presupuesto_id", "is", null)
          .order("creado_at", { ascending: true }),
      ]);
      const j = res.body as ResumenCashflow & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
        return;
      }
      const activas = (j.obras_activas ?? []) as ObraActiva[];
      const avances = (avancesRes.data ?? []) as ObraAvance[];
      const tareas = (tareasRes.data ?? []) as Tarea[];

      setError(null);
      setObras(
        activas.map((o) => {
          const estado = clasificarEstadoObra(o);
          const seg = derivarSeguimiento(o.presupuesto_id, avances);
          const prox = proximaAccion(
            o.presupuesto_id,
            tareas.map((t) => ({
              presupuesto_id: t.presupuesto_id,
              texto: t.texto,
              creado_at: t.creado_at,
            }))
          );
          return {
            obraId: o.obra_id,
            presupuestoId: o.presupuesto_id,
            nombre: o.nombre_obra,
            estadoLabel: estado.label,
            estadoCls: estado.cls,
            instancia: seg.instancia,
            ultimoAvance: seg.ultimoAvance,
            proximaAccion: { display: prox.display, hay: prox.hay },
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El cuadro respira: avance del bot o tarea nueva → se actualiza solo.
  useRealtimeTable("obra_avances", cargar);
  useRealtimeTable("tareas", cargar);

  return (
    <>
      <Panel
        titulo="Obras"
        className={className}
        accion={
          <span className="flex items-baseline gap-3">
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="font-mono-hud cursor-pointer text-[9px] uppercase tracking-[0.08em] text-cdm-accent/80 transition-colors hover:text-cdm-accent"
            >
              [+ NUEVA]
            </button>
            <Link
              href="/obras"
              className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
            >
              [PROYECTOS] ↑
            </Link>
          </span>
        }
      >
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {!error && !obras && (
          <SkeletonGlass
            filas={5}
            anchos={["w-3/4", "w-1/2", "w-full", "w-2/3", "w-2/5"]}
          />
        )}
        {obras && obras.length === 0 && (
          <p className="text-[11px] text-cdm-muted">
            Sin obras activas. Tocá{" "}
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="cursor-pointer text-cdm-accent underline-offset-2 hover:underline"
            >
              + NUEVA
            </button>{" "}
            para arrancar una.
          </p>
        )}
        <ul className="space-y-3">
          {obras?.map((o) => (
            <li
              key={o.obraId}
              className="border-b border-cdm-line pb-2.5 last:border-0"
            >
              {/* Línea 1: nombre + estado */}
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/obras/${o.presupuestoId}`}
                  className="truncate text-xs text-cdm-fg transition-colors hover:text-cdm-accent"
                >
                  {o.nombre}
                </Link>
                <span
                  className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${o.estadoCls}`}
                >
                  {o.instancia ? o.instancia : o.estadoLabel}
                </span>
              </div>

              {/* Línea 2: último avance — EN VERDE cuando hay */}
              <p
                className={`mt-1 truncate text-[10px] ${
                  o.ultimoAvance
                    ? "text-emerald-400 light:text-emerald-600"
                    : "text-cdm-muted/70"
                }`}
              >
                {o.ultimoAvance ? (
                  <>
                    <span className="font-mono-hud mr-1.5 uppercase tracking-[0.12em] text-emerald-400/70 light:text-emerald-600/70">
                      {cuandoDisplay(o.ultimoAvance.creadoAt)}
                    </span>
                    {o.ultimoAvance.texto}
                  </>
                ) : (
                  "Sin avances todavía"
                )}
              </p>

              {/* Línea 3: PRÓXIMA ACCIÓN para avanzar */}
              <p className="mt-0.5 flex items-baseline gap-1.5 text-[10px]">
                <span
                  aria-hidden
                  className="font-mono-hud shrink-0 text-cdm-accent/60"
                >
                  →
                </span>
                <span
                  className={`min-w-0 truncate ${
                    o.proximaAccion.hay
                      ? "text-cdm-fg/80"
                      : "italic text-cdm-muted/60"
                  }`}
                >
                  {o.proximaAccion.display}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <NuevaObraModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        onCreated={() => {
          setModalAbierto(false);
          void cargar();
        }}
      />
    </>
  );
}
