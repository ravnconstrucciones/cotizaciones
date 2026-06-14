"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import {
  GaleriaProyectos,
  type ProyectoFoto,
} from "@/components/cockpit/proyecto-galeria";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { proximaAccion } from "@/lib/obra-gestion";
import { NuevaObraModal } from "@/components/cockpit/nueva-obra-modal";
import type { ObraAvance, Tarea } from "@/types/centro-mando";
import type { ProyectoRow } from "@/lib/proyectos-orden";

/**
 * Galería de proyectos (/obras) — rediseño "Projects" (pedido de Eze):
 * carrusel de cards con FOTO de portada por obra. La card se pone VERDE al
 * cerrar la obra y muestra la rentabilidad (margen al día). El detalle de cada
 * obra (avances, pendientes, gastos, cerrar) vive en el orbital /obras/[id].
 * Datos: /cashflow/resumen (obras_activas, ya trae margen + foto_portada_url) +
 * obra_avances + tareas vinculadas, con Realtime.
 */

type ObraResumen = {
  obra_id: string;
  presupuesto_id: string;
  nombre_obra: string;
  nombre_cliente: string | null;
  fecha_presupuesto: string | null;
  cobranza_cerrada?: boolean;
  finalizada: boolean;
  margen_al_dia_ars?: number | null;
  foto_portada_url?: string | null;
};

function estadoLabelDe(o: ObraResumen): string {
  if (o.cobranza_cerrada) return "Cobranza cerrada";
  if (o.finalizada) return "Finalizada";
  return "En curso";
}

type Vista = "activas" | "finalizadas" | "todas";

type ProyectoRowResponse = {
  proyectos: ProyectoRow[];
  total: number;
};

