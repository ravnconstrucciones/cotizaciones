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
import type { ProyectoRow } from "@/lib/proyectos-orden";

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

type Vista = "activas" | "todas";

type ProyectoRowResponse = {
  proyectos: ProyectoRow[];
  total: number;
};

function ProyectoCompacto({ p }: { p: ProyectoRow }) {
  const aprobado = Boolean(p.presupuesto_aprobado);
  const nombre = p.nombre_obra?.trim() || p.nombre_cliente?.trim() || "Sin nombre";
  const cliente = p.nombre_cliente?.trim() || null;

  return (
    <Link
      href={`/obras/${p.id}`}
      className={[
        "cdm-chip group flex flex-col gap-2 border p-4 transition-colors",
        aprobado
          ? "border-cdm-accent/25 hover:border-cdm-accent/50"
          : "border-cdm-line hover:border-cdm-line/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-grotesk text-[13px] font-medium leading-snug text-cdm-fg group-hover:text-cdm-accent transition-colors line-clamp-2">
          {nombre}
        </span>
        {aprobado && (
          <span className="font-mono-hud shrink-0 border border-cdm-accent/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cdm-accent">
            Aprobada
          </span>
        )}
      </div>
      {cliente && nombre !== cliente && (
        <p className="font-mono-hud text-[10px] text-cdm-muted">{cliente}</p>
      )}
      <div className="font-mono-hud mt-auto flex gap-3 text-[10px] text-cdm-muted/70">
        {p.cant_items > 0 && (
          <span>{p.cant_items} ítem{p.cant_items !== 1 ? "s" : ""}</span>
        )}
        {p.cant_gastos > 0 && (
          <span>{p.cant_gastos} gasto{p.cant_gastos !== 1 ? "s" : ""}</span>
        )}
        {p.cant_items === 0 && p.cant_gastos === 0 && (
          <span className="italic">Borrador</span>
        )}
      </div>
    </Link>
  );
}

export function ObrasScreen() {
  const [vista, setVista] = useState<Vista>("activas");
  const [proyectos, setProyectos] = useState<ProyectoCard[] | null>(null);
  const [todos, setTodos] = useState<ProyectoRow[] | null>(null);
  const [cargandoTodos, setCargandoTodos] = useState(false);
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

  const cargarTodos = useCallback(async () => {
    setCargandoTodos(true);
    try {
      const res = await fetch("/api/proyectos");
      const j = (await res.json()) as ProyectoRowResponse & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar los proyectos.");
        return;
      }
      setTodos(j.proyectos ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargandoTodos(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (vista === "todas" && todos === null) {
      void cargarTodos();
    }
  }, [vista, todos, cargarTodos]);

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

      {/* Toggle ACTIVAS / TODAS */}
      <div className="relative z-10 flex gap-2 px-6 pt-5 md:px-10">
        {(["activas", "todas"] as const).map((v) => {
          const activo = vista === v;
          return (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={[
                "cdm-chip font-mono-hud inline-flex items-center border px-3 py-1.5",
                "text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors",
                activo
                  ? "border-cdm-accent/60 text-cdm-accent"
                  : "border-cdm-line text-cdm-muted hover:border-cdm-accent/30 hover:text-cdm-fg",
              ].join(" ")}
            >
              {v === "activas" ? "Activas" : "Todas"}
            </button>
          );
        })}
      </div>

      <div className="relative z-10">
        {error && (
          <p className="px-6 pt-6 text-[11px] text-red-400 md:px-10">{error}</p>
        )}

        {/* Vista ACTIVAS — sin cambios */}
        {vista === "activas" && (
          <>
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
          </>
        )}

        {/* Vista TODAS — lista compacta */}
        {vista === "todas" && (
          <div className="px-6 pb-16 pt-6 md:px-10">
            {cargandoTodos && todos === null && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonGlass key={i} filas={3} anchos={["w-3/4", "w-1/2", "w-2/3"]} />
                ))}
              </div>
            )}
            {todos !== null && todos.length === 0 && (
              <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-muted">
                Sin proyectos registrados.
              </p>
            )}
            {todos !== null && todos.length > 0 && (
              <>
                <p className="font-mono-hud mb-4 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                  {todos.length} proyecto{todos.length !== 1 ? "s" : ""}
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {todos.map((p) => (
                    <ProyectoCompacto key={p.id} p={p} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
