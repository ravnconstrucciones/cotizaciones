"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";

type CierrePayload = {
  generado_en: string;
  margen_proyectado_ars: number;
  margen_real_ars: number;
  diferencia_ars: number;
  diferencia_pct: number;
  etiqueta: string;
  monto_resultado_abs: number;
  por_categoria: Record<
    string,
    { presupuestado: number; real: number; tipo: string }
  >;
  totales: {
    ingresos_proyectados: number;
    egresos_proyectados: number;
    ingresos_reales: number;
    egresos_reales: number;
  };
};

export function CashflowCierreScreen({ obraId }: { obraId: string }) {
  const [data, setData] = useState<{
    created_at: string;
    payload: CierrePayload;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cashflow/obra/${encodeURIComponent(obraId)}/cierre`,
        { cache: "no-store" }
      );
      const j = (await res.json()) as {
        cierre: { created_at: string; payload: CierrePayload } | null;
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? "Error");
        setData(null);
        return;
      }
      if (!j.cierre) {
        setError("Todavía no hay cierre guardado para esta obra.");
        setData(null);
        return;
      }
      setData(j.cierre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  }, [obraId]);

  useEffect(() => {
    void load();
  }, [load]);

  const p = data?.payload;

  return (
    <main className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-2xl">
        <VolverAlInicio />

        {/* Header con línea de horizonte */}
        <div className="relative pb-3">
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            Cashflow
          </h1>
        </div>

        <Link
          href={`/cashflow/obra/${encodeURIComponent(obraId)}`}
          className="mt-6 inline-block text-[10px] font-medium uppercase tracking-wider text-cdm-muted underline-offset-2 hover:text-cdm-fg hover:underline"
        >
          ← Volver al cashflow de la obra
        </Link>

        <p className="mt-6 text-xl font-semibold uppercase tracking-wide text-cdm-fg">
          Resumen de cierre
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-cdm-muted">Cargando…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-400">{error}</p>
        ) : p ? (
          <div className="mt-10 space-y-8">
            {/* Resultado principal */}
            <div
              className={`cdm-glass px-5 py-6 text-center ${
                p.etiqueta === "GANÓ"
                  ? "border-emerald-400/30"
                  : "border-red-400/30"
              }`}
            >
              <p
                className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
                  p.etiqueta === "GANÓ" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {p.etiqueta}
              </p>
              <CifraHeroica
                className="mt-3 text-[clamp(28px,2.2vw,40px)] leading-none"
                colorBase={p.etiqueta === "GANÓ" ? "#34d399" : "#f87171"}
              >
                {formatMoneyInt(p.monto_resultado_abs)}
              </CifraHeroica>
              <p className="mt-2 text-xs text-cdm-muted">
                Margen real neto (ingresos reales − egresos reales con registro).
              </p>
            </div>

            {/* Márgenes */}
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="cdm-glass p-4">
                <dt className="text-[10px] uppercase text-cdm-muted">
                  Margen proyectado
                </dt>
                <dd className="mt-1 tabular-nums text-lg text-cdm-fg">
                  {formatMoneyInt(p.margen_proyectado_ars)}
                </dd>
              </div>
              <div className="cdm-glass p-4">
                <dt className="text-[10px] uppercase text-cdm-muted">
                  Margen real
                </dt>
                <dd className="mt-1 tabular-nums text-lg text-cdm-fg">
                  {formatMoneyInt(p.margen_real_ars)}
                </dd>
              </div>
              <div className="cdm-glass p-4 sm:col-span-2">
                <dt className="text-[10px] uppercase text-cdm-muted">
                  Diferencia (real − proyectado)
                </dt>
                <dd className="mt-1 tabular-nums text-lg text-cdm-fg">
                  {formatMoneyInt(p.diferencia_ars)} ({p.diferencia_pct}%)
                </dd>
              </div>
            </dl>

            {/* Por categoría */}
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
                Por categoría
              </h2>
              <ul className="cdm-glass mt-3 divide-y divide-cdm-line">
                {Object.entries(p.por_categoria).map(([cat, v]) => (
                  <li
                    key={cat}
                    className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between"
                  >
                    <span className="text-cdm-fg">
                      <span className="text-cdm-muted">{v.tipo} ·</span>{" "}
                      {cat.replace(/_/g, " ")}
                    </span>
                    <span className="tabular-nums text-xs text-cdm-muted sm:text-sm">
                      Proy. {formatMoneyInt(v.presupuestado)} · Real{" "}
                      {formatMoneyInt(v.real)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[10px] text-cdm-muted">
              Guardado el {data?.created_at?.slice(0, 10) ?? "—"} ·{" "}
              {p.generado_en?.slice(0, 19) ?? ""}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