function ProyectoCompacto({
  p,
  onDelete,
  eliminando,
}: {
  p: ProyectoRow;
  onDelete: (p: ProyectoRow) => void;
  eliminando: boolean;
}) {
  const aprobado = Boolean(p.presupuesto_aprobado);
  const nombre = p.nombre_obra?.trim() || p.nombre_cliente?.trim() || "Sin nombre";
  const cliente = p.nombre_cliente?.trim() || null;

  return (
    <div
      className={`group relative flex flex-col gap-2 rounded-[20px] p-4 ring-1 transition-colors ${
        aprobado
          ? "ring-cdm-accent/25 hover:ring-cdm-accent/50"
          : "ring-cdm-line hover:ring-cdm-line/70"
      } bg-white/60 dark:bg-zinc-900/40`}
    >
      <Link href={`/obras/${p.id}`} className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="font-geist text-[13px] font-medium leading-snug text-cdm-fg transition-colors line-clamp-2 group-hover:text-cdm-accent">
            {nombre}
          </span>
          {aprobado && (
            <span className="font-mono-hud mr-7 shrink-0 rounded-full border border-cdm-accent/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-cdm-accent">
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
      {/* Tachito — aparece al hover, con confirm. Borra el presupuesto y su data. */}
      <button
        type="button"
        onClick={() => onDelete(p)}
        disabled={eliminando}
        aria-label={`Borrar ${nombre}`}
        title="Borrar presupuesto"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-cdm-muted/50 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
      >
        {eliminando ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path
              d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

export function ObrasScreen() {
  const [vista, setVista] = useState<Vista>("activas");
  const [proyectos, setProyectos] = useState<ProyectoFoto[] | null>(null);
  const [todos, setTodos] = useState<ProyectoRow[] | null>(null);
  const [cargandoTodos, setCargandoTodos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

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
        obras.map((o): ProyectoFoto => {
          const deLaObra = avances.filter(
            (a) => a.presupuesto_id === o.presupuesto_id
          );
          const ultimo = deLaObra[0] ?? null;
          const prox = proximaAccion(
            o.presupuesto_id,
            tareas.map((t) => ({
              presupuesto_id: t.presupuesto_id,
              texto: t.texto,
              creado_at: t.creado_at,
            }))
          );
          return {
            presupuestoId: o.presupuesto_id,
            nombre: o.nombre_obra,
            cliente: o.nombre_cliente?.trim() || null,
            estadoLabel: estadoLabelDe(o),
            finalizada: o.finalizada,
            cobranzaCerrada: Boolean(o.cobranza_cerrada),
            margenAlDia: o.margen_al_dia_ars ?? null,
            fotoUrl: o.foto_portada_url ?? null,
            ultimoAvanceTexto: ultimo?.texto?.trim() || null,
            proximaAccion: prox.hay ? prox.display : null,
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

  // El seguimiento respira: avance del bot o tarea nueva → la galería se actualiza.
  useRealtimeTable("obra_avances", cargar);
  useRealtimeTable("tareas", cargar);

  // Foto de portada subida desde una card → reflejarla sin recargar todo.
  const onFoto = useCallback((presupuestoId: string, url: string) => {
    setProyectos((prev) =>
      prev
        ? prev.map((p) =>
            p.presupuestoId === presupuestoId ? { ...p, fotoUrl: url } : p
          )
        : prev
    );
  }, []);

  // Borrar un presupuesto desde "Todas" (limpiar los de muestra). Optimista.
  const eliminarProyecto = useCallback(async (p: ProyectoRow) => {
    const nombre = p.nombre_obra?.trim() || p.nombre_cliente?.trim() || "este presupuesto";
    if (
      !window.confirm(
        `¿Borrar "${nombre}"? Se borra el presupuesto y su data (ítems, gastos, avances). No se puede deshacer.`
      )
    ) {
      return;
    }
    setEliminandoId(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/presupuestos/${p.id}`, { method: "DELETE" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "No se pudo borrar");
      setTodos((prev) => (prev ? prev.filter((x) => x.id !== p.id) : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    } finally {
      setEliminandoId(null);
    }
  }, []);

  // ACTIVAS = en curso · FINALIZADAS = cerradas (finalizada o cobranza cerrada).
  // Se derivan de la misma carga, así cambiar de pestaña es instantáneo.
  const esCerrada = (p: ProyectoFoto) => p.finalizada || p.cobranzaCerrada;
  const activas = proyectos?.filter((p) => !esCerrada(p)) ?? null;
  const finalizadas = proyectos?.filter((p) => esCerrada(p)) ?? null;
  // TODAS sin borradores (presupuestos vacíos: 0 ítems y 0 gastos).
  const todosVisibles =
    todos?.filter((p) => !(p.cant_items === 0 && p.cant_gastos === 0)) ?? null;

  const renderGaleria = (lista: ProyectoFoto[] | null, vacio: string) => (
    <>
      {!error && lista === null && (
        <div className="grid grid-cols-1 gap-5 px-6 sm:grid-cols-2 md:px-10 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonGlass key={i} filas={3} anchos={["w-3/4", "w-1/2", "w-2/3"]} />
          ))}
        </div>
      )}
      {lista !== null && lista.length === 0 && (
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="px-6 text-center text-[12px] uppercase tracking-[0.2em] text-cdm-muted">
            {vacio}
          </p>
        </div>
      )}
      {lista !== null && lista.length > 0 && (
        <GaleriaProyectos proyectos={lista} onFoto={onFoto} />
      )}
    </>
  );

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Proyectos
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Galería de obras
          </p>
        </div>
      </header>

      {/* Toggle ACTIVAS / TODAS + alta de obra */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-6 pt-6 md:px-10">
        <div className="flex gap-2">
          {(
            [
              ["activas", "Activas"],
              ["finalizadas", "Finalizadas"],
              ["todas", "Todas"],
            ] as const
          ).map(([v, label]) => {
            const activo = vista === v;
            return (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`font-mono-hud inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                  activo
                    ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                    : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="font-mono-hud inline-flex items-center rounded-full bg-cdm-accent/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/20"
        >
          + Nueva obra
        </button>
      </div>

      <div className="relative z-10 pt-8">
        {error && (
          <p className="px-6 pb-4 text-[12px] text-red-500 md:px-10">{error}</p>
        )}

        {/* Vista ACTIVAS — galería de obras EN CURSO */}
        {vista === "activas" &&
          renderGaleria(
            activas,
            "Sin obras en curso. Cuando aprobás un presupuesto aparece acá; al cerrarla pasa a Finalizadas."
          )}

        {/* Vista FINALIZADAS — galería de obras cerradas */}
        {vista === "finalizadas" &&
          renderGaleria(finalizadas, "Todavía no hay obras finalizadas.")}

        {/* Vista TODAS — lista compacta (sin borradores) */}
        {vista === "todas" && (
          <div className="px-6 pb-16 md:px-10">
            {cargandoTodos && todos === null && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonGlass key={i} filas={3} anchos={["w-3/4", "w-1/2", "w-2/3"]} />
                ))}
              </div>
            )}
            {todosVisibles !== null && todosVisibles.length === 0 && (
              <p className="text-[11px] uppercase tracking-[0.2em] text-cdm-muted">
                Sin proyectos registrados.
              </p>
            )}
            {todosVisibles !== null && todosVisibles.length > 0 && (
              <>
                <p className="font-mono-hud mb-4 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                  {todosVisibles.length} proyecto{todosVisibles.length !== 1 ? "s" : ""}
                </p>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {todosVisibles.map((p) => (
                    <ProyectoCompacto
                      key={p.id}
                      p={p}
                      onDelete={eliminarProyecto}
                      eliminando={eliminandoId === p.id}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <NuevaObraModal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        onCreated={() => {
          setModalAbierto(false);
          setVista("activas");
          setTodos(null);
          void cargar();
        }}
      />
    </div>
  );
}
