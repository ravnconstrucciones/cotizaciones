"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { EstadoCotizacion } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";

type CotizacionListada = {
  id: string;
  creado_at: string;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  total_min: number | null;
  total_max: number | null;
};

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  documento_emitido: "Documento emitido",
};

export const ESTADO_COLOR: Record<EstadoCotizacion, string> = {
  borrador: "text-cdm-muted ring-cdm-line",
  en_revision: "text-amber-400 ring-amber-400/40",
  aprobada: "text-emerald-400 ring-emerald-400/40",
  rechazada: "text-red-400 ring-red-400/40",
  documento_emitido: "text-cdm-accent ring-cdm-accent/40",
};

const FILTROS: Array<{ valor: EstadoCotizacion | "todas"; etiqueta: string }> = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "en_revision", etiqueta: "En revisión" },
  { valor: "aprobada", etiqueta: "Aprobadas" },
  { valor: "documento_emitido", etiqueta: "Emitidas" },
  { valor: "rechazada", etiqueta: "Rechazadas" },
  { valor: "borrador", etiqueta: "Borradores" },
];

function rangoTotal(c: CotizacionListada): string {
  if (c.total_min == null && c.total_max == null) return "—";
  if (c.total_min != null && c.total_max != null && c.total_min !== c.total_max) {
    return `${formatMoneyInt(c.total_min)} – ${formatMoneyInt(c.total_max)}`;
  }
  return formatMoneyInt(c.total_max ?? c.total_min ?? 0);
}

export function CotizacionesScreen() {
  const [cotizaciones, setCotizaciones] = useState<CotizacionListada[]>([]);
  const [filtro, setFiltro] = useState<EstadoCotizacion | "todas">("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const eliminar = useCallback(async (c: CotizacionListada) => {
    if (!window.confirm(`¿Borrar la cotización "${c.titulo}"? No se puede deshacer.`)) {
      return;
    }
    setEliminando(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/cotizaciones/${c.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo borrar");
      setCotizaciones((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    } finally {
      setEliminando(null);
    }
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = filtro === "todas" ? "" : `?estado=${filtro}`;
      const res = await fetch(`/api/cotizaciones${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setCotizaciones(json.cotizaciones ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      {/* Header — mismo lenguaje que obras-screen */}
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Cotizaciones
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Mesa de revisión · Cotizador 2.0
          </p>
        </div>
      </header>

      {/* Chips de filtro — mismo lenguaje pill mono que obras-screen */}
      <div className="relative z-10 flex flex-wrap gap-2 px-6 pt-6 md:px-10">
        {FILTROS.map((f) => {
          const activo = filtro === f.valor;
          return (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`font-mono-hud inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                activo
                  ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                  : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
              }`}
            >
              {f.etiqueta}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div className="relative z-10 px-6 pt-8 pb-24 md:px-10">
        {error && (
          <p className="mb-4 text-[12px] text-red-400">{error}</p>
        )}

        {cargando ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonGlass key={i} filas={3} anchos={["w-2/3", "w-full", "w-1/2"]} />
            ))}
          </div>
        ) : cotizaciones.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="px-6 text-center text-[12px] uppercase tracking-[0.2em] text-cdm-muted">
              Sin cotizaciones. Llegan desde WhatsApp o la barra de comando.
            </p>
          </div>
        ) : (
          <motion.ul
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3"
          >
            {cotizaciones.map((c) => (
              <motion.li
                key={c.id}
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="group flex items-stretch rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 transition-shadow hover:ring-cdm-line/70"
              >
                <Link
                  href={`/cotizaciones/${c.id}/revision`}
                  className="flex flex-1 items-center justify-between gap-4 rounded-l-[24px] px-5 py-4 transition-colors hover:bg-cdm-fg/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="font-geist truncate text-[13px] font-medium leading-snug text-cdm-fg group-hover:text-cdm-accent transition-colors">
                      {c.titulo}
                    </p>
                    <p className="font-mono-hud mt-1 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                      {c.zona ? `${c.zona} · ` : ""}
                      {new Date(c.creado_at).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-geist text-[13px] tabular-nums text-cdm-fg/80">
                      {rangoTotal(c)}
                    </span>
                    <span
                      className={`font-mono-hud rounded-full px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ring-1 ${ESTADO_COLOR[c.estado]}`}
                    >
                      {ESTADO_LABEL[c.estado]}
                    </span>
                  </div>
                </Link>
                {/* Botón borrar — preservado con su lógica `eliminar(c)` */}
                <button
                  type="button"
                  onClick={() => void eliminar(c)}
                  disabled={eliminando === c.id}
                  aria-label={`Borrar cotización ${c.titulo}`}
                  title="Borrar cotización"
                  className="flex shrink-0 items-center justify-center rounded-r-[24px] px-4 text-cdm-muted/50 transition-colors hover:text-red-400 disabled:opacity-40"
                >
                  {eliminando === c.id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
                  ) : (
                    <span className="text-lg leading-none">×</span>
                  )}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  );
}
