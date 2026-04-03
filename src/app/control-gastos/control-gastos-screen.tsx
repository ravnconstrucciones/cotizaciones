"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { formatNumeroComercialHumano } from "@/lib/presupuesto-numero-comercial";

type MonedaRow = "ARS" | "USD";

type PresupuestoControlRow = {
  id: string;
  nombre_cliente: string | null;
  fecha: string | null;
  created_at: string | null;
  numero_correlativo: number | null;
  moneda: MonedaRow | null;
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

export function ControlGastosScreen() {
  const [rows, setRows] = useState<PresupuestoControlRow[]>([]);
  const [items, setItems] = useState<ItemAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              "id, nombre_cliente, fecha, created_at, numero_correlativo, moneda"
            )
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select("id, nombre_cliente, fecha, created_at, numero_correlativo")
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select("id, nombre_cliente, fecha, numero_correlativo, moneda")
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
            .order("fecha", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select("id, nombre_cliente, fecha, numero_correlativo")
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
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
            "No se pudo cargar. Verificá las columnas pdf_generado y presupuesto_aprobado en Supabase."
        );
        setLoading(false);
        return;
      }

      const presRows: PresupuestoControlRow[] = (
        rawData as Record<string, unknown>[]
      ).map((row) => ({
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
      }));

      setRows(presRows);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPorId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of rows) {
      m.set(p.id, totalFromItems(items, p.id));
    }
    return m;
  }, [rows, items]);

  return (
    <div className="relative min-h-screen bg-ravn-surface px-8 pb-32 pr-20 pt-16 text-ravn-fg">
      <div className="mx-auto max-w-4xl">
        <h1 className="font-raleway text-2xl font-medium uppercase tracking-tight md:text-3xl">
          Control de gastos
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ravn-muted">
          Presupuestos con PDF generado y marcados como{" "}
          <span className="text-ravn-fg">aprobados</span> en el historial. Desde
          acá entrás a cargar gastos de obra.
        </p>
        <p className="mt-3 text-xs text-ravn-muted">
          <Link
            href="/historial"
            className="font-medium uppercase tracking-wider text-ravn-fg underline-offset-2 hover:underline"
          >
            Ir al historial
          </Link>{" "}
          para marcar &quot;Presupuesto aprobado&quot;.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex w-full max-w-md items-center justify-center rounded-none border-2 border-ravn-line bg-ravn-surface px-6 py-3.5 font-raleway text-sm font-medium uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ravn-fg sm:w-auto"
        >
          Volver al inicio
        </Link>

        {loading ? (
          <p className="mt-12 text-sm font-light text-ravn-muted">
            Cargando…
          </p>
        ) : error ? (
          <p className="mt-12 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-12 text-sm font-light text-ravn-muted">
            No hay presupuestos aprobados para control de gastos. Abrí el{" "}
            <Link
              href="/historial"
              className="text-ravn-fg underline underline-offset-2"
            >
              historial
            </Link>
            , tildá &quot;Presupuesto aprobado&quot; en el que corresponda y
            volvé acá.
          </p>
        ) : (
          <ul
            className="mt-12 border border-ravn-line bg-ravn-surface"
            aria-label="Presupuestos aprobados"
          >
            {rows.map((p) => {
              const correlativo = p.numero_correlativo;
              const numeroLabel =
                correlativo != null && Number.isFinite(Number(correlativo))
                  ? formatNumeroComercialHumano("P1", Number(correlativo))
                  : "—";
              const total = totalPorId.get(p.id) ?? 0;
              const totalFmt = formatTotalDisplay(total, "ARS");
              const pdfEnUsd = p.moneda === "USD";

              return (
                <li
                  key={p.id}
                  className="border-b border-ravn-line px-6 py-6 last:border-b-0 md:px-8 md:py-7"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-raleway text-base font-semibold uppercase tracking-wide text-ravn-accent md:text-lg">
                        {numeroLabel}
                      </p>
                      <p className="mt-2 text-sm font-light text-ravn-fg md:text-base">
                        <span className="font-normal">
                          {p.nombre_cliente?.trim() || "—"}
                        </span>
                        <span className="text-ravn-muted"> · </span>
                        <span className="text-ravn-muted">
                          {formatFechaCreacion(p.created_at, p.fecha)}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
                      <div className="text-right">
                        <p className="text-lg font-medium tabular-nums text-ravn-fg md:text-xl">
                          {totalFmt}
                        </p>
                        {pdfEnUsd ? (
                          <p className="mt-1 text-[10px] text-ravn-muted">
                            PDF en USD
                          </p>
                        ) : null}
                      </div>
                      <Link
                        href={`/obras/${encodeURIComponent(p.id)}/gastos`}
                        className="inline-flex items-center justify-center rounded-none border-2 border-ravn-accent bg-ravn-accent px-6 py-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-ravn-accent-contrast transition-opacity hover:opacity-90"
                      >
                        Ingresar gastos
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
