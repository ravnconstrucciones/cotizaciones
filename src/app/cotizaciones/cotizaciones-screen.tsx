"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EstadoCotizacion } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
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
  borrador: "text-cdm-muted border-cdm-line",
  en_revision: "text-amber-300 border-amber-300/40",
  aprobada: "text-emerald-400 border-emerald-400/40",
  rechazada: "text-red-400 border-red-400/40",
  documento_emitido: "text-cdm-accent-2 border-cdm-accent-2/40",
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
    <main className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <div className="relative pb-3">
          {/* Línea de horizonte detrás del header — mismo lenguaje que historial/obras. */}
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            Cotizaciones
          </h1>
        </div>
        <p className="mt-4 text-sm text-cdm-muted">
          Cotizador 2.0 — toda cotización pasa por la mesa de revisión antes del documento.
        </p>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`cdm-chip cursor-pointer border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                filtro === f.valor
                  ? "border-cdm-accent/70 bg-cdm-accent/15 text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)]"
                  : "border-cdm-line text-cdm-muted hover:border-cdm-accent/30 hover:text-cdm-fg"
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}

        {cargando ? (
          <div className="cdm-glass mt-6 p-5">
            <SkeletonGlass filas={4} anchos={["w-2/3", "w-full", "w-1/2", "w-3/4"]} />
          </div>
        ) : cotizaciones.length === 0 ? (
          <div className="mt-6 flex h-28 items-center justify-center border border-dashed border-cdm-line">
            <span className="max-w-md px-4 text-center text-[10px] uppercase tracking-[0.2em] leading-relaxed text-cdm-muted/60">
              Sin cotizaciones acá. Llegan solas desde WhatsApp o la barra de
              comando (cola → daemon → mesa de revisión)
            </span>
          </div>
        ) : (
          <ul className="cdm-glass mt-6 px-4 sm:px-5">
            {cotizaciones.map((c, i) => (
              <li
                key={c.id}
                className={`flex items-stretch ${i > 0 ? "border-t border-cdm-line" : ""}`}
              >
                <Link
                  href={`/cotizaciones/${c.id}/revision`}
                  className="flex flex-1 items-center justify-between gap-4 px-1 py-4 transition-colors hover:bg-cdm-fg/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.titulo}</p>
                    <p className="mt-0.5 text-xs text-cdm-muted">
                      {c.zona ? `${c.zona} · ` : ""}
                      {new Date(c.creado_at).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-sm tabular-nums">{rangoTotal(c)}</span>
                    <span
                      className={`cdm-chip border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${ESTADO_COLOR[c.estado]}`}
                    >
                      {ESTADO_LABEL[c.estado]}
                    </span>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => void eliminar(c)}
                  disabled={eliminando === c.id}
                  aria-label={`Borrar cotización ${c.titulo}`}
                  title="Borrar cotización"
                  className="flex shrink-0 items-center justify-center px-3 text-cdm-muted/60 transition-colors hover:text-red-400 disabled:opacity-40"
                >
                  {eliminando === c.id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400" />
                  ) : (
                    <span className="text-lg leading-none">×</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
