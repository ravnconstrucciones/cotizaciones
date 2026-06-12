"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { repartirPorcentajesIngresos } from "@/lib/cashflow-planificar";
import { todayBuenosAires } from "@/lib/cashflow-compute";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";

type IngresoPrev = {
  clave: string;
  categoria: string;
  descripcion: string;
  porcentaje: number;
  monto: number;
  fecha_proyectada: string;
};

type EgresoPrev = {
  descripcion: string;
  monto: number;
  categoria: string;
  fecha_proyectada: string;
};

type PreviewJson = {
  presupuesto_id: string;
  total_ars_referencia: number;
  fecha_base: string;
  ingresos: IngresoPrev[];
  egresos: EgresoPrev[];
};

const inp =
  "w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]";

const inpDate =
  "w-full border border-cdm-line bg-cdm-panel/60 px-3 py-2 text-sm text-cdm-fg focus:border-cdm-accent focus:outline-none";

export function PlanificarCashflowScreen({
  presupuestoId,
}: {
  presupuestoId: string;
}) {
  const [preview, setPreview] = useState<PreviewJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pctAnt, setPctAnt] = useState("30");
  const [pct1, setPct1] = useState("30");
  const [pct2, setPct2] = useState("20");
  const [dias1, setDias1] = useState("30");
  const [dias2, setDias2] = useState("60");
  const [diasF, setDiasF] = useState("90");
  const [ingresos, setIngresos] = useState<IngresoPrev[]>([]);
  const [egresos, setEgresos] = useState<EgresoPrev[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cashflow/planificar-preview?presupuesto_id=${encodeURIComponent(presupuestoId)}`,
        { cache: "no-store" }
      );
      const j = (await res.json()) as PreviewJson & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar la vista previa.");
        setPreview(null);
        return;
      }
      setPreview(j);
      setEgresos(j.egresos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
    } finally {
      setLoading(false);
    }
  }, [presupuestoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRef = preview?.total_ars_referencia ?? 0;
  const hoy = preview?.fecha_base ?? todayBuenosAires();

  useEffect(() => {
    if (!preview || totalRef <= 0) return;
    const pA = parseFloat(pctAnt.replace(",", ".")) || 0;
    const p1 = parseFloat(pct1.replace(",", ".")) || 0;
    const p2 = parseFloat(pct2.replace(",", ".")) || 0;
    const d1 = parseInt(dias1, 10) || 30;
    const d2 = parseInt(dias2, 10) || 60;
    const dF = parseInt(diasF, 10) || 90;
    const rows = repartirPorcentajesIngresos(
      pA,
      p1,
      p2,
      totalRef,
      hoy,
      d1,
      d2,
      dF
    );
    setIngresos(rows);
  }, [
    pctAnt,
    pct1,
    pct2,
    dias1,
    dias2,
    diasF,
    preview,
    totalRef,
    hoy,
  ]);

  async function confirmar() {
    setSaving(true);
    setError(null);
    try {
      const filas = [
        ...ingresos.map((r) => ({
          tipo: "ingreso" as const,
          categoria: r.categoria,
          descripcion: r.descripcion,
          monto_proyectado: roundArs2(r.monto),
          fecha_proyectada: r.fecha_proyectada,
        })),
        ...egresos.map((r) => ({
          tipo: "egreso" as const,
          categoria: r.categoria,
          descripcion: r.descripcion,
          monto_proyectado: roundArs2(r.monto),
          fecha_proyectada: r.fecha_proyectada,
        })),
      ];
      const res = await fetch("/api/cashflow/planificar-confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presupuesto_id: presupuestoId, filas }),
      });
      const j = (await res.json()) as { error?: string; obra_id?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo confirmar.");
        return;
      }
      const oid = j.obra_id;
      if (oid) {
        window.location.href = `/cashflow/obra/${encodeURIComponent(oid)}`;
      } else {
        window.location.href = "/historial";
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function setEgreso(i: number, patch: Partial<EgresoPrev>) {
    setEgresos((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row))
    );
  }

  function setIngreso(i: number, patch: Partial<IngresoPrev>) {
    setIngresos((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row))
    );
  }

  return (
    <main className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto w-full max-w-3xl">
        <VolverAlInicio />

        {/* Header con línea de horizonte */}
        <div className="relative pb-3">
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
            <span
              aria-hidden
              className="h-[5px] w-[5px] bg-cdm-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]"
            />
            Cashflow
          </h1>
        </div>

        <header className="mt-8 border-b border-cdm-line pb-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-cdm-muted">
            Cierre de presupuesto
          </p>
          <p className="mt-2 text-xl font-semibold uppercase tracking-wide text-cdm-fg sm:text-2xl">
            Revisar plan de cashflow
          </p>
          <p className="mt-3 text-sm text-cdm-muted">
            Total referencia (ARS):{" "}
            <span className="font-medium text-cdm-fg">
              {formatTotalDisplay(Math.round(totalRef), "ARS")}
            </span>
            . Al confirmar se aprueba el presupuesto y se cargan los movimientos en
            la libreta de caja (mismo monto y fecha en ingreso/egreso registrado).
          </p>
        </header>

        {loading ? (
          <p className="mt-10 text-sm text-cdm-muted">Cargando…</p>
        ) : error && !preview ? (
          <div className="mt-10 space-y-4">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              href="/historial"
              className="inline-block text-sm uppercase tracking-wider text-cdm-muted underline"
            >
              Volver al historial
            </Link>
          </div>
        ) : preview ? (
          <div className="mt-10 flex flex-col gap-10">
            {error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : null}

            {/* Porcentajes ingresos */}
            <section className="cdm-glass p-5">
              <h2 className="text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
                Porcentajes ingresos
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="text-xs text-cdm-muted">
                  Anticipo %
                  <input className={`${inp} mt-1`} value={pctAnt} onChange={(e) => setPctAnt(e.target.value)} />
                </label>
                <label className="text-xs text-cdm-muted">
                  Cuota 1 %
                  <input className={`${inp} mt-1`} value={pct1} onChange={(e) => setPct1(e.target.value)} />
                </label>
                <label className="text-xs text-cdm-muted">
                  Cuota 2 %
                  <input className={`${inp} mt-1`} value={pct2} onChange={(e) => setPct2(e.target.value)} />
                </label>
                <label className="text-xs text-cdm-muted">
                  Días cuota 1
                  <input className={`${inp} mt-1`} value={dias1} onChange={(e) => setDias1(e.target.value)} />
                </label>
                <label className="text-xs text-cdm-muted">
                  Días cuota 2
                  <input className={`${inp} mt-1`} value={dias2} onChange={(e) => setDias2(e.target.value)} />
                </label>
                <label className="text-xs text-cdm-muted">
                  Días cuota final
                  <input className={`${inp} mt-1`} value={diasF} onChange={(e) => setDiasF(e.target.value)} />
                </label>
              </div>
              <p className="mt-3 text-[11px] text-cdm-muted">
                La cuota final toma el % restante para llegar al 100%. Podés
                ajustar cada monto y fecha en la tabla.
              </p>
            </section>

            {/* Ingresos proyectados */}
            <section className="cdm-glass p-5">
              <h2 className="text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
                Ingresos proyectados
              </h2>
              <ul className="mt-4 space-y-4">
                {ingresos.map((r, i) => (
                  <li
                    key={r.clave}
                    className="grid gap-3 border-b border-cdm-line pb-4 last:border-b-0 sm:grid-cols-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-cdm-fg">{r.descripcion}</p>
                      <p className="text-[10px] uppercase text-cdm-muted">
                        {r.categoria.replace(/_/g, " ")}
                      </p>
                    </div>
                    <label className="text-xs text-cdm-muted">
                      Monto ARS
                      <input
                        className={`${inp} mt-1 tabular-nums`}
                        value={String(r.monto).replace(".", ",")}
                        onChange={(e) =>
                          setIngreso(i, {
                            monto: roundArs2(parseFormattedNumber(e.target.value)),
                          })
                        }
                      />
                    </label>
                    <label className="text-xs text-cdm-muted sm:col-span-2">
                      Fecha proyectada
                      <input
                        type="date"
                        className={`${inpDate} mt-1 max-w-xs`}
                        value={r.fecha_proyectada}
                        onChange={(e) =>
                          setIngreso(i, { fecha_proyectada: e.target.value })
                        }
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            {/* Egresos */}
            <section className="cdm-glass p-5">
              <h2 className="text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
                Egresos desde ítems del presupuesto
              </h2>
              <ul className="mt-4 space-y-4">
                {egresos.map((r, i) => (
                  <li
                    key={`${i}-${r.descripcion}`}
                    className="grid gap-3 border-b border-cdm-line pb-4 last:border-b-0 sm:grid-cols-2"
                  >
                    <p className="text-sm text-cdm-fg">{r.descripcion}</p>
                    <label className="text-xs text-cdm-muted">
                      Monto ARS
                      <input
                        className={`${inp} mt-1 tabular-nums`}
                        value={String(r.monto).replace(".", ",")}
                        onChange={(e) =>
                          setEgreso(i, {
                            monto: roundArs2(parseFormattedNumber(e.target.value)),
                          })
                        }
                      />
                    </label>
                    <label className="text-xs text-cdm-muted sm:col-span-2">
                      Fecha proyectada
                      <input
                        type="date"
                        className={`${inpDate} mt-1 max-w-xs`}
                        value={r.fecha_proyectada}
                        onChange={(e) =>
                          setEgreso(i, { fecha_proyectada: e.target.value })
                        }
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                href="/historial"
                className="cdm-chip cursor-pointer inline-flex items-center justify-center border border-cdm-line px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cdm-muted transition-colors hover:border-cdm-accent/30 hover:text-cdm-fg"
              >
                Cancelar
              </Link>
              <button
                type="button"
                disabled={saving || totalRef <= 0}
                onClick={() => void confirmar()}
                className="cdm-chip cursor-pointer inline-flex items-center justify-center border border-cdm-accent/60 bg-cdm-accent/15 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25 disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Confirmar y aprobar"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
