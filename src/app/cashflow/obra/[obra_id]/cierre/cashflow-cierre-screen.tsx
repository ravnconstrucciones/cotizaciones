"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";

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
    <div className="min-h-[100dvh] bg-ravn-surface px-4 py-10 text-ravn-fg sm:px-8">
      <div className="mx-auto max-w-2xl">
        <VolverAlInicio />
        <Link
          href={`/cashflow/obra/${encodeURIComponent(obraId)}`}
          className="mt-6 inline-block text-[10px] font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
        >
          ← Volver al cashflow de la obra
        </Link>

        <h1 className="mt-8 font-raleway text-xl font-semibold uppercase tracking-wide text-ravn-accent">
          Resumen de cierre
        </h1>

        {loading ? (
          <p className="mt-8 text-sm text-ravn-muted">Cargando…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : p ? (
          <div className="mt-10 space-y-8 border border-ravn-line p-6">
            <div
              className={`border-2 px-5 py-6 text-center ${
                p.etiqueta === "GANÓ"
                  ? "border-emerald-800/80 bg-emerald-950/30 text-emerald-100"
                  : "border-red-800/80 bg-red-950/30 text-red-100"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]">
                {p.etiqueta}
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {formatMoneyInt(p.monto_resultado_abs)}
              </p>
              <p className="mt-2 text-xs text-ravn-muted">
                Margen real neto (ingresos reales − egresos reales con registro).
              </p>
            </div>

            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="border border-ravn-line p-4">
                <dt className="text-[10px] uppercase text-ravn-muted">
                  Margen proyectado
                </dt>
                <dd className="mt-1 tabular-nums text-lg">
                  {formatMoneyInt(p.margen_proyectado_ars)}
                </dd>
              </div>
              <div className="border border-ravn-line p-4">
                <dt className="text-[10px] uppercase text-ravn-muted">
                  Margen real
                </dt>
                <dd className="mt-1 tabular-nums text-lg">
                  {formatMoneyInt(p.margen_real_ars)}
                </dd>
              </div>
              <div className="border border-ravn-line p-4 sm:col-span-2">
                <dt className="text-[10px] uppercase text-ravn-muted">
                  Diferencia (real − proyectado)
                </dt>
                <dd className="mt-1 tabular-nums text-lg">
                  {formatMoneyInt(p.diferencia_ars)} ({p.diferencia_pct}%)
                </dd>
              </div>
            </dl>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ravn-accent">
                Por categoría
              </h2>
              <ul className="mt-3 divide-y divide-ravn-line border border-ravn-line">
                {Object.entries(p.por_categoria).map(([cat, v]) => (
                  <li
                    key={cat}
                    className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between"
                  >
                    <span>
                      <span className="text-ravn-muted">{v.tipo} ·</span>{" "}
                      {cat.replace(/_/g, " ")}
                    </span>
                    <span className="tabular-nums text-xs sm:text-sm">
                      Proy. {formatMoneyInt(v.presupuestado)} · Real{" "}
                      {formatMoneyInt(v.real)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[10px] text-ravn-muted">
              Guardado el {data?.created_at?.slice(0, 10) ?? "—"} ·{" "}
              {p.generado_en?.slice(0, 19) ?? ""}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
