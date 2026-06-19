"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstadoCotizacion } from "@/lib/cotizador/tipos";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import {
  GaleriaCotizaciones,
  type CotizacionFoto,
} from "@/components/cockpit/cotizacion-galeria";

type CotizacionListada = {
  id: string;
  creado_at: string;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  total_min: number | null;
  total_max: number | null;
  foto_portada_url: string | null;
  archivos_count: number;
};

/**
 * Badges de estado estilo texto + ring (los del chip `cdm-chip` de la Mesa de
 * Revisión). La galería usa sus propios badges de fondo sólido (ESTADO_BADGE,
 * interno de cotizacion-galeria). Estos se exportan porque revision-screen los
 * consume de acá — no los muevas sin avisar a la Mesa.
 */
export const ESTADO_COLOR: Record<EstadoCotizacion, string> = {
  borrador: "text-cdm-muted ring-cdm-line",
  en_revision: "text-amber-400 ring-amber-400/40",
  aprobada: "text-emerald-400 ring-emerald-400/40",
  rechazada: "text-red-400 ring-red-400/40",
  documento_emitido: "text-cdm-accent ring-cdm-accent/40",
};

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  documento_emitido: "Emitida",
};

const FILTROS: Array<{ valor: EstadoCotizacion | "todas"; etiqueta: string }> = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "en_revision", etiqueta: "En revisión" },
  { valor: "aprobada", etiqueta: "Aprobadas" },
  { valor: "documento_emitido", etiqueta: "Emitidas" },
  { valor: "rechazada", etiqueta: "Rechazadas" },
  { valor: "borrador", etiqueta: "Borradores" },
];

function aFoto(c: CotizacionListada): CotizacionFoto {
  return {
    id: c.id,
    titulo: c.titulo,
    zona: c.zona,
    estado: c.estado,
    totalMin: c.total_min,
    totalMax: c.total_max,
    fotoUrl: c.foto_portada_url,
    archivosCount: c.archivos_count,
  };
}

export function CotizacionesScreen() {
  const [cotizaciones, setCotizaciones] = useState<CotizacionFoto[]>([]);
  const [filtro, setFiltro] = useState<EstadoCotizacion | "todas">("todas");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const eliminar = useCallback(async (c: CotizacionFoto) => {
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
      const lista = (json.cotizaciones ?? []) as CotizacionListada[];
      setCotizaciones(lista.map(aFoto));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Foto de portada subida desde una card → reflejarla sin recargar todo.
  const onFoto = useCallback((id: string, url: string) => {
    setCotizaciones((prev) => prev.map((c) => (c.id === id ? { ...c, fotoUrl: url } : c)));
  }, []);

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
        {error && <p className="mb-4 text-[12px] text-red-400">{error}</p>}

        {cargando ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
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
          <GaleriaCotizaciones
            cotizaciones={cotizaciones}
            onFoto={onFoto}
            onBorrar={(c) => void eliminar(c)}
            borrandoId={eliminando}
          />
        )}
      </div>
    </div>
  );
}
