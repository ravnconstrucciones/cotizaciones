"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import {
  SeccionProyecto,
  type ProyectoCard,
} from "@/components/cockpit/seccion-proyecto";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { fetchCompartido } from "@/lib/fetch-compartido";
import type { ObraAvance, Tarea } from "@/types/centro-mando";

/**
 * Galería de proyectos (/obras): una sección por obra activa alternando
 * el layout (ref. section-with-mockup de 21st.dev). Ola B: la mockup card
 * pasó de mini-dashboard de plata a SEGUIMIENTO (instancia + último avance
 * en verde + pendientes vinculados + alta de avance) — los gastos viven
 * SOLO en el orbital. Datos: /cashflow/resumen (obras activas) +
 * obra_avances + tareas vinculadas (presupuesto_id), con Realtime.
 */

type ObraResumen = {
  obra_id: string;
  presupuesto_id: string;
  nombre_obra: string;
  nombre_cliente: string | null;
  fecha_presupuesto: string | null;
  cobranza_cerrada?: boolean;
  finalizada: boolean;
};

function estadoDe(o: ObraResumen): { label: string; cls: string } {
  if (o.cobranza_cerrada)
    return { label: "Cobranza cerrada", cls: "text-cdm-accent" };
  if (o.finalizada) return { label: "Finalizada", cls: "text-amber-300" };
  return { label: "En curso", cls: "text-emerald-400" };
}

function fechaDisplay(iso: string | null): string | null {
  const d = iso?.trim().slice(0, 10);
  if (d && d.length === 10 && d[4] === "-" && d[7] === "-") {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  return null;
}

export function ObrasScreen() {
  const [proyectos, setProyectos] = useState<ProyectoCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const j = res.body as {
        error?: string;
        obras_activas?: ObraResumen[];
      };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
        return;
      }
      const obras = (j.obras_activas ?? []) as ObraResumen[];
      const avances = (avancesRes.data ?? []) as ObraAvance[];
      const tareas = (tareasRes.data ?? []) as Tarea[];

      setError(null);
      setProyectos(
        obras.map((o) => {
          const estado = estadoDe(o);
          // Ya vienen nuevo → viejo: [0] es el último avance; la instancia
          // actual es la del avance más reciente que declaró una.
          const deLaObra = avances.filter(
            (a) => a.presupuesto_id === o.presupuesto_id
          );
          const ultimo = deLaObra[0] ?? null;
          return {
            presupuestoId: o.presupuesto_id,
            nombre: o.nombre_obra,
            cliente: o.nombre_cliente?.trim() || null,
            estadoLabel: estado.label,
            estadoCls: estado.cls,
            desde: fechaDisplay(o.fecha_presupuesto),
            instancia:
              deLaObra.find((a) => a.instancia?.trim())?.instancia?.trim() ??
              null,
            ultimoAvance: ultimo
              ? {
                  texto: ultimo.texto,
                  instancia: ultimo.instancia,
                  creadoAt: ultimo.creado_at,
                }
              : null,
            cantAvances: deLaObra.length,
            pendientes: tareas
              .filter((t) => t.presupuesto_id === o.presupuesto_id)
              .map((t) => ({ id: t.id, texto: t.texto })),
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
  // El seguimiento respira: avance del bot o tarea nueva → la card se actualiza.
  useRealtimeTable("obra_avances", cargar);
  useRealtimeTable("tareas", cargar);

  const agregarAvance = useCallback(
    async (presupuestoId: string, texto: string): Promise<boolean> => {
      const supabase = createClient();
      const { error } = await supabase
        .from("obra_avances")
        .insert({ presupuesto_id: presupuestoId, texto });
      if (error) {
        setError(error.message);
        return false;
      }
      await cargar();
      return true;
    },
    [cargar]
  );

  return (
    <div className="font-grotesk relative min-h-screen bg-cdm-bg text-cdm-fg">
      <WavesBackdrop />

      <header className="relative z-10 flex items-baseline justify-between px-6 pt-6 md:px-10">
        <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
          <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
          Proyectos
        </h1>
        <Link
          href="/"
          className="font-mono-hud text-[10px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          [← CENTRO DE MANDO]
        </Link>
      </header>

      <div className="relative z-10">
        {error && (
          <p className="px-6 pt-6 text-[11px] text-red-400 md:px-10">{error}</p>
        )}
        {!error && proyectos === null && (
          <div className="grid gap-10 px-6 pt-12 md:grid-cols-2 md:px-10">
            <SkeletonGlass filas={4} anchos={["w-2/3", "w-1/2", "w-5/6", "w-1/3"]} />
            <SkeletonGlass filas={4} anchos={["w-3/4", "w-1/2", "w-2/3", "w-2/5"]} />
          </div>
        )}
        {proyectos !== null && proyectos.length === 0 && (
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-muted">
              Sin obras activas. Aprobá un presupuesto para verla acá.
            </p>
          </div>
        )}
        {proyectos?.map((p, i) => (
          <SeccionProyecto
            key={p.presupuestoId}
            proyecto={p}
            reverseLayout={i % 2 === 1}
            onAgregarAvance={agregarAvance}
          />
        ))}
      </div>
    </div>
  );
}
