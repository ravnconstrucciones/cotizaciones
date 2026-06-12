"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EstadoCotizacion } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";

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
  borrador: "text-ravn-muted border-ravn-line",
  en_revision: "text-amber-300 border-amber-300/40",
  aprobada: "text-emerald-400 border-emerald-400/40",
  rechazada: "text-red-400 border-red-400/40",
  documento_emitido: "text-ravn-fg border-ravn-fg/40",
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
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <VolverAlInicio />
      <header className="mb-8 border-b border-ravn-line pb-4">
        <h1 className="text-2xl font-light uppercase tracking-[0.18em]">Cotizaciones</h1>
        <p className="mt-1 text-xs text-ravn-muted">
          Cotizador 2.0 — toda cotización pasa por la mesa de revisión antes del documento.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => setFiltro(f.valor)}
            className={`border px-3 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors ${
              filtro === f.valor
                ? "border-ravn-fg text-ravn-fg"
                : "border-ravn-line text-ravn-muted hover:text-ravn-fg"
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {cargando ? (
        <p className="text-sm text-ravn-muted">Cargando…</p>
      ) : cotizaciones.length === 0 ? (
        <p className="text-sm text-ravn-muted">
          Sin cotizaciones acá. Llegan solas desde WhatsApp o la barra de comando
          (cola → daemon → mesa de revisión).
        </p>
      ) : (
        <ul className="divide-y divide-ravn-line border-t border-ravn-line">
          {cotizaciones.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cotizaciones/${c.id}/revision`}
                className="flex items-center justify-between gap-4 px-2 py-4 transition-colors hover:bg-ravn-subtle"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.titulo}</p>
                  <p className="mt-0.5 text-xs text-ravn-muted">
                    {c.zona ? `${c.zona} · ` : ""}
                    {new Date(c.creado_at).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-sm tabular-nums">{rangoTotal(c)}</span>
                  <span
                    className={`border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${ESTADO_COLOR[c.estado]}`}
                  >
                    {ESTADO_LABEL[c.estado]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
