"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { formatNumeroComercialHumano } from "@/lib/presupuesto-numero-comercial";
import {
  importeArsParaPropuesta,
  importeMostradoEnteroEnMoneda,
  parsePropuestaPrefJsonDesdeMismaFila,
  type PropuestaPrefV1,
} from "@/lib/ravn-propuesta-pref";
type MonedaRow = "ARS" | "USD";

type PresupuestoHistorialRow = {
  id: string;
  nombre_cliente: string | null;
  fecha: string | null;
  created_at: string | null;
  numero_correlativo: number | null;
  moneda: MonedaRow | null;
  /** Solo los aprobados aparecen en Control de gastos y pueden registrar gastos. */
  presupuesto_aprobado: boolean;
};

type ItemAgg = {
  presupuesto_id: string;
  cantidad: number;
  precio_material_congelado: number;
  precio_mo_congelada: number;
};

function formatFechaCreacion(
  createdAt: string | null | undefined,
  fecha: string | null | undefined
): string {
  const raw = createdAt?.trim() || fecha?.trim();
  if (!raw) return "—";
  const d = raw.slice(0, 10);
  if (d.length === 10 && d[4] === "-" && d[7] === "-") {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }
  try {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) {
      const day = String(dt.getDate()).padStart(2, "0");
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const y = dt.getFullYear();
      return `${day}/${m}/${y}`;
    }
  } catch {
    /* fallthrough */
  }
  return raw;
}

function totalFromItems(rows: ItemAgg[], presupuestoId: string): number {
  let t = 0;
  for (const r of rows) {
    if (r.presupuesto_id !== presupuestoId) continue;
    const q = Number(r.cantidad) || 0;
    const pm = Number(r.precio_material_congelado) || 0;
    const pmo = Number(r.precio_mo_congelada) || 0;
    t += q * (pm + pmo);
  }
  return t;
}

const CONFIRM_ONE =
  "¿Estás seguro de eliminar este presupuesto para siempre? Esta acción no se puede deshacer.";

function bulkConfirmMessage(n: number): string {
  return `¿Estás seguro de eliminar los ${n} presupuestos seleccionados para siempre?`;
}

const checkboxCls =
  "h-4 w-4 shrink-0 cursor-pointer rounded-none border-2 border-ravn-line bg-ravn-surface text-ravn-fg focus:ring-1 focus:ring-ravn-fg";

