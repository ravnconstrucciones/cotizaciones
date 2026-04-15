"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { repartirPorcentajesIngresos } from "@/lib/cashflow-planificar";
import { todayBuenosAires } from "@/lib/cashflow-compute";
import { parseFormattedNumber, roundArs2 } from "@/lib/format-currency";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { VolverAlInicio } from "@/components/volver-al-inicio";

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
  "w-full rounded-none border border-ravn-line bg-ravn-surface px-3 py-2.5 text-sm text-ravn-fg focus-visible:border-ravn-fg focus-visible:outline-none";

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
    <div className="min-h-[100dvh] bg-ravn-surface px-4 py-10 pb-24 text-ravn-fg sm:px-8">
      <div className="mx-auto max-w-3xl">
        <VolverAlInicio />
        <header className="mt-8 border-b border-ravn-line pb-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ravn-muted">
            Cierre de presupuesto
          </p>
          <h1 className="mt-2 font-raleway text-xl font-semibold uppercase tracking-wide text-ravn-accent sm:text-2xl">
            Revisar plan de cashflow
          </h1>
          <p className="mt-3 text-sm text-ravn-muted">
            Total referencia (ARS):{" "}
            <span className="font-medium text-ravn-fg">
              {formatTotalDisplay(Math.round(totalRef), "ARS")}
            </span>
            . Al confirmar se aprueba el presupuesto y se cargan los movimientos en
            la libreta de caja (mismo monto y fecha en ingreso/egreso registrado).
          </p>
        </header>

        {loading ? (
          <p className="mt-10 text-sm text-ravn-muted">Cargando…</p>
        ) : error && !preview ? (
          <div className="mt-10 space-y-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Link
              href="/historial"
              className="inline-block text-sm uppercase tracking-wider text-ravn-muted underline"
            >
              Volver al historial
            </Link>
          </div>
        ) : preview ? (
          <div className="mt-10 flex flex-col gap-10">
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}

            <section className="border border-ravn-line p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ravn-accent">
                Porcentajes ingresos
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="text-xs text-ravn-muted">
                  Anticipo %
                  <input className={`${inp} mt-1`} value={pctAnt} onChange={(e) => setPctAnt(e.target.value)} />
                </label>
                <label className="text-xs text-ravn-muted">
                  Cuota 1 %
                  <input className={`${inp} mt-1`} value={pct1} onChange={(e) => setPct1(e.target.value)} />
                </label>
                <label className="text-xs text-ravn-muted">
                  Cuota 2 %
                  <input className={`${inp} mt-1`} value={pct2} onChange={(e) => setPct2(e.target.value)} />
                </label>
                <label className="text-xs text-ravn-muted">
                  Días cuota 1
                  <input className={`${inp} mt-1`} value={dias1} onChange={(e) => setDias1(e.target.value)} />
                </label>
                <label className="text-xs text-ravn-muted">
                  Días cuota 2
                  <input className={`${inp} mt-1`} value={dias2} onChange={(e) => setDias2(e.target.value)} />
                </label>
                <label className="text-xs text-ravn-muted">
                  Días cuota final
                  <input className={`${inp} mt-1`} value={diasF} onChange={(e) => setDiasF(e.target.value)} />
                </label>
              </div>
              <p className="mt-3 text-[11px] text-ravn-muted">
                La cuota final toma el % restante para llegar al 100%. Podés
                ajustar cada monto y fecha en la tabla.
              </p>
            </section>

            <section className="border border-ravn-line p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ravn-accent">
                Ingresos proyectados
              </h2>
              <ul className="mt-4 space-y-4">
                {ingresos.map((r, i) => (
                  <li
                    key={r.clave}
                    className="grid gap-3 border-b border-ravn-line pb-4 last:border-b-0 sm:grid-cols-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{r.descripcion}</p>
                      <p className="text-[10px] uppercase text-ravn-muted">
                        {r.categoria.replace(/_/g, " ")}
                      </p>
                    </div>
                    <label className="text-xs text-ravn-muted">
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
                    <label className="text-xs text-ravn-muted sm:col-span-2">
                      Fecha proyectada
                      <input
                        type="date"
                        className={`${inp} mt-1 max-w-xs`}
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

            <section className="border border-ravn-line p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ravn-accent">
                Egresos desde ítems del presupuesto
              </h2>
              <ul className="mt-4 space-y-4">
                {egresos.map((r, i) => (
                  <li
                    key={`${i}-${r.descripcion}`}
                    className="grid gap-3 border-b border-ravn-line pb-4 last:border-b-0 sm:grid-cols-2"
                  >
                    <p className="text-sm">{r.descripcion}</p>
                    <label className="text-xs text-ravn-muted">
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
                    <label className="text-xs text-ravn-muted sm:col-span-2">
                      Fecha proyectada
                      <input
                        type="date"
                        className={`${inp} mt-1 max-w-xs`}
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
                className="inline-flex items-center justify-center border-2 border-ravn-line px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-ravn-fg hover:bg-ravn-subtle"
              >
                Cancelar
              </Link>
              <button
                type="button"
                disabled={saving || totalRef <= 0}
                onClick={() => void confirmar()}
                className="inline-flex items-center justify-center border-2 border-ravn-accent bg-ravn-accent px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ravn-accent-contrast hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Confirmar y aprobar"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
