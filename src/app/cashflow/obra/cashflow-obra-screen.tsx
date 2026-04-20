"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CashflowItemModal } from "@/components/cashflow-item-modal";
import type { CashflowItemModalInitial } from "@/components/cashflow-item-modal";
import { CashflowSaldoChart } from "@/components/cashflow-saldo-chart";
import type { PuntoSaldoObraChart } from "@/lib/cashflow-compute";
import type { CashflowTipo } from "@/lib/cashflow-compute";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";

type ItemRow = {
  id: string;
  obra_id: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  descripcion: string;
  monto_proyectado: number;
  fecha_proyectada: string;
  monto_real: number | null;
  fecha_real: string | null;
  estado: string;
  notas: string;
};

type ItemAnulado = {
  id: string;
  tipo: "ingreso" | "egreso";
  categoria: string;
  descripcion: string;
  monto_real: number | null;
  fecha_real: string | null;
  deleted_at: string;
};

type ObraJson = {
  obra_id: string;
  presupuesto_id: string;
  nombre_obra: string;
  presupuesto_aprobado: boolean;
  finalizada_at: string | null;
  ultimo_cierre: { created_at: string; payload: unknown } | null;
  fecha_referencia: string;
  saldo_caja: number;
  totales_caja: { ingresos: number; egresos: number; neto: number };
  referencia_propuesta_ars?: number | null;
  pendiente_ingreso_referencia_ars?: number | null;
  resultado: {
    segun_caja: string;
    monto_neto: number;
  };
  items: ItemRow[];
  items_anulados?: ItemAnulado[];
  serie_saldo_libreta: PuntoSaldoObraChart[];
};