export function HistorialScreen() {
  const [rows, setRows] = useState<PresupuestoHistorialRow[]>([]);
  const [propuestaPrefs, setPropuestaPrefs] = useState<
    Record<string, PropuestaPrefV1 | null>
  >({});
  const [items, setItems] = useState<ItemAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [updatingAprobadoId, setUpdatingAprobadoId] = useState<string | null>(
    null
  );
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [obraIdPorPresupuestoId, setObraIdPorPresupuestoId] = useState<
    Map<string, string>
  >(() => new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const queries = [
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_cliente, fecha, created_at, numero_correlativo, moneda, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_cliente, fecha, created_at, numero_correlativo, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_cliente, fecha, numero_correlativo, moneda, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("fecha", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_cliente, fecha, numero_correlativo, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("fecha", { ascending: false }),
      ] as const;

      let rawData: unknown[] | null = null;
      let lastMsg: string | null = null;

      for (const run of queries) {
        const res = await run();
        if (!res.error && res.data) {
          rawData = res.data;
          break;
        }
        if (res.error) lastMsg = res.error.message;
      }

      if (!rawData) {
        setError(
          lastMsg ??
            "No se pudo cargar el historial. Verificá la columna pdf_generado en Supabase."
        );
        setLoading(false);
        return;
      }

      const rawList = rawData as Record<string, unknown>[];
      const prefs: Record<string, PropuestaPrefV1 | null> = {};
      for (const row of rawList) {
        const id = String(row.id);
        prefs[id] = parsePropuestaPrefJsonDesdeMismaFila(
          row.propuesta_comercial_pref,
          id
        );
      }
      setPropuestaPrefs(prefs);

      const presRows: PresupuestoHistorialRow[] = rawList.map((row) => ({
        id: String(row.id),
        nombre_cliente:
          row.nombre_cliente != null ? String(row.nombre_cliente) : null,
        fecha: row.fecha != null ? String(row.fecha) : null,
        created_at: row.created_at != null ? String(row.created_at) : null,
        numero_correlativo:
          row.numero_correlativo != null
            ? Number(row.numero_correlativo)
            : null,
        moneda:
          row.moneda === "USD" || row.moneda === "ARS"
            ? row.moneda
            : null,
        presupuesto_aprobado: Boolean(row.presupuesto_aprobado),
      }));

      setRows(presRows);
      setSelected(new Set());

      const ids = presRows.map((p) => p.id);
      if (ids.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const { data: itemRows, error: errI } = await supabase
        .from("presupuestos_items")
        .select(
          "presupuesto_id, cantidad, precio_material_congelado, precio_mo_congelada"
        )
        .in("presupuesto_id", ids);

      if (errI) {
        setError(errI.message);
        setItems([]);
      } else {
        setItems((itemRows ?? []) as ItemAgg[]);
      }

      const { data: obraRows, error: errObra } = await supabase
        .from("obras")
        .select("id, presupuesto_id")
        .in("presupuesto_id", ids);
      if (!errObra && obraRows) {
        const m = new Map<string, string>();
        for (const r of obraRows as { id: string; presupuesto_id: string }[]) {
          m.set(r.presupuesto_id, r.id);
        }
        setObraIdPorPresupuestoId(m);
      } else {
        setObraIdPorPresupuestoId(new Map());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const eliminarUno = useCallback(async (id: string) => {
    if (!window.confirm(CONFIRM_ONE)) return;

    setDeletingId(id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: eItems } = await supabase
        .from("presupuestos_items")
        .delete()
        .eq("presupuesto_id", id);
      if (eItems) {
        setError(eItems.message);
        setDeletingId(null);
        return;
      }
      const { error: ePres } = await supabase
        .from("presupuestos")
        .delete()
        .eq("id", id);
      if (ePres) {
        setError(ePres.message);
        setDeletingId(null);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
      setItems((prev) => prev.filter((r) => r.presupuesto_id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar.");
    } finally {
      setDeletingId(null);
    }
  }, []);

  const eliminarSeleccionados = useCallback(async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(bulkConfirmMessage(ids.length))) return;

    setBulkDeleting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: eItems } = await supabase
        .from("presupuestos_items")
        .delete()
        .in("presupuesto_id", ids);
      if (eItems) {
        setError(eItems.message);
        setBulkDeleting(false);
        return;
      }
      const { error: ePres } = await supabase
        .from("presupuestos")
        .delete()
        .in("id", ids);
      if (ePres) {
        setError(ePres.message);
        setBulkDeleting(false);
        return;
      }
      const idSet = new Set(ids);
      setRows((prev) => prev.filter((r) => !idSet.has(r.id)));
      setItems((prev) => prev.filter((r) => !idSet.has(r.presupuesto_id)));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar.");
    } finally {
      setBulkDeleting(false);
    }
  }, [selected]);

  const setPresupuestoAprobado = useCallback(
    async (id: string, checked: boolean) => {
      setUpdatingAprobadoId(id);
      setError(null);
      try {
        const supabase = createClient();
        const { error: err } = await supabase
          .from("presupuestos")
          .update({ presupuesto_aprobado: checked })
          .eq("id", id);
        if (err) {
          setError(err.message);
          return;
        }
        setRows((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, presupuesto_aprobado: checked } : r
          )
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo actualizar el estado."
        );
      } finally {
        setUpdatingAprobadoId(null);
      }
    },
    []
  );

  const totalArsMostradoPorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) {
      const pref = propuestaPrefs[p.id] ?? null;
      if (pref) {
        m.set(p.id, Math.round(importeArsParaPropuesta(pref)));
      } else {
        m.set(p.id, Math.round(totalFromItems(items, p.id)));
      }
    }
    return m;
  }, [rows, items, propuestaPrefs]);

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(rows.map((r) => r.id)));
    } else {
      setSelected(new Set());
    }
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectedCount = selected.size;

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) {
      el.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <div className="relative min-h-screen bg-ravn-surface px-8 pb-32 pr-20 pt-16 text-ravn-fg">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
          Historial de presupuestos
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
          Solo presupuestos con PDF generado. Seleccioná varios para eliminar en
          lote.           La aprobación se hace desde{" "}
          <span className="text-ravn-fg">Aprobar y planificar cashflow</span>{" "}
          (revisión + ítems). Los aprobados aparecen en{" "}
          <Link
            href="/control-gastos"
            className="text-ravn-fg underline underline-offset-2"
          >
            Control de gastos
          </Link>
          .
        </p>
        <p className="mt-2 max-w-2xl text-xs text-ravn-muted">
          El total en{" "}
          <span className="text-ravn-fg">ARS</span> es el importe de la
          propuesta guardado desde Rentabilidad / constructor (si existe); si
          no, la suma de ítems. Si el PDF fue en USD, debajo se indica el monto
          en dólares de la propuesta.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex w-full max-w-md items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3.5 font-raleway text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg sm:w-auto"
        >
          Volver al inicio
        </Link>

        {loading ? (
          <p className="mt-12 text-sm font-light text-ravn-muted">
            Cargando historial…
          </p>
        ) : error ? (
          <p className="mt-12 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-12 text-sm font-light text-ravn-muted">
            No hay presupuestos finalizados (PDF generado) registrados.
          </p>
        ) : (
          <>
            <div
              className="mt-12 border border-ravn-line bg-ravn-surface"
              role="table"
              aria-label="Historial de presupuestos"
            >
              <div
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-ravn-line px-6 py-5 md:gap-8 md:px-8"
                role="row"
              >
                <div className="flex items-center gap-3" role="columnheader">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Seleccionar todos"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className={checkboxCls}
                  />
                  <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-ravn-muted sm:inline">
                    Todos
                  </span>
                </div>
                <div
                  className="text-[10px] font-bold uppercase tracking-[0.14em] text-ravn-muted"
                  role="columnheader"
                >
                  Presupuesto / Cliente
                </div>
                <div
                  className="text-right text-[10px] font-bold uppercase tracking-[0.14em] text-ravn-muted"
                  role="columnheader"
                >
                  Total (ARS)
                </div>
                <div className="w-10" aria-hidden />
              </div>

              <ul className="flex flex-col">
                {rows.map((p) => {
                  const correlativo = p.numero_correlativo;
                  const numeroLabel =
                    correlativo != null && Number.isFinite(Number(correlativo))
                      ? formatNumeroComercialHumano("P1", Number(correlativo))
                      : "—";
                  const pref = propuestaPrefs[p.id] ?? null;
                  const totalArs = totalArsMostradoPorId.get(p.id) ?? 0;
                  const totalFmt = formatTotalDisplay(totalArs, "ARS");
                  const pdfEnUsd =
                    p.moneda === "USD" || pref?.moneda === "USD";
                  const totalUsdPropuesta =
                    pref?.moneda === "USD"
                      ? formatTotalDisplay(
                          importeMostradoEnteroEnMoneda(pref, "USD"),
                          "USD"
                        )
                      : null;
                  const busy = deletingId === p.id;
                  const isSel = selected.has(p.id);

                  return (
                    <li
                      key={p.id}
                      role="row"
                      className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-ravn-line px-6 py-6 last:border-b-0 md:gap-8 md:px-8 md:py-7"
                    >
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${numeroLabel}`}
                          checked={isSel}
                          onChange={(e) => toggleOne(p.id, e.target.checked)}
                          className={checkboxCls}
                        />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/propuesta/${encodeURIComponent(p.id)}`}
                          className="inline-block font-raleway text-base font-semibold uppercase tracking-wide text-ravn-accent transition-opacity hover:opacity-80 md:text-lg"
                        >
                          {numeroLabel}
                        </Link>
                        <p className="mt-2 text-sm font-light leading-relaxed text-ravn-fg md:text-base">
                          <span className="font-normal">
                            {p.nombre_cliente?.trim() || "—"}
                          </span>
                          <span className="text-ravn-muted"> · </span>
                          <span className="text-ravn-muted">
                            {formatFechaCreacion(p.created_at, p.fecha)}
                          </span>
                        </p>
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          <Link
                            href={`/rentabilidad?id=${encodeURIComponent(p.id)}`}
                            className="text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 transition-colors hover:text-ravn-fg hover:underline"
                          >
                            Rentabilidad y costos
                          </Link>
                          {p.presupuesto_aprobado ? (
                            <Link
                              href={`/obras/${encodeURIComponent(p.id)}/gastos`}
                              className="text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 transition-colors hover:text-ravn-fg hover:underline"
                            >
                              Gastos de obra
                            </Link>
                          ) : null}
                          {p.presupuesto_aprobado &&
                          obraIdPorPresupuestoId.has(p.id) ? (
                            <Link
                              href={`/cashflow/obra/${encodeURIComponent(obraIdPorPresupuestoId.get(p.id)!)}`}
                              className="text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 transition-colors hover:text-ravn-fg hover:underline"
                            >
                              Cashflow
                            </Link>
                          ) : null}
                        </p>
                        {p.presupuesto_aprobado ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                            <span className="text-xs font-medium uppercase tracking-wider text-ravn-fg">
                              Presupuesto aprobado
                            </span>
                            <button
                              type="button"
                              disabled={updatingAprobadoId === p.id}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    "¿Quitar la aprobación? No se borran los ítems de cashflow ya creados."
                                  )
                                )
                                  return;
                                void setPresupuestoAprobado(p.id, false);
                              }}
                              className="w-fit text-left text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 transition-colors hover:text-ravn-fg hover:underline disabled:opacity-50"
                            >
                              Quitar aprobación
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-col gap-2">
                            <Link
                              href={`/cashflow/planificar/${encodeURIComponent(p.id)}`}
                              className="inline-flex w-full max-w-xs items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 sm:w-auto"
                            >
                              Aprobar y planificar cashflow
                            </Link>
                            {(totalArsMostradoPorId.get(p.id) ?? 0) <= 0 ? (
                              <p className="max-w-sm text-xs text-ravn-muted">
                                Sin total en ARS en la nube: abrí Rentabilidad y
                                guardá el importe para que el plan cuadre con la
                                propuesta.
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-medium tabular-nums text-ravn-fg md:text-xl">
                          {totalFmt}
                        </p>
                        {totalUsdPropuesta ? (
                          <p className="mt-1 text-[10px] text-ravn-muted">
                            Propuesta: {totalUsdPropuesta}
                          </p>
                        ) : pdfEnUsd ? (
                          <p className="mt-1 text-[10px] text-ravn-muted">
                            PDF en USD
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label="Eliminar presupuesto"
                        disabled={busy || bulkDeleting}
                        onClick={() => void eliminarUno(p.id)}
                        className="justify-self-end rounded-none border border-ravn-line p-2.5 text-ravn-muted transition-colors hover:border-ravn-fg hover:text-ravn-fg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </div>

      {selectedCount > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center border-t border-ravn-line bg-ravn-surface/95 px-4 py-4 backdrop-blur-sm pr-20">
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={() => void eliminarSeleccionados()}
            className="inline-flex items-center gap-3 rounded-none border-2 border-ravn-accent bg-ravn-accent px-8 py-4 text-sm font-medium uppercase tracking-wider text-ravn-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" strokeWidth={1.75} />
            Eliminar seleccionados ({selectedCount})
          </button>
        </div>
      ) : null}

    </div>
  );
}
