"use client";

import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { createClient } from "@/lib/supabase/client";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { formatNumeroComercialHumano } from "@/lib/presupuesto-numero-comercial";
import {
  importeArsParaPropuesta,
  importeMostradoEnteroEnMoneda,
  parsePropuestaPrefJsonDesdeMismaFila,
  type PropuestaPrefV1,
} from "@/lib/ravn-propuesta-pref";
import { DOCUMENTOS_OBRA } from "@/lib/documentos-obra";
type MonedaRow = "ARS" | "USD";

type PresupuestoHistorialRow = {
  id: string;
  /** Título propio para distinguir obras (Gastos, Cashflow, listados). */
  nombre_obra: string | null;
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
  "h-4 w-4 shrink-0 cursor-pointer rounded-none accent-cdm-taupe";

/** Input del cockpit: transparente, borde inferior que se enciende taupe al focus. */
const tituloObraInputCls =
  "mt-2 w-full max-w-xl rounded-none border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-taupe focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(200,180,154,0.6)] disabled:opacity-50";

/** Chip de estado con punto de color (radius permitido: chips). */
function ChipEstado({
  tono,
  children,
}: {
  tono: "verde" | "ambar" | "taupe";
  children: React.ReactNode;
}) {
  const estilos = {
    verde: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    ambar: "border-amber-300/30 bg-amber-300/10 text-amber-200",
    taupe: "border-cdm-taupe/30 bg-cdm-taupe/10 text-cdm-taupe",
  } as const;
  const punto = {
    verde: "bg-emerald-400",
    ambar: "bg-amber-300",
    taupe: "bg-cdm-taupe",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${estilos[tono]}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${punto[tono]}`} />
      {children}
    </span>
  );
}

function TituloObraHistorialEditor({
  presupuestoId,
  nombreObraInicial,
  onSaved,
  onError,
}: {
  presupuestoId: string;
  nombreObraInicial: string | null;
  onSaved: (id: string, value: string | null) => void;
  onError: (msg: string) => void;
}) {
  const [value, setValue] = useState(nombreObraInicial ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(nombreObraInicial ?? "");
  }, [presupuestoId, nombreObraInicial]);

  async function commit() {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : trimmed;
    const prev =
      nombreObraInicial != null && String(nombreObraInicial).trim() !== ""
        ? String(nombreObraInicial).trim()
        : null;
    if (next === prev) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("presupuestos")
        .update({ nombre_obra: next })
        .eq("id", presupuestoId);
      if (error) throw new Error(error.message);
      onSaved(presupuestoId, next);
    } catch (e) {
      setValue(nombreObraInicial ?? "");
      onError(e instanceof Error ? e.message : "No se pudo guardar el título.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <label
        htmlFor={`titulo-obra-${presupuestoId}`}
        className="sr-only"
      >
        Título de obra
      </label>
      <input
        id={`titulo-obra-${presupuestoId}`}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        disabled={saving}
        placeholder="Título de obra (opcional; se usa en Gastos y Cashflow)"
        className={tituloObraInputCls}
        autoComplete="off"
      />
      {saving ? (
        <p className="mt-1 text-[10px] text-cdm-muted">Guardando…</p>
      ) : null}
    </div>
  );
}

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
  const [busqueda, setBusqueda] = useState("");

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
              "id, nombre_obra, nombre_cliente, fecha, created_at, numero_correlativo, moneda, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_obra, nombre_cliente, fecha, created_at, numero_correlativo, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_obra, nombre_cliente, fecha, numero_correlativo, moneda, presupuesto_aprobado, propuesta_comercial_pref"
            )
            .eq("pdf_generado", true)
            .order("fecha", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_obra, nombre_cliente, fecha, numero_correlativo, presupuesto_aprobado, propuesta_comercial_pref"
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
        nombre_obra:
          row.nombre_obra != null ? String(row.nombre_obra) : null,
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

  const actualizarNombreObraLocal = useCallback(
    (id: string, value: string | null) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, nombre_obra: value } : r
        )
      );
    },
    []
  );

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

  /** Filtro de búsqueda (solo presentación): número, cliente o título de obra. */
  const rowsFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) => {
      const numero =
        p.numero_correlativo != null &&
        Number.isFinite(Number(p.numero_correlativo))
          ? formatNumeroComercialHumano(
              "P1",
              Number(p.numero_correlativo)
            ).toLowerCase()
          : "";
      return (
        (p.nombre_cliente ?? "").toLowerCase().includes(q) ||
        (p.nombre_obra ?? "").toLowerCase().includes(q) ||
        numero.includes(q)
      );
    });
  }, [rows, busqueda]);

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
      setSelected(new Set(rowsFiltradas.map((r) => r.id)));
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
    rowsFiltradas.length > 0 &&
    rowsFiltradas.every((r) => selected.has(r.id));
  const someSelected = rowsFiltradas.some((r) => selected.has(r.id));

  useEffect(() => {
    const el = selectAllRef.current;
    if (el) {
      el.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <div className="font-grotesk relative min-h-screen bg-cdm-bg px-8 pb-32 pr-20 pt-14 text-cdm-fg">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="relative pb-3">
          {/* Línea de horizonte detrás del header (iteración 3). */}
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
            <span
              aria-hidden
              className="h-[5px] w-[5px] bg-cdm-taupe shadow-[0_0_8px_rgba(200,180,154,0.9)]"
            />
            Historial de presupuestos
          </h1>
        </div>
        <p className="mt-4 max-w-2xl text-sm text-cdm-muted">
          Solo presupuestos con PDF generado. Seleccioná varios para eliminar en
          lote.           La aprobación se hace desde{" "}
          <span className="text-cdm-fg">Aprobar y planificar cashflow</span>{" "}
          (revisión + ítems). Los aprobados aparecen en{" "}
          <Link
            href="/control-gastos"
            className="text-cdm-fg underline underline-offset-2 transition-colors hover:text-cdm-taupe"
          >
            Control de gastos
          </Link>
          .
        </p>
        <p className="mt-2 max-w-2xl text-xs text-cdm-muted">
          El total en{" "}
          <span className="text-cdm-fg">ARS</span> es el importe de la
          propuesta guardado desde Rentabilidad / constructor (si existe); si
          no, la suma de ítems. Si el PDF fue en USD, debajo se indica el monto
          en dólares de la propuesta.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex w-fit items-center justify-center rounded-none border border-cdm-line bg-transparent px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-cdm-muted transition-colors hover:border-cdm-taupe/50 hover:text-cdm-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-taupe"
        >
          Volver al inicio
        </Link>

        {loading ? (
          <p className="mt-12 text-sm font-light text-cdm-muted">
            Cargando historial…
          </p>
        ) : error ? (
          <p className="mt-12 text-sm text-red-400">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-12 text-sm font-light text-cdm-muted">
            No hay presupuestos finalizados (PDF generado) registrados.
          </p>
        ) : (
          <>
            {/* Toolbar: seleccionar todos + búsqueda con el input del cockpit. */}
            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex w-fit cursor-pointer items-center gap-3">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  aria-label="Seleccionar todos"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className={checkboxCls}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cdm-muted">
                  Todos
                </span>
              </label>
              <div className="relative w-full sm:max-w-xs">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-cdm-muted"
                  strokeWidth={1.75}
                />
                <input
                  type="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por número, cliente u obra"
                  aria-label="Buscar presupuestos"
                  className="w-full rounded-none border-0 border-b border-cdm-line bg-transparent py-2 pl-7 pr-1 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-taupe focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(200,180,154,0.6)]"
                />
              </div>
            </div>

            {rowsFiltradas.length === 0 ? (
              <p className="mt-10 text-sm font-light text-cdm-muted">
                Sin resultados para «{busqueda.trim()}».
              </p>
            ) : null}

            <ul
              className="mt-6 flex flex-col gap-3"
              aria-label="Historial de presupuestos"
            >
                {rowsFiltradas.map((p) => {
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
                    <motion.li
                      key={p.id}
                      whileHover={{ y: -2 }}
                      transition={{ type: "spring", stiffness: 350, damping: 28 }}
                      className="cdm-glass grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-6 py-6 md:gap-8 md:px-8 md:py-7"
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
                        <div className="flex flex-wrap items-center gap-3">
                          <Link
                            href={`/propuesta/${encodeURIComponent(p.id)}`}
                            className="font-raleway inline-block text-base font-bold uppercase tracking-wide text-cdm-fg transition-colors hover:text-cdm-taupe md:text-lg"
                          >
                            {numeroLabel}
                          </Link>
                          {p.presupuesto_aprobado ? (
                            <ChipEstado tono="verde">Aprobado</ChipEstado>
                          ) : (
                            <ChipEstado tono="ambar">Pendiente</ChipEstado>
                          )}
                        </div>
                        <TituloObraHistorialEditor
                          presupuestoId={p.id}
                          nombreObraInicial={p.nombre_obra}
                          onSaved={actualizarNombreObraLocal}
                          onError={(msg) => setError(msg)}
                        />
                        <p className="mt-2 text-sm font-light leading-relaxed text-cdm-fg md:text-base">
                          {p.nombre_obra?.trim() ? (
                            <>
                              <span className="text-[10px] font-medium uppercase tracking-wider text-cdm-muted">
                                Cliente{" "}
                              </span>
                              <span className="font-normal">
                                {p.nombre_cliente?.trim() || "—"}
                              </span>
                            </>
                          ) : (
                            <span className="font-normal">
                              {p.nombre_cliente?.trim() || "—"}
                            </span>
                          )}
                          <span className="text-cdm-muted"> · </span>
                          <span className="text-cdm-muted">
                            {formatFechaCreacion(p.created_at, p.fecha)}
                          </span>
                        </p>
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                          <Link
                            href={`/rentabilidad?id=${encodeURIComponent(p.id)}`}
                            className="text-xs font-medium uppercase tracking-wider text-cdm-muted underline-offset-2 transition-colors hover:text-cdm-taupe hover:underline"
                          >
                            Rentabilidad y costos
                          </Link>
                          {p.presupuesto_aprobado ? (
                            <>
                              <Link
                                href={`/obras/${encodeURIComponent(p.id)}/gastos`}
                                className="text-xs font-medium uppercase tracking-wider text-cdm-muted underline-offset-2 transition-colors hover:text-cdm-taupe hover:underline"
                              >
                                Gastos de obra
                              </Link>
                              <Link
                                href={`/remito/${encodeURIComponent(p.id)}`}
                                className="text-xs font-medium uppercase tracking-wider text-cdm-muted underline-offset-2 transition-colors hover:text-cdm-taupe hover:underline"
                              >
                                Generar remito
                              </Link>
                            </>
                          ) : null}
                          {p.presupuesto_aprobado &&
                          obraIdPorPresupuestoId.has(p.id) ? (
                            <Link
                              href={`/cashflow/obra/${encodeURIComponent(obraIdPorPresupuestoId.get(p.id)!)}`}
                              className="text-xs font-medium uppercase tracking-wider text-cdm-muted underline-offset-2 transition-colors hover:text-cdm-taupe hover:underline"
                            >
                              Cashflow
                            </Link>
                          ) : null}
                          {(DOCUMENTOS_OBRA[p.id] ?? []).map((doc) => (
                            <a
                              key={doc.url}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium uppercase tracking-wider text-cdm-taupe/80 underline-offset-2 transition-colors hover:text-cdm-taupe hover:underline"
                            >
                              {doc.label}
                            </a>
                          ))}
                        </p>
                        {p.presupuesto_aprobado ? (
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
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
                              className="w-fit text-left text-xs font-medium uppercase tracking-wider text-cdm-muted underline-offset-2 transition-colors hover:text-cdm-fg hover:underline disabled:opacity-50"
                            >
                              Quitar aprobación
                            </button>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-col gap-2">
                            <Link
                              href={`/cashflow/planificar/${encodeURIComponent(p.id)}`}
                              className="inline-flex w-full max-w-xs items-center justify-center rounded-none border border-cdm-fg bg-cdm-fg px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-cdm-bg transition-shadow duration-300 hover:shadow-[0_0_28px_-4px_rgba(200,180,154,0.5)] sm:w-auto"
                            >
                              Aprobar y planificar cashflow
                            </Link>
                            {(totalArsMostradoPorId.get(p.id) ?? 0) <= 0 ? (
                              <p className="max-w-sm text-xs text-cdm-muted">
                                Sin total en ARS en la nube: abrí Rentabilidad y
                                guardá el importe para que el plan cuadre con la
                                propuesta.
                              </p>
                            ) : null}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-cdm-muted">
                          Total ARS
                        </p>
                        <p className="font-raleway mt-1 text-xl font-bold tabular-nums text-cdm-fg md:text-2xl">
                          {totalFmt}
                        </p>
                        {totalUsdPropuesta ? (
                          <p className="mt-1 text-[10px] tabular-nums text-cdm-muted">
                            Propuesta: {totalUsdPropuesta}
                          </p>
                        ) : pdfEnUsd ? (
                          <p className="mt-1 text-[10px] text-cdm-muted">
                            PDF en USD
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label="Eliminar presupuesto"
                        disabled={busy || bulkDeleting}
                        onClick={() => void eliminarUno(p.id)}
                        className="justify-self-end rounded-none border border-cdm-line p-2.5 text-cdm-muted transition-colors hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
          </>
        )}
      </div>

      {selectedCount > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-50 flex justify-center border-t border-cdm-line bg-cdm-bg/85 px-4 py-4 pr-20 backdrop-blur-xl"
        >
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={() => void eliminarSeleccionados()}
            className="inline-flex items-center gap-3 rounded-none border border-red-400/50 bg-red-500/10 px-8 py-4 text-sm font-semibold uppercase tracking-wider text-red-200 transition-all duration-200 hover:bg-red-500/20 hover:shadow-[0_0_28px_-6px_rgba(248,113,113,0.45)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" strokeWidth={1.75} />
            Eliminar seleccionados ({selectedCount})
          </button>
        </motion.div>
      ) : null}

    </div>
  );
}
