"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "./panel";
import { SkeletonGlass } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { useRefrescoAlVolver } from "@/hooks/use-refresco-al-volver";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import {
  clasificarEstadoObra,
  derivarSeguimiento,
  esObraActiva,
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
      if (avancesRes.error || tareasRes.error) throw new Error("No se pudo leer el seguimiento de las obras. Volvé a intentar.");
      const j = res.body as ResumenCashflow & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
        return;
      }
      const activas = ((j.obras_activas ?? []) as ObraActiva[]).filter(
        esObraActiva
      );
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
  useRefrescoAlVolver(cargar);

  // El cuadro respira: avance del bot o tarea nueva → se actualiza solo.
  useRealtimeTable("obra_avances", cargar);
  useRealtimeTable("tareas", cargar);

  return (
    <>
      <Panel
        titulo="Obras en marcha"
        className={className}
        accion={
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModalAbierto(true)}
              className="inline-flex min-h-11 items-center px-3 text-xs font-semibold text-cdm-fg hover:bg-cdm-fg/5"
            >
              + Nueva
            </button>
            <Link
              href="/obras"
              className="inline-flex min-h-11 items-center px-2 text-xs text-cdm-fg underline-offset-4 hover:underline"
            >
              Ver todas →
            </Link>
          </span>
        }
      >
        {error && <div role="alert" className="mb-4 text-sm"><p>{error}</p><button type="button" onClick={() => void cargar()} className="mt-2 min-h-11 border border-cdm-line px-4">Volver a intentar</button></div>}
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
        <ul className="grid gap-4 sm:grid-cols-2">
          {obras?.map((o) => (
            <li key={o.obraId} className="flex min-w-0 flex-col border border-cdm-line bg-cdm-bg p-5">
              <span className="mb-3 text-xs uppercase tracking-widest text-cdm-muted">
                {o.instancia || o.estadoLabel}
              </span>
              <h3 className="text-lg font-semibold leading-snug">
                <Link href={`/obras/${o.presupuestoId}`} className="hover:underline underline-offset-4">
                  {o.nombre}
                </Link>
              </h3>
              {o.ultimoAvance ? (
                <details className="mt-4 text-sm leading-relaxed">
                  <summary className="min-h-11 cursor-pointer py-2 text-cdm-muted">
                    Último avance · {cuandoDisplay(o.ultimoAvance.creadoAt)}
                  </summary>
                  <p className="mt-2 break-words text-cdm-fg">{o.ultimoAvance.texto}</p>
                </details>
              ) : <p className="mt-4 py-2 text-sm text-cdm-muted">Sin avances registrados</p>}
              <p className="mb-5 mt-2 text-sm leading-relaxed text-cdm-muted">
                {o.proximaAccion.hay ? o.proximaAccion.display : "Próxima acción por definir"}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 border-t border-cdm-line pt-4">
                <Link href={`/obras/${o.presupuestoId}/gastos`} className="inline-flex min-h-11 items-center justify-center border border-cdm-line px-4 text-sm font-semibold hover:border-cdm-fg">Cargar gastos</Link>
                <Link href={`/obras/${o.presupuestoId}`} className="inline-flex min-h-11 items-center px-3 text-sm underline-offset-4 hover:underline">Ver proyecto →</Link>
              </div>
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