function fmtFecha(iso: string) {
  const d = iso.slice(0, 10);
  if (d.length !== 10) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function subsampleSerie<T>(arr: T[], maxPoints: number): T[] {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += step) out.push(arr[i]!);
  const last = arr[arr.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}

export function CashflowObraScreen({ obraId }: { obraId: string }) {
  const [data, setData] = useState<ObraJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CashflowItemModalInitial | null>(null);
  const [presetTipo, setPresetTipo] = useState<CashflowTipo | null>(null);
  const [finalizando, setFinalizando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cashflow/obra/${encodeURIComponent(obraId)}`,
        { cache: "no-store" }
      );
      const j = (await res.json()) as ObraJson & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar la obra.");
        setData(null);
        return;
      }
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [obraId]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () => subsampleSerie(data?.serie_saldo_libreta ?? [], 96),
    [data?.serie_saldo_libreta]
  );

  async function eliminar(id: string) {
    if (
      !confirm(
        "¿Anular este movimiento? Dejará de contar en el saldo. Podés restaurarlo abajo en «Anulados recientes»."
      )
    )
      return;
    try {
      const res = await fetch(`/cashflow/item/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        alert(j.error ?? "No se pudo anular.");
        return;
      }
      void load();
    } catch {
      alert("Error de red.");
    }
  }

  async function restaurar(id: string) {
    try {
      const res = await fetch(
        `/cashflow/item/${encodeURIComponent(id)}/restore`,
        { method: "POST" }
      );
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "No se pudo restaurar.");
        return;
      }
      void load();
    } catch {
      alert("Error de red.");
    }
  }

  function openNuevo(tipo: CashflowTipo) {
    setEditing(null);
    setPresetTipo(tipo);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setPresetTipo(null);
  }

  async function finalizarObra() {
    if (
      !confirm(
        "¿Finalizar la obra? Se guardará un resumen de cierre y no podrás usar el flujo diario en esta obra."
      )
    )
      return;
    setFinalizando(true);
    try {
      const res = await fetch(
        `/api/cashflow/obra/${encodeURIComponent(obraId)}/finalizar`,
        { method: "POST" }
      );
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "No se pudo finalizar.");
        return;
      }
      window.location.href = `/cashflow/obra/${encodeURIComponent(obraId)}/cierre`;
    } catch {
      alert("Error de red.");
    } finally {
      setFinalizando(false);
    }
  }

  function openEdit(row: ItemRow) {
    setPresetTipo(null);
    setEditing({
      id: row.id,
      tipo: row.tipo,
      categoria: row.categoria,
      descripcion: row.descripcion,
      monto_proyectado: row.monto_proyectado,
      fecha_proyectada: row.fecha_proyectada,
      monto_real: row.monto_real,
      fecha_real: row.fecha_real,
      estado: row.estado,
      notas: row.notas,
    });
    setModalOpen(true);
  }

  return (
    <div className="min-h-[100dvh] bg-ravn-surface px-4 py-10 pb-32 text-ravn-fg sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <VolverAlInicio />
        <div className="mt-6 flex flex-col gap-4 border-b border-ravn-line pb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ravn-muted">
                Caja por obra
              </p>
              <h1 className="mt-2 font-raleway text-xl font-semibold uppercase tracking-wide text-ravn-accent sm:text-2xl">
                {data?.nombre_obra ?? "Obra"}
              </h1>
              {data?.finalizada_at ? (
                <p className="mt-2 text-xs font-medium uppercase tracking-wider text-amber-200">
                  Obra finalizada
                </p>
              ) : null}
              {data?.presupuesto_id ? (
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  <Link
                    href={`/propuesta/${encodeURIComponent(data.presupuesto_id)}`}
                    className="font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
                  >
                    Propuesta
                  </Link>
                  <Link
                    href={`/obras/${encodeURIComponent(data.presupuesto_id)}/gastos`}
                    className="font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
                  >
                    Gastos de obra
                  </Link>
                  {data.ultimo_cierre ? (
                    <Link
                      href={`/cashflow/obra/${encodeURIComponent(obraId)}/cierre`}
                      className="font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
                    >
                      Resumen de cierre
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-3 sm:max-w-xs">
              {!data?.finalizada_at ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openNuevo("ingreso")}
                      className="inline-flex items-center justify-center rounded-none border-2 border-emerald-800/80 bg-emerald-950/50 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-emerald-100 transition-colors hover:bg-emerald-900/50"
                    >
                      + Ingreso
                    </button>
                    <button
                      type="button"
                      onClick={() => openNuevo("egreso")}
                      className="inline-flex items-center justify-center rounded-none border-2 border-red-900/60 bg-red-950/40 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-red-100 transition-colors hover:bg-red-900/40"
                    >
                      − Egreso
                    </button>
                  </div>
                  {data?.presupuesto_aprobado ? (
                    <button
                      type="button"
                      disabled={finalizando}
                      onClick={() => void finalizarObra()}
                      className="inline-flex w-full items-center justify-center rounded-none border border-ravn-line px-6 py-3 text-xs font-semibold uppercase tracking-wider text-ravn-muted transition-colors hover:border-ravn-fg hover:text-ravn-fg disabled:opacity-50"
                    >
                      {finalizando ? "…" : "Finalizar obra"}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="mt-12 text-sm text-ravn-muted">Cargando…</p>
        ) : error ? (
          <p className="mt-12 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : data ? (
          <div className="mt-10 flex flex-col gap-10">
            <div className="grid gap-4 border border-ravn-line p-5 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
                  Saldo total caja
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {formatMoneyInt(data.saldo_caja)}
                </p>
                <p className="mt-2 text-[11px] font-light leading-snug text-ravn-muted">
                  Ingresos registrados menos egresos registrados (todas las
                  líneas con monto y fecha).
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
                  Resultado
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {data.resultado.segun_caja === "ganando"
                    ? "Ganando"
                    : "Perdiendo"}{" "}
                  <span className="text-ravn-muted">·</span>{" "}
                  {formatMoneyInt(Math.abs(data.resultado.monto_neto))}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="border border-ravn-line px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                  Ingresos
                </p>
                <p className="mt-1 tabular-nums text-base font-medium">
                  {formatMoneyInt(data.totales_caja.ingresos)}
                </p>
              </div>
              <div className="border border-ravn-line px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                  Egresos
                </p>
                <p className="mt-1 tabular-nums text-base font-medium">
                  {formatMoneyInt(data.totales_caja.egresos)}
                </p>
              </div>
              <div className="border border-ravn-line px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                  Fecha consulta
                </p>
                <p className="mt-1 text-sm">{fmtFecha(data.fecha_referencia)}</p>
              </div>
            </div>

            {data.referencia_propuesta_ars != null ? (
              <div className="border border-ravn-accent/30 bg-ravn-subtle/30 p-4 text-xs">
                <p className="font-medium uppercase tracking-wider text-ravn-muted">
                  Cobranzas vs total propuesta (Rentabilidad)
                </p>
                <p className="mt-2 leading-relaxed text-ravn-muted">
                  <span className="text-ravn-fg">Ingresos cargados en caja</span>{" "}
                  son lo que ya registraste como cobrado.{" "}
                  <span className="text-ravn-fg">Importe propuesta</span> es el
                  total guardado en Rentabilidad (misma moneda / IVA que elegiste
                  ahí).
                </p>
                <ul className="mt-3 space-y-1 tabular-nums text-ravn-fg">
                  <li className="flex flex-wrap justify-between gap-2">
                    <span className="text-ravn-muted">Ingresos en caja</span>
                    <span className="font-medium">
                      {formatMoneyInt(data.totales_caja.ingresos)}
                    </span>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2">
                    <span className="text-ravn-muted">Importe propuesta (ref.)</span>
                    <span className="font-medium">
                      {formatMoneyInt(data.referencia_propuesta_ars)}
                    </span>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2 border-t border-ravn-line/60 pt-2">
                    <span className="text-ravn-muted">
                      Diferencia (ref. − ingresos caja)
                    </span>
                    <span className="font-medium text-amber-200/90">
                      {formatMoneyInt(data.pendiente_ingreso_referencia_ars ?? 0)}
                    </span>
                  </li>
                </ul>
                <p className="mt-2 text-[11px] leading-snug text-ravn-muted">
                  Positivo ≈ pendiente orientativo de cobro respecto al total de
                  propuesta; no reemplaza el detalle de cuotas ni facturación.
                </p>
              </div>
            ) : (
              <p className="text-xs text-ravn-muted">
                Guardá el importe en Rentabilidad para comparar acá la propuesta
                con los ingresos que cargás en caja.
              </p>
            )}

            <section aria-labelledby="grafico-saldo">
              <h2
                id="grafico-saldo"
                className="font-raleway text-sm font-semibold uppercase tracking-wide text-ravn-accent"
              >
                Saldo acumulado
              </h2>
              <p className="mt-2 text-xs text-ravn-muted">
                <span className="text-ravn-fg">Saldo caja</span> (ingresos −
                egresos con fecha real) e{" "}
                <span className="text-ravn-fg">ingresos acumulados</span>{" "}
                (cobranzas) en el eje derecho. Si hay total en Rentabilidad,
                aparece la línea de referencia para ver el avance respecto a la
                propuesta.
              </p>
              <div className="mt-4 border border-ravn-line p-3 sm:p-4">
                <CashflowSaldoChart
                  data={chartData}
                  referenciaPropuestaArs={data.referencia_propuesta_ars}
                />
              </div>
            </section>

            <section aria-labelledby="tabla-movs">
              <h2
                id="tabla-movs"
                className="font-raleway text-sm font-semibold uppercase tracking-wide text-ravn-accent"
              >
                Movimientos
              </h2>
              <div className="mt-4 overflow-x-auto border border-ravn-line">
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ravn-line bg-ravn-subtle/30 text-[10px] font-medium uppercase tracking-wider text-ravn-muted">
                      <th className="px-3 py-3">Tipo</th>
                      <th className="px-3 py-3">Concepto</th>
                      <th className="px-3 py-3 text-right">Monto</th>
                      <th className="px-3 py-3">Fecha</th>
                      <th className="px-3 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => {
                      const m = row.monto_real ?? row.monto_proyectado;
                      const f = row.fecha_real ?? row.fecha_proyectada;
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-ravn-line last:border-b-0"
                        >
                          <td className="px-3 py-3 capitalize">{row.tipo}</td>
                          <td className="max-w-[14rem] truncate px-3 py-3">
                            {row.descripcion || "—"}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">
                            {formatMoneyInt(m)}
                          </td>
                          <td className="px-3 py-3 tabular-nums text-xs">
                            {fmtFecha(f)}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              className="mr-2 text-[10px] font-semibold uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
                              onClick={() => openEdit(row)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="text-[10px] font-semibold uppercase tracking-wider text-red-400 underline-offset-2 hover:underline"
                              onClick={() => void eliminar(row.id)}
                            >
                              Anular
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {(data.items_anulados ?? []).length > 0 ? (
              <section aria-labelledby="anulados">
                <h2
                  id="anulados"
                  className="font-raleway text-sm font-semibold uppercase tracking-wide text-ravn-muted"
                >
                  Anulados recientes
                </h2>
                <p className="mt-2 text-xs text-ravn-muted">
                  No suman al saldo. Restaurá si fue un error.
                </p>
                <ul className="mt-4 space-y-2 border border-ravn-line p-4 text-sm">
                  {(data.items_anulados ?? []).map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-col gap-2 border-b border-ravn-line/50 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-xs uppercase text-ravn-muted">
                          {a.tipo} · {fmtFecha(a.deleted_at)}
                        </p>
                        <p className="mt-1">{a.descripcion || "—"}</p>
                        <p className="mt-1 tabular-nums text-ravn-fg">
                          {a.monto_real != null
                            ? formatMoneyInt(a.monto_real)
                            : "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restaurar(a.id)}
                        className="shrink-0 self-start rounded-none border border-ravn-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ravn-fg hover:bg-ravn-subtle sm:self-center"
                      >
                        Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      <CashflowItemModal
        key={modalOpen ? `${obraId}-${editing?.id ?? presetTipo ?? "nuevo"}` : "cerrado"}
        open={modalOpen}
        obraId={obraId}
        presetTipo={editing ? null : presetTipo}
        initial={editing}
        onClose={closeModal}
        onSaved={() => void load()}
      />

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-ravn-line bg-ravn-surface/95 px-4 py-3 backdrop-blur-sm sm:hidden">
        <Link
          href="/cashflow"
          className="block text-center text-xs font-medium uppercase tracking-wider text-ravn-muted underline-offset-2 hover:text-ravn-fg hover:underline"
        >
          Volver al cashflow general
        </Link>
      </div>
    </div>
  );
}
