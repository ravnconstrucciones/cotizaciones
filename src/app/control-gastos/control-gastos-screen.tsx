"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  formatMoney,
  parseFormattedNumber,
  roundArs2,
} from "@/lib/format-currency";
import { formatTotalDisplay } from "@/lib/format-total-display";
import { formatNumeroComercialHumano } from "@/lib/presupuesto-numero-comercial";
import {
  importeArsParaPropuesta,
  importeMostradoEnteroEnMoneda,
  parsePropuestaPrefJsonDesdeMismaFila,
  type PropuestaPrefV1,
} from "@/lib/ravn-propuesta-pref";
import { parseRentabilidadInputsJson } from "@/lib/ravn-rentabilidad-inputs";

type MonedaRow = "ARS" | "USD";

type PresupuestoControlRow = {
  id: string;
  nombre_obra: string | null;
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

/** Costo directo (mat + M.O.) como en Rentabilidad: JSON persistido o, si no hay, suma de ítems. */
function costoDirectoPrevisto(
  presupuestoId: string,
  rentabilidadInputs: unknown,
  items: ItemAgg[]
): number {
  const ri = parseRentabilidadInputsJson(rentabilidadInputs, presupuestoId);
  if (ri) {
    const cm = roundArs2(parseFormattedNumber(ri.costoMaterialStr));
    const cmo = roundArs2(parseFormattedNumber(ri.costoMoStr));
    return roundArs2(cm + cmo);
  }
  return roundArs2(totalFromItems(items, presupuestoId));
}

function contingenciaMontoPrevista(
  presupuestoId: string,
  rentabilidadInputs: unknown,
  costoDirecto: number
): number {
  const ri = parseRentabilidadInputsJson(rentabilidadInputs, presupuestoId);
  if (!ri) return 0;
  const n = parseFormattedNumber(ri.contingenciaPctStr.replace("%", ""));
  const pct = Number.isFinite(n) ? Math.max(0, n) : 0;
  return roundArs2(costoDirecto * (pct / 100));
}

function costosInternosYCargosDesdeRentab(
  presupuestoId: string,
  rentabilidadInputs: unknown
): { costosInternos: number; cargosAdicionales: number } {
  const ri = parseRentabilidadInputsJson(rentabilidadInputs, presupuestoId);
  if (!ri) return { costosInternos: 0, cargosAdicionales: 0 };
  return {
    costosInternos: roundArs2(parseFormattedNumber(ri.costosInternosStr)),
    cargosAdicionales: roundArs2(parseFormattedNumber(ri.cargosAdicionalesStr)),
  };
}

/** Costo de ejecución previsto sin cupo de contingencia (lo que no es margen, salvo imprevistos). */
function gastosPrevistosEjecucionArs(
  costoDirecto: number,
  costosInternos: number,
  cargosAdicionales: number
): number {
  return roundArs2(costoDirecto + costosInternos + cargosAdicionales);
}

/**
 * Cupo de imprevistos (contingencia %) que queda: el exceso de gastos ejecutados
 * sobre costo directo + costos internos + cargos adicionales consume ese cupo.
 */
function restanteImprevistosArs(
  contingencia: number,
  gastosEjecutados: number,
  costoDirecto: number,
  costosInternos: number,
  cargosAdicionales: number
): number {
  const planPrevio = gastosPrevistosEjecucionArs(
    costoDirecto,
    costosInternos,
    cargosAdicionales
  );
  const sobrePlan = Math.max(0, roundArs2(gastosEjecutados - planPrevio));
  return Math.max(0, roundArs2(contingencia - sobrePlan));
}

/** Gastos ejecutados (ARS) respecto del total cotizado al cliente (ARS). */
function BarraGastoSobreTotalAlCliente({
  gastadoArs,
  totalClienteArs,
}: {
  gastadoArs: number;
  totalClienteArs: number;
}) {
  const base = Math.max(0, totalClienteArs);
  const g = Math.max(0, gastadoArs);
  const pct = base > 0 ? Math.min(100, (g / base) * 100) : 0;
  const over = base > 0 && g > base;
  return (
    <div
      className="mt-2 w-full max-w-[20rem] overflow-hidden rounded-full border border-ravn-line bg-ravn-subtle py-1 pl-1 pr-1.5 sm:ml-auto"
      role="img"
      aria-label={`Gastos sobre total al cliente: ${Math.round(pct)} por ciento`}
    >
      <div className="h-2.5 overflow-hidden rounded-full bg-ravn-surface/70 dark:bg-ravn-surface/40">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            over ? "bg-[#6b1c1c] dark:bg-[#8b2e2e]" : "bg-ravn-accent"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Ganancia neta (total al cliente menos gastos ejecutados), en la moneda de la propuesta. */
function formatoRestanteFrenteAlCliente(
  pref: PropuestaPrefV1,
  restanteArs: number
): string {
  const moneda = pref.moneda === "USD" ? "USD" : "ARS";
  if (moneda === "USD") {
    const c = pref.cotizacionVentaArsPorUsd;
    if (Number.isFinite(c) && c > 0) {
      return formatTotalDisplay(Math.round(restanteArs / c), "USD");
    }
  }
  return formatTotalDisplay(Math.round(restanteArs), "ARS");
}

export function ControlGastosScreen() {
  const [rows, setRows] = useState<PresupuestoControlRow[]>([]);
  const [items, setItems] = useState<ItemAgg[]>([]);
  const [rentabilidadInputsById, setRentabilidadInputsById] = useState<
    Map<string, unknown>
  >(new Map());
  const [gastadoPorId, setGastadoPorId] = useState<Map<string, number>>(
    new Map()
  );
  const [propuestaPrefPorId, setPropuestaPrefPorId] = useState<
    Map<string, PropuestaPrefV1 | null>
  >(new Map());
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
              "id, nombre_obra, nombre_cliente, fecha, created_at, numero_correlativo, moneda"
            )
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_obra, nombre_cliente, fecha, created_at, numero_correlativo"
            )
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select(
              "id, nombre_obra, nombre_cliente, fecha, numero_correlativo, moneda"
            )
            .eq("pdf_generado", true)
            .eq("presupuesto_aprobado", true)
            .order("fecha", { ascending: false }),
        () =>
          supabase
            .from("presupuestos")
            .select("id, nombre_obra, nombre_cliente, fecha, numero_correlativo")
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
      }));

      setRows(presRows);

      const ids = presRows.map((p) => p.id);
      if (ids.length === 0) {
        setItems([]);
        setRentabilidadInputsById(new Map());
        setGastadoPorId(new Map());
        setPropuestaPrefPorId(new Map());
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
        setRentabilidadInputsById(new Map());
        setGastadoPorId(new Map());
        setPropuestaPrefPorId(new Map());
      } else {
        setItems((itemRows ?? []) as ItemAgg[]);

        const inputsMap = new Map<string, unknown>();
        const gastadoMap = new Map<string, number>();

        const prefMap = new Map<string, PropuestaPrefV1 | null>();

        const { data: insRows, error: errIns } = await supabase
          .from("presupuestos")
          .select("id, rentabilidad_inputs, propuesta_comercial_pref")
          .in("id", ids);

        if (!errIns && insRows) {
          for (const row of insRows as {
            id: unknown;
            rentabilidad_inputs?: unknown;
            propuesta_comercial_pref?: unknown;
          }[]) {
            const pid = String(row.id);
            inputsMap.set(pid, row.rentabilidad_inputs ?? null);
            prefMap.set(
              pid,
              parsePropuestaPrefJsonDesdeMismaFila(
                row.propuesta_comercial_pref,
                pid
              )
            );
          }
        }

        setPropuestaPrefPorId(prefMap);

        const { data: gastosRows, error: errG } = await supabase
          .from("presupuestos_gastos")
          .select("presupuesto_id, importe")
          .in("presupuesto_id", ids);

        if (!errG && gastosRows) {
          for (const row of gastosRows as {
            presupuesto_id: unknown;
            importe: unknown;
          }[]) {
            const pid = String(row.presupuesto_id);
            const imp = Number(row.importe) || 0;
            gastadoMap.set(pid, roundArs2((gastadoMap.get(pid) ?? 0) + imp));
          }
        }

        const { data: vinculosCf, error: errVin } = await supabase
          .from("presupuestos_gastos")
          .select("cashflow_item_id")
          .in("presupuesto_id", ids)
          .not("cashflow_item_id", "is", null);

        const cashflowIdsYaEnTablaGastos = new Set<string>();
        if (!errVin && vinculosCf) {
          for (const r of vinculosCf as { cashflow_item_id?: unknown }[]) {
            const cid = r.cashflow_item_id;
            if (cid != null && String(cid).trim() !== "") {
              cashflowIdsYaEnTablaGastos.add(String(cid));
            }
          }
        }

        const { data: obrasLinks, error: errOb } = await supabase
          .from("obras")
          .select("id, presupuesto_id")
          .in("presupuesto_id", ids);

        if (!errOb && obrasLinks?.length) {
          const presupuestoPorObra = new Map(
            obrasLinks.map((o) => [String(o.id), String(o.presupuesto_id)])
          );
          const obraIds = obrasLinks.map((o) => String(o.id));
          const { data: cfRows, error: errCf } = await supabase
            .from("cashflow_items")
            .select("id, obra_id, monto_real")
            .in("obra_id", obraIds)
            .eq("tipo", "egreso")
            .is("deleted_at", null)
            .not("monto_real", "is", null)
            .not("fecha_real", "is", null);

          if (!errCf && cfRows) {
            for (const row of cfRows as {
              id: unknown;
              obra_id: unknown;
              monto_real: unknown;
            }[]) {
              const cfid = String(row.id ?? "");
              if (cashflowIdsYaEnTablaGastos.has(cfid)) continue;
              const pid = presupuestoPorObra.get(String(row.obra_id));
              if (!pid) continue;
              const mr = Number(row.monto_real) || 0;
              gastadoMap.set(
                pid,
                roundArs2((gastadoMap.get(pid) ?? 0) + mr)
              );
            }
          }
        }

        setRentabilidadInputsById(inputsMap);
        setGastadoPorId(gastadoMap);
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

  const resumenGastosPorId = useMemo(() => {
    const m = new Map<
      string,
      {
        previstos: number;
        ejecutados: number;
        restanteImprevistos: number;
        contingenciaCalculada: number;
      }
    >();
    for (const p of rows) {
      const inputsRaw = rentabilidadInputsById.get(p.id);
      const cd = costoDirectoPrevisto(p.id, inputsRaw, items);
      const { costosInternos, cargosAdicionales } =
        costosInternosYCargosDesdeRentab(p.id, inputsRaw);
      const cont = contingenciaMontoPrevista(p.id, inputsRaw, cd);
      const ejecutado = gastadoPorId.get(p.id) ?? 0;
      m.set(p.id, {
        previstos: gastosPrevistosEjecucionArs(
          cd,
          costosInternos,
          cargosAdicionales
        ),
        ejecutados: ejecutado,
        restanteImprevistos: restanteImprevistosArs(
          cont,
          ejecutado,
          cd,
          costosInternos,
          cargosAdicionales
        ),
        contingenciaCalculada: cont,
      });
    }
    return m;
  }, [rows, items, rentabilidadInputsById, gastadoPorId]);

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
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ravn-muted">
          El total <span className="text-ravn-fg">ejecutado</span> suma los gastos
          cargados en el panel de obra y los{" "}
          <span className="text-ravn-fg">egresos de Caja</span> de esa obra con
          monto y fecha reales (misma lógica que el resumen de tesorería).
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
        <p className="mt-3 text-xs text-ravn-muted">
          <Link
            href="/gastos/nuevo"
            className="font-medium uppercase tracking-wider text-ravn-fg underline-offset-2 hover:underline"
          >
            Registrar gasto (elegir obra)
          </Link>
          : importe, descripción y comprobante en foto o audio.
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
              const pref = propuestaPrefPorId.get(p.id) ?? null;
              const totalClienteArs =
                pref != null ? importeArsParaPropuesta(pref) : 0;
              const monedaCliente: "ARS" | "USD" =
                pref?.moneda === "USD" ? "USD" : "ARS";
              const totalClienteFmt =
                pref != null
                  ? formatTotalDisplay(
                      importeMostradoEnteroEnMoneda(pref, monedaCliente),
                      monedaCliente
                    )
                  : null;
              const ejecutadoArs = resumenGastosPorId.get(p.id)?.ejecutados ?? 0;
              const restanteFrenteClienteArs =
                pref != null
                  ? roundArs2(totalClienteArs - ejecutadoArs)
                  : 0;
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
                          {p.nombre_obra?.trim() ||
                            p.nombre_cliente?.trim() ||
                            "—"}
                        </span>
                        <span className="text-ravn-muted"> · </span>
                        <span className="text-ravn-muted">
                          {formatFechaCreacion(p.created_at, p.fecha)}
                        </span>
                      </p>
                      {p.nombre_obra?.trim() ? (
                        <p className="mt-1 text-xs text-ravn-muted">
                          Cliente: {p.nombre_cliente?.trim() || "—"}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex w-full shrink-0 flex-col items-stretch gap-3 sm:max-w-md sm:items-end">
                      <div className="text-left sm:text-right">
                        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
                          Total al cliente
                        </p>
                        {totalClienteFmt != null ? (
                          <>
                            <p className="mt-0.5 text-lg font-medium tabular-nums text-ravn-fg md:text-xl">
                              {totalClienteFmt}
                            </p>
                            {totalClienteArs > 0 && pref != null ? (
                              <>
                                <BarraGastoSobreTotalAlCliente
                                  gastadoArs={ejecutadoArs}
                                  totalClienteArs={totalClienteArs}
                                />
                                <div className="mt-2 text-left sm:text-right">
                                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
                                    Ganancia neta
                                  </p>
                                  <p
                                    className={`mt-0.5 text-base font-semibold tabular-nums md:text-lg ${
                                      restanteFrenteClienteArs < 0
                                        ? "text-[#6b1c1c] dark:text-[#f87171]"
                                        : "text-ravn-fg"
                                    }`}
                                  >
                                    {formatoRestanteFrenteAlCliente(
                                      pref,
                                      restanteFrenteClienteArs
                                    )}
                                  </p>
                                  {restanteFrenteClienteArs < 0 ? (
                                    <p className="mt-1 max-w-[14rem] text-right text-[10px] font-normal normal-case leading-snug text-ravn-muted sm:ml-auto">
                                      Gastaste más que el total cotizado al
                                      cliente (en esta vista se comparan montos
                                      en pesos).
                                    </p>
                                  ) : null}
                                </div>
                              </>
                            ) : null}
                          </>
                        ) : (
                          <p className="mt-1 max-w-xs text-sm font-light leading-snug text-ravn-muted">
                            Sin total guardado: abrí{" "}
                            <Link
                              href={`/rentabilidad?id=${encodeURIComponent(p.id)}`}
                              className="text-ravn-fg underline underline-offset-2"
                            >
                              Rentabilidad
                            </Link>{" "}
                            y guardá el importe en la nube.
                          </p>
                        )}
                        {pdfEnUsd ? (
                          <p className="mt-1 text-[10px] text-ravn-muted">
                            PDF en USD
                          </p>
                        ) : null}
                      </div>
                      <dl className="w-full max-w-[18rem] space-y-1.5 text-right text-[11px] leading-snug text-ravn-muted sm:max-w-xs">
                        <div>
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-2">
                            <dt className="shrink-0 font-medium uppercase tracking-wide">
                              Gastos previstos
                            </dt>
                            <dd className="tabular-nums text-ravn-fg">
                              {formatMoney(
                                resumenGastosPorId.get(p.id)?.previstos ?? 0
                              )}
                            </dd>
                          </div>
                          <p className="mt-0.5 max-w-[18rem] text-right text-[10px] font-normal normal-case leading-snug text-ravn-muted sm:max-w-xs">
                            Costo directo + costos internos + cargos (sin cupo
                            de contingencia).
                          </p>
                        </div>
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-2">
                          <dt className="shrink-0 font-medium uppercase tracking-wide">
                            Gastos ejecutados
                          </dt>
                          <dd className="tabular-nums text-ravn-fg">
                            {formatMoney(
                              resumenGastosPorId.get(p.id)?.ejecutados ?? 0
                            )}
                          </dd>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex w-full flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-2">
                            <dt className="shrink-0 font-medium uppercase tracking-wide">
                              Cuánto te queda de imprevistos
                            </dt>
                            <dd className="tabular-nums text-ravn-fg">
                              {formatMoney(
                                resumenGastosPorId.get(p.id)
                                  ?.restanteImprevistos ?? 0
                              )}
                            </dd>
                          </div>
                          {(resumenGastosPorId.get(p.id)?.contingenciaCalculada ??
                            0) > 0 ? (
                            <p className="max-w-[16rem] text-right text-[10px] font-normal normal-case leading-snug text-ravn-muted">
                              Contingencia calculada (sobre costo directo):{" "}
                              <span className="tabular-nums text-ravn-fg">
                                {formatMoney(
                                  resumenGastosPorId.get(p.id)
                                    ?.contingenciaCalculada ?? 0
                                )}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      </dl>
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
