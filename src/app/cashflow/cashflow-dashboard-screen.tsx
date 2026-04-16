"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CashflowItemModal } from "@/components/cashflow-item-modal";
import type { CashflowTipo } from "@/lib/cashflow-compute";
import { formatMoneyInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";

type ObraActiva = {
  obra_id: string;
  presupuesto_id: string | null;
  nombre_obra: string;
  ingresos_caja: number;
  egresos_libreta_ars?: number;
  egresos_gastos_obra_ars?: number;
  egresos_caja: number;
  saldo_caja: number;
  referencia_propuesta_ars: number | null;
  pendiente_ingreso_referencia_ars: number | null;
  saldo_por_cobrar_ars?: number | null;
  cobranza_cerrada?: boolean;
};

type LibretaEmpresaResumen = {
  obra_id: string;
  presupuesto_id?: string;
  nombre_obra: string;
  ingresos_caja: number;
  egresos_libreta_ars?: number;
  egresos_gastos_obra_ars?: number;
  egresos_caja: number;
  saldo_caja: number;
};

type MovimientoReciente = {
  id: string;
  obra_id: string;
  nombre_obra: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  monto_real: number;
  fecha_real: string;
  origen?: "libreta" | "gasto_obra";
};

type MovimientoAnulado = MovimientoReciente & { deleted_at: string };

type TotalesCaja = {
  ingresos: number;
  egresos: number;
  saldo: number;
  egresos_libreta?: number;
  egresos_gastos_obra?: number;
};

type ResumenJson = {
  fecha_referencia: string;
  saldo_caja_total: number;
  total_por_cobrar_clientes_ars?: number;
  totales_caja: TotalesCaja;
  obras_activas: ObraActiva[];
  libreta_empresa?: LibretaEmpresaResumen | null;
  movimientos_recientes?: MovimientoReciente[];
  movimientos_anulados_recientes?: MovimientoAnulado[];
};

function fmtFecha(iso: string) {
  const d = iso.slice(0, 10);
  if (d.length !== 10) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function CashflowDashboardScreen() {
  const [data, setData] = useState<ResumenJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [presetTipo, setPresetTipo] = useState<CashflowTipo>("ingreso");
  const [cobranzaCerrandoId, setCobranzaCerrandoId] = useState<string | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/cashflow/resumen", { cache: "no-store" });
      const j = (await res.json()) as ResumenJson & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const obraOpts = useMemo(
    () => [
      ...(data?.libreta_empresa
        ? [
            {
              id: data.libreta_empresa.obra_id,
              nombre: data.libreta_empresa.nombre_obra,
            },
          ]
        : []),
      ...(data?.obras_activas.map((o) => ({
        id: o.obra_id,
        nombre: o.nombre_obra,
      })) ?? []),
    ],
    [data]
  );

  const puedeRegistrar = obraOpts.length > 0;

  async function cerrarCobranzaObra(obraId: string) {
    if (
      !confirm(
        "¿Marcar obra finalizada para cobranza? Se guarda el importe actual de la propuesta (Rentabilidad) como total a cobrar. Lo que falte cobrar será ese total menos los ingresos que registres en caja (cada pago parcial resta)."
      )
    )
      return;
    setCobranzaCerrandoId(obraId);
    try {
      const res = await fetch(
        `/api/cashflow/obra/${encodeURIComponent(obraId)}/cobranza-cerrar`,
        { method: "POST" }
      );
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "No se pudo cerrar la cobranza.");
        return;
      }
      void load();
    } catch {
      alert("Error de red.");
    } finally {
      setCobranzaCerrandoId(null);
    }
  }

  async function anularMovimiento(id: string) {
    if (
      !confirm(
        "¿Anular este movimiento? Dejará de contar en el saldo. Podés restaurarlo abajo en «Anulados recientes» o en el detalle de la obra."
      )
    )
      return;
    try {
      const res = await fetch(`/cashflow/item/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(j.error ?? "No se pudo anular.");
        return;
      }
      void load();
    } catch {
      alert("Error de red.");
    }
  }

  async function restaurarMovimiento(id: string) {
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

  function abrirNuevo(tipo: CashflowTipo) {
    setPresetTipo(tipo);
    setModalOpen(true);
  }

  return (
    <div className="min-h-[100dvh] bg-ravn-surface px-4 py-10 pb-24 text-ravn-fg sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <VolverAlInicio />
        <header className="mt-8 border-b border-ravn-line pb-8">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-ravn-muted">
            Tesorería
          </p>
          <h1 className="mt-2 font-raleway text-2xl font-semibold uppercase tracking-wide text-ravn-accent sm:text-3xl">
            Caja
          </h1>
          <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-ravn-muted">
            El saldo de caja incluye ingresos y egresos de la libreta más los
            gastos de obra (panel Gastos). “Por cobrar” resume lo que falta
            cobrar a clientes (según propuesta o total cerrado).
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-md">
            <button
              type="button"
              disabled={!puedeRegistrar}
              onClick={() => abrirNuevo("ingreso")}
              className="inline-flex items-center justify-center rounded-none border-2 border-emerald-800/80 bg-emerald-950/50 px-4 py-4 text-[10px] font-semibold uppercase tracking-wider text-emerald-100 transition-colors hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Nuevo ingreso
            </button>
            <button
              type="button"
              disabled={!puedeRegistrar}
              onClick={() => abrirNuevo("egreso")}
              className="inline-flex items-center justify-center rounded-none border-2 border-red-900/60 bg-red-950/40 px-4 py-4 text-[10px] font-semibold uppercase tracking-wider text-red-100 transition-colors hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              − Nuevo egreso
            </button>
          </div>
          {!puedeRegistrar && !loading ? (
            <p className="mt-3 text-xs text-ravn-muted">
              Necesitás al menos una obra aprobada o la cuenta empresa (migración
              de caja en Supabase). Aprobá presupuestos desde el{" "}
              <Link
                href="/historial"
                className="text-ravn-fg underline underline-offset-2"
              >
                historial
              </Link>
              .
            </p>
          ) : null}
        </header>

        {loading ? (
          <p className="mt-12 text-sm text-ravn-muted">Cargando…</p>
        ) : error ? (
          <p className="mt-12 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : data ? (
          <div className="mt-10 flex flex-col gap-10">
            <div className="border border-ravn-line border-sky-900/40 bg-sky-950/25 px-5 py-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-sky-200/90">
                Total por cobrar (clientes)
              </p>
              <p className="mt-2 text-xl font-medium tabular-nums text-sky-100 sm:text-2xl">
                {formatMoneyInt(data.total_por_cobrar_clientes_ars ?? 0)}
              </p>
              <p className="mt-3 text-[11px] font-light leading-snug text-sky-100/70">
                Suma por obra: referencia − ingresos en caja, o (si cerraste
                cobranza) total fijado − ingresos. Pagos parciales en caja
                restan automáticamente.
              </p>
            </div>

            <div className="border border-ravn-line bg-ravn-surface px-5 py-5">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ravn-muted">
                Saldo total (caja)
              </p>
              <p className="mt-2 text-xl font-medium tabular-nums sm:text-2xl">
                {formatMoneyInt(data.saldo_caja_total)}
              </p>
              <div className="mt-4 grid gap-2 border-t border-ravn-line/80 pt-4 text-xs tabular-nums sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                    Ingresos caja
                  </p>
                  <p className="mt-1 font-medium text-ravn-fg">
                    {formatMoneyInt(data.totales_caja.ingresos)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                    Egr. libreta
                  </p>
                  <p className="mt-1 font-medium text-ravn-fg">
                    {formatMoneyInt(
                      data.totales_caja.egresos_libreta ??
                        data.totales_caja.egresos
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                    Egr. gastos obra
                  </p>
                  <p className="mt-1 font-medium text-ravn-fg">
                    {formatMoneyInt(data.totales_caja.egresos_gastos_obra ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ravn-muted">
                    Saldo (ing − egr)
                  </p>
                  <p className="mt-1 font-medium text-ravn-fg">
                    {formatMoneyInt(data.totales_caja.saldo)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[10px] uppercase tracking-wider text-ravn-muted">
                Egresos caja total: {formatMoneyInt(data.totales_caja.egresos)} (
                libreta + gastos de obra)
              </p>
              <p className="mt-3 text-[11px] font-light leading-snug text-ravn-muted">
                Incluye obras aprobadas y cuenta empresa. Referencia:{" "}
                {fmtFecha(data.fecha_referencia)}.
              </p>
            </div>

            {data.libreta_empresa ? (
              <div className="border border-ravn-line border-amber-900/30 bg-amber-950/20 px-5 py-5">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200/90">
                  Cuenta empresa
                </p>
                <p className="mt-1 text-xs text-ravn-muted">
                  Gastos o ingresos no imputados a una obra de cliente.
                </p>
                <p className="mt-3 text-lg font-medium tabular-nums">
                  {formatMoneyInt(data.libreta_empresa.saldo_caja)}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums text-ravn-muted">
                  <span>
                    Ing.:{" "}
                    <span className="font-medium text-ravn-fg">
                      {formatMoneyInt(data.libreta_empresa.ingresos_caja)}
                    </span>
                  </span>
                  <span>
                    Egr.:{" "}
                    <span className="font-medium text-ravn-fg">
                      {formatMoneyInt(data.libreta_empresa.egresos_caja)}
                    </span>
                  </span>
                  {(data.libreta_empresa.egresos_gastos_obra_ars ?? 0) > 0 ? (
                    <span className="text-[10px]">
                      (libreta{" "}
                      {formatMoneyInt(data.libreta_empresa.egresos_libreta_ars ?? 0)}{" "}
                      + gastos obra{" "}
                      {formatMoneyInt(data.libreta_empresa.egresos_gastos_obra_ars ?? 0)})
                    </span>
                  ) : null}
                </div>
                <p className="mt-3">
                  <Link
                    href={`/cashflow/obra/${encodeURIComponent(data.libreta_empresa.obra_id)}`}
                    className="text-[10px] font-semibold uppercase tracking-wider text-ravn-accent underline-offset-2 hover:underline"
                  >
                    Ver libreta empresa
                  </Link>
                </p>
              </div>
            ) : null}

            {(data.movimientos_recientes ?? []).length > 0 ? (
              <section aria-labelledby="mov-recientes">
                <h2
                  id="mov-recientes"
                  className="font-raleway text-sm font-semibold uppercase tracking-wide text-ravn-accent"
                >
                  Últimos movimientos
                </h2>
                <p className="mt-2 text-xs text-ravn-muted">
                  Libreta y gastos de obra (Gastos). Anular solo aplica a líneas
                  de libreta; los gastos se editan en el panel Gastos de la
                  obra.
                </p>
                <ul className="mt-4 border border-ravn-line divide-y divide-ravn-line">
                  {(data.movimientos_recientes ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-ravn-fg">
                          <span
                            className={
                              m.tipo === "ingreso"
                                ? "text-emerald-400/90"
                                : "text-red-400/90"
                            }
                          >
                            {m.tipo === "ingreso" ? "Ingreso" : "Egreso"}
                          </span>
                          {m.origen === "gasto_obra" ? (
                            <span className="text-ravn-muted"> · Gasto obra</span>
                          ) : null}
                          <span className="text-ravn-muted"> · </span>
                          {m.descripcion.trim() || "—"}
                        </p>
                        <p className="mt-1 text-[11px] text-ravn-muted">
                          {m.nombre_obra} ·{" "}
                          {m.fecha_real ? fmtFecha(m.fecha_real) : "—"}
                        </p>
                        <p className="mt-1 text-sm font-medium tabular-nums">
                          {formatMoneyInt(m.monto_real)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          href={(() => {
                            if (m.origen !== "gasto_obra") {
                              return `/cashflow/obra/${encodeURIComponent(m.obra_id)}`;
                            }
                            const pid =
                              data.obras_activas.find((x) => x.obra_id === m.obra_id)
                                ?.presupuesto_id ??
                              (data.libreta_empresa?.obra_id === m.obra_id
                                ? data.libreta_empresa.presupuesto_id
                                : undefined);
                            return pid
                              ? `/obras/${encodeURIComponent(pid)}/gastos`
                              : `/cashflow/obra/${encodeURIComponent(m.obra_id)}`;
                          })()}
                          className="inline-flex items-center justify-center rounded-none border border-ravn-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ravn-fg hover:bg-ravn-subtle"
                        >
                          {m.origen === "gasto_obra" ? "Gastos" : "Obra"}
                        </Link>
                        {m.origen !== "gasto_obra" ? (
                          <button
                            type="button"
                            onClick={() => void anularMovimiento(m.id)}
                            className="inline-flex items-center justify-center rounded-none border border-red-900/50 bg-red-950/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-red-100 hover:bg-red-900/40"
                          >
                            Anular
                          </button>
                        ) : (
                          <span className="self-center text-[10px] text-ravn-muted">
                            Ver Gastos
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {(data.movimientos_anulados_recientes ?? []).length > 0 ? (
              <section aria-labelledby="mov-anulados">
                <h2
                  id="mov-anulados"
                  className="font-raleway text-sm font-semibold uppercase tracking-wide text-ravn-muted"
                >
                  Anulados recientes
                </h2>
                <p className="mt-2 text-xs text-ravn-muted">
                  No suman al saldo. Restaurá si anulaste por error.
                </p>
                <ul className="mt-4 border border-ravn-line divide-y divide-ravn-line opacity-90">
                  {(data.movimientos_anulados_recientes ?? []).map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-ravn-muted">
                          {m.tipo === "ingreso" ? "Ingreso" : "Egreso"} ·{" "}
                          {m.descripcion.trim() || "—"}
                        </p>
                        <p className="mt-1 text-[11px] text-ravn-muted">
                          {m.nombre_obra} · Anulado{" "}
                          {m.deleted_at ? fmtFecha(m.deleted_at) : ""}
                        </p>
                        <p className="mt-1 text-sm font-medium tabular-nums text-ravn-muted">
                          {formatMoneyInt(m.monto_real)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restaurarMovimiento(m.id)}
                        className="inline-flex shrink-0 items-center justify-center rounded-none border border-emerald-900/50 bg-emerald-950/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-100 hover:bg-emerald-900/40"
                      >
                        Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="obras-activas">
              <h2
                id="obras-activas"
                className="font-raleway text-sm font-semibold uppercase tracking-wide text-ravn-accent"
              >
                Obras
              </h2>
              {data.obras_activas.length === 0 ? (
                <p className="mt-3 text-sm text-ravn-muted">
                  {data.libreta_empresa
                    ? "No hay obras de cliente con presupuesto aprobado (solo cuenta empresa)."
                    : "No hay obras con presupuesto aprobado."}
                </p>
              ) : (
                <ul className="mt-4 border border-ravn-line">
                  {data.obras_activas.map((o) => (
                    <li
                      key={o.obra_id}
                      className="border-b border-ravn-line px-5 py-4 last:border-b-0"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <Link
                            href={`/cashflow/obra/${encodeURIComponent(o.obra_id)}`}
                            className="font-raleway text-base font-semibold uppercase tracking-wide text-ravn-accent underline-offset-2 hover:underline"
                          >
                            {o.nombre_obra}
                          </Link>
                          <dl className="mt-2 space-y-1 text-xs text-ravn-muted">
                            <div>
                              <dt className="inline">Ingresos caja:</dt>{" "}
                              <dd className="inline tabular-nums font-medium text-ravn-fg">
                                {formatMoneyInt(o.ingresos_caja)}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">Egresos libreta:</dt>{" "}
                              <dd className="inline tabular-nums font-medium text-ravn-fg">
                                {formatMoneyInt(o.egresos_libreta_ars ?? o.egresos_caja)}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">Egresos gastos obra:</dt>{" "}
                              <dd className="inline tabular-nums font-medium text-ravn-fg">
                                {formatMoneyInt(o.egresos_gastos_obra_ars ?? 0)}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">Egresos caja (total):</dt>{" "}
                              <dd className="inline tabular-nums font-medium text-ravn-fg">
                                {formatMoneyInt(o.egresos_caja)}
                              </dd>
                            </div>
                            <div>
                              <dt className="inline">Saldo caja:</dt>{" "}
                              <dd className="inline tabular-nums font-medium text-ravn-fg">
                                {formatMoneyInt(o.saldo_caja)}
                              </dd>
                            </div>
                            {o.saldo_por_cobrar_ars != null ? (
                              <div className="pt-1 text-[11px] leading-snug">
                                <span className="text-ravn-muted">
                                  {o.cobranza_cerrada
                                    ? "Por cobrar (total cerrado − ingresos caja): "
                                    : "Por cobrar (ref. propuesta − ingresos caja): "}
                                </span>
                                <span className="tabular-nums font-medium text-amber-200/90">
                                  {formatMoneyInt(o.saldo_por_cobrar_ars)}
                                </span>
                              </div>
                            ) : null}
                            {o.referencia_propuesta_ars != null ? (
                              <div className="pt-1 text-[11px] leading-snug text-ravn-muted">
                                Ref. propuesta:{" "}
                                <span className="tabular-nums font-medium text-ravn-fg">
                                  {formatMoneyInt(o.referencia_propuesta_ars)}
                                </span>
                              </div>
                            ) : null}
                          </dl>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!o.cobranza_cerrada && o.referencia_propuesta_ars != null ? (
                            <button
                              type="button"
                              disabled={cobranzaCerrandoId === o.obra_id}
                              onClick={() => void cerrarCobranzaObra(o.obra_id)}
                              className="inline-flex items-center justify-center rounded-none border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-amber-100 transition-colors hover:bg-amber-900/40 disabled:opacity-50"
                            >
                              {cobranzaCerrandoId === o.obra_id
                                ? "Guardando…"
                                : "Obra finalizada (cobranza)"}
                            </button>
                          ) : null}
                          {o.cobranza_cerrada ? (
                            <span className="self-center text-[10px] uppercase tracking-wider text-ravn-muted">
                              Cobranza cerrada
                            </span>
                          ) : null}
                          {o.presupuesto_id ? (
                            <Link
                              href={`/obras/${encodeURIComponent(o.presupuesto_id)}/gastos`}
                              className="inline-flex items-center justify-center rounded-none border border-ravn-line px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-ravn-fg transition-colors hover:bg-ravn-subtle"
                            >
                              Gastos
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <CashflowItemModal
        key={modalOpen ? `${presetTipo}-nuevo` : "cerrado"}
        open={modalOpen}
        obraOpciones={obraOpts}
        presetTipo={presetTipo}
        initial={null}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void load();
          setModalOpen(false);
        }}
      />
    </div>
  );
}
