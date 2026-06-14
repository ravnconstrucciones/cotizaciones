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
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { VolverAlInicio } from "@/components/volver-al-inicio";

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
      className="mt-2 w-full max-w-[20rem] overflow-hidden rounded-full bg-cdm-fg/10 sm:ml-auto"
      role="img"
      aria-label={`Gastos sobre total al cliente: ${Math.round(pct)} por ciento`}
    >
      <div className="h-1.5 overflow-hidden rounded-full bg-cdm-fg/10">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            over ? "bg-[var(--cdm-negativo)]" : "bg-cdm-accent"
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

  if (loading) {
    return <CargandoCockpit label="Control de gastos" />;
  }

  if (error) {
    return (
      <main className="font-geist relative flex min-h-screen items-center justify-center bg-cdm-bg text-red-400">
        <span className="relative z-10 text-xs uppercase tracking-widest">{error}</span>
      </main>
    );
  }

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      {/* Header */}
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Control de gastos
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Presupuestos aprobados · Seguimiento de obra
          </p>
        </div>
        <VolverAlInicio />
      </header>

      {/* Descripción + links de acción */}
      <div className="relative z-10 px-6 pt-4 md:px-10">
        <p className="max-w-2xl text-sm text-cdm-muted">
          Presupuestos con PDF generado y marcados como{" "}
          <span className="text-cdm-fg">aprobados</span> en el historial. Desde
          acá entrás a cargar gastos de obra.
        </p>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-cdm-muted">
          El total <span className="text-cdm-fg">ejecutado</span> suma los gastos
          cargados en el panel de obra y los{" "}
          <span className="text-cdm-fg">egresos de Caja</span> de esa obra con
          monto y fecha reales (misma lógica que el resumen de tesorería).
        </p>
        <div className="font-mono-hud mt-3 flex flex-wrap gap-4 text-[10px] uppercase tracking-[0.14em]">
          <Link
            href="/historial"
            className="text-cdm-muted transition-colors hover:text-cdm-fg"
          >
            Ir al historial →
          </Link>
          <Link
            href="/gastos/nuevo"
            className="text-cdm-muted transition-colors hover:text-cdm-fg"
          >
            Registrar gasto →
          </Link>
        </div>
      </div>

      {/* Lista de presupuestos */}
      <div className="relative z-10 px-6 pb-24 pt-8 md:px-10">
        {rows.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="px-6 text-center text-[12px] uppercase tracking-[0.2em] text-cdm-muted">
              No hay presupuestos aprobados.{" "}
              <Link
                href="/historial"
                className="text-cdm-fg underline underline-offset-2"
              >
                Ir al historial
              </Link>{" "}
              para marcar uno.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Presupuestos aprobados">
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
                  className="rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 px-6 py-6 transition-shadow hover:ring-cdm-line/70 md:px-8 md:py-7"
                >
                  <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    {/* Info izquierda */}
                    <div className="min-w-0">
                      <p className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-accent">
                        {numeroLabel}
                      </p>
                      <p className="font-geist mt-1.5 text-[15px] font-medium leading-snug text-cdm-fg">
                        {p.nombre_obra?.trim() ||
                          p.nombre_cliente?.trim() ||
                          "—"}
                      </p>
                      {p.nombre_obra?.trim() ? (
                        <p className="font-mono-hud mt-0.5 text-[10px] text-cdm-muted">
                          {p.nombre_cliente?.trim() || "—"}
                        </p>
                      ) : null}
                      <p className="font-mono-hud mt-1 text-[10px] text-cdm-muted/70">
                        {formatFechaCreacion(p.created_at, p.fecha)}
                      </p>
                    </div>

                    {/* Métricas derecha */}
                    <div className="flex w-full shrink-0 flex-col items-stretch gap-4 sm:max-w-md sm:items-end">
                      {/* Total al cliente + barra */}
                      <div className="text-left sm:text-right">
                        <p className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                          Total al cliente
                        </p>
                        {totalClienteFmt != null ? (
                          <>
                            <CifraHeroica className="text-[clamp(28px,2.2vw,40px)] leading-none">
                              {totalClienteFmt}
                            </CifraHeroica>
                            {totalClienteArs > 0 && pref != null ? (
                              <>
                                <BarraGastoSobreTotalAlCliente
                                  gastadoArs={ejecutadoArs}
                                  totalClienteArs={totalClienteArs}
                                />
                                <div className="mt-3 text-left sm:text-right">
                                  <p className="font-mono-hud text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                                    Ganancia neta
                                  </p>
                                  <p
                                    className={`font-geist mt-0.5 text-base font-semibold tabular-nums md:text-lg ${
                                      restanteFrenteClienteArs < 0
                                        ? "text-[var(--cdm-negativo)]"
                                        : "text-cdm-fg"
                                    }`}
                                  >
                                    {formatoRestanteFrenteAlCliente(
                                      pref,
                                      restanteFrenteClienteArs
                                    )}
                                  </p>
                                  {restanteFrenteClienteArs < 0 ? (
                                    <p className="font-mono-hud mt-1 max-w-[14rem] text-right text-[10px] normal-case leading-snug text-cdm-muted sm:ml-auto">
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
                          <p className="mt-1 max-w-xs text-sm font-light leading-snug text-cdm-muted">
                            Sin total guardado: abrí{" "}
                            <Link
                              href={`/rentabilidad?id=${encodeURIComponent(p.id)}`}
                              className="text-cdm-fg underline underline-offset-2"
                            >
                              Rentabilidad
                            </Link>{" "}
                            y guardá el importe en la nube.
                          </p>
                        )}
                        {pdfEnUsd ? (
                          <p className="font-mono-hud mt-1 text-[10px] text-cdm-muted">
                            PDF en USD
                          </p>
                        ) : null}
                      </div>

                      {/* Tabla de gastos */}
                      <dl className="w-full max-w-[18rem] space-y-2 text-right sm:max-w-xs">
                        <div>
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-2">
                            <dt className="font-mono-hud shrink-0 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                              Gastos previstos
                            </dt>
                            <dd className="font-geist text-[11px] tabular-nums text-cdm-fg">
                              {formatMoney(
                                resumenGastosPorId.get(p.id)?.previstos ?? 0
                              )}
                            </dd>
                          </div>
                          <p className="font-mono-hud mt-0.5 max-w-[18rem] text-right text-[10px] normal-case leading-snug text-cdm-muted/70 sm:max-w-xs">
                            Costo directo + costos internos + cargos (sin cupo
                            de contingencia).
                          </p>
                        </div>
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-2">
                          <dt className="font-mono-hud shrink-0 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                            Gastos ejecutados
                          </dt>
                          <dd className="font-geist text-[11px] tabular-nums text-cdm-fg">
                            {formatMoney(
                              resumenGastosPorId.get(p.id)?.ejecutados ?? 0
                            )}
                          </dd>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex w-full flex-col gap-0.5 sm:flex-row sm:justify-end sm:gap-2">
                            <dt className="font-mono-hud shrink-0 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                              Cuánto te queda de imprevistos
                            </dt>
                            <dd className="font-geist text-[11px] tabular-nums text-cdm-fg">
                              {formatMoney(
                                resumenGastosPorId.get(p.id)
                                  ?.restanteImprevistos ?? 0
                              )}
                            </dd>
                          </div>
                          {(resumenGastosPorId.get(p.id)?.contingenciaCalculada ??
                            0) > 0 ? (
                            <p className="font-mono-hud max-w-[16rem] text-right text-[10px] normal-case leading-snug text-cdm-muted/70">
                              Contingencia calculada (sobre costo directo):{" "}
                              <span className="font-geist tabular-nums text-cdm-fg">
                                {formatMoney(
                                  resumenGastosPorId.get(p.id)
                                    ?.contingenciaCalculada ?? 0
                                )}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      </dl>

                      {/* CTA */}
                      <Link
                        href={`/obras/${encodeURIComponent(p.id)}/gastos`}
                        className="font-mono-hud inline-flex cursor-pointer items-center justify-center rounded-full bg-cdm-accent/10 px-6 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/50 transition-colors hover:bg-cdm-accent/20"
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
