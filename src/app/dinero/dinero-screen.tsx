"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoneyInt, formatMoneyUsdInt } from "@/lib/format-currency";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { CargandoCockpit } from "@/components/cockpit/cargando-cockpit";
import { CifraHeroica } from "@/components/cockpit/cifra-heroica";
import { fetchCompartido } from "@/lib/fetch-compartido";
import type { SaldosCuentas } from "@/lib/cuentas";
import {
  borradoresAgrupados,
  bolsillosPorCuenta,
  composicionPorObra,
  deudasConAntiguedad,
  divergenciasContraMotor,
  nombreDueno,
  totalesPorDueno,
  type BolsilloVista,
  type BorradorVista,
  type FinanciamientoVista,
} from "@/lib/dinero-tablero";
import { parseNum } from "@/lib/cashflow-compute";

/**
 * Módulo DINERO — pantalla (Fase 3, spec 2026-07-06). Cashflow es la
 * proyección; esto es la REALIDAD de la plata: de quién es lo que hay en
 * cada cuenta (bolsillos), quién le debe a quién (libro de deudas) y qué
 * operación del bot quedó sin confirmar (borradores). Solo lectura: la
 * carga es por WhatsApp (bot) o por las pantallas de detalle; acá se mira.
 */

type PayloadDinero = {
  bolsillos: BolsilloVista[];
  financiamientos: FinanciamientoVista[];
  borradores: BorradorVista[];
  obras: Record<string, string>;
  costos_obra: Record<string, number>;
};

const CARD = "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5";
const LABEL = "text-[10px] uppercase tracking-[0.24em] text-cdm-muted";

const COLOR_DUENO: Record<string, string> = {
  obra: "bg-cdm-accent/70",
  empresa: "bg-emerald-400/80",
  personal: "bg-amber-300/80",
};

function fmtMonto(n: number, moneda: "ARS" | "USD"): string {
  return moneda === "USD" ? `US$ ${formatMoneyUsdInt(n)}` : formatMoneyInt(n);
}

function fmtFecha(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function DineroScreen() {
  const [data, setData] = useState<PayloadDinero | null>(null);
  const [cuentas, setCuentas] = useState<SaldosCuentas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resDinero, resCuentas] = await Promise.all([
        fetchCompartido("/api/dinero"),
        fetchCompartido("/api/cuentas"),
      ]);
      if (!resDinero.ok) {
        setError(
          (resDinero.body as { error?: string })?.error ?? `Error ${resDinero.status}`
        );
        return;
      }
      setData(resDinero.body as PayloadDinero);
      if (resCuentas.ok) setCuentas(resCuentas.body as SaldosCuentas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totales = useMemo(
    () => (data ? totalesPorDueno(data.bolsillos) : null),
    [data]
  );
  const porCuenta = useMemo(
    () => (data ? bolsillosPorCuenta(data.bolsillos) : new Map<string, BolsilloVista[]>()),
    [data]
  );
  const deudas = useMemo(
    () => (data ? deudasConAntiguedad(data.financiamientos, Date.now()) : []),
    [data]
  );
  const grupos = useMemo(
    () => (data ? borradoresAgrupados(data.borradores) : []),
    [data]
  );
  const composicion = useMemo(
    () => (data ? composicionPorObra(data.financiamientos, data.costos_obra) : []),
    [data]
  );
  const divergencias = useMemo(() => {
    if (!data || !cuentas) return [];
    return divergenciasContraMotor(
      data.bolsillos,
      cuentas.cuentas.map((c) => ({ id: c.id, saldo: c.saldo }))
    );
  }, [data, cuentas]);

  if (loading) return <CargandoCockpit label="Dinero" />;

  if (error || !data) {
    return (
      <main className="font-geist relative flex min-h-screen items-center justify-center bg-cdm-bg text-red-400">
        <span className="relative z-10 text-xs uppercase tracking-widest">
          {error ?? "Sin datos"}
        </span>
      </main>
    );
  }

  const obras = data.obras;
  const nombreCuenta = new Map(
    (cuentas?.cuentas ?? []).map((c) => [c.id, c] as const)
  );
  const abiertas = deudas.filter((d) => d.estado === "abierto");
  const historicas = deudas.filter((d) => d.estado !== "abierto");
  const sinFoto = data.bolsillos.length === 0;

  return (
    <main className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <VolverAlInicio />

        {/* Header */}
        <div className="pt-4 pb-6">
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Dinero
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            La realidad de la plata · bolsillos y libro de deudas
          </p>
        </div>

        {sinFoto ? (
          <section className={CARD}>
            <p className="text-sm text-cdm-muted">
              El ledger todavía no tiene movimientos asentados. Después de la
              foto inicial, acá se ve de quién es la plata de cada cuenta.
            </p>
          </section>
        ) : (
          <div className="space-y-5">
            {/* Alertas: a conciliar + borradores colgados */}
            {(divergencias.length > 0 || grupos.length > 0) && (
              <section className={`${CARD} ring-amber-300/40`}>
                <p className={LABEL}>Atención</p>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {divergencias.map((d) => {
                    const c = nombreCuenta.get(d.cuenta_id);
                    return (
                      <li key={d.cuenta_id} className="flex items-baseline justify-between gap-3">
                        <span className="text-amber-300">
                          A conciliar: {c?.nombre ?? d.cuenta_id} — el ledger dice{" "}
                          {fmtMonto(d.saldoLedger, c?.moneda ?? "ARS")} y el motor{" "}
                          {fmtMonto(d.saldoMotor, c?.moneda ?? "ARS")}
                        </span>
                        <span className="shrink-0 tabular-nums text-amber-300">
                          Δ {fmtMonto(d.delta, c?.moneda ?? "ARS")}
                        </span>
                      </li>
                    );
                  })}
                  {grupos.length > 0 && (
                    <li className="text-cdm-muted">
                      {grupos.length === 1
                        ? "1 operación del bot sin confirmar"
                        : `${grupos.length} operaciones del bot sin confirmar`}{" "}
                      — se confirman por WhatsApp, jamás asientan solas.
                    </li>
                  )}
                </ul>
              </section>
            )}

            {/* De quién es la plata */}
            {totales && (
              <section className={CARD}>
                <p className={LABEL}>De quién es la plata</p>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {(
                    [
                      ["obra", "Obras", "es de los clientes"],
                      ["empresa", "RAVN", "margen de la empresa"],
                      ["personal", "Eze", "tu bolsillo"],
                    ] as const
                  ).map(([tipo, titulo, hint]) => (
                    <div key={tipo}>
                      <p className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 ${COLOR_DUENO[tipo]}`} />
                        <span className={LABEL}>{titulo}</span>
                      </p>
                      <p className="mt-1">
                        <CifraHeroica
                          className="text-[clamp(20px,2vw,30px)] leading-none"
                          tono={totales[tipo].ars < 0 ? "negativo" : "neutro"}
                        >
                          {formatMoneyInt(totales[tipo].ars)}
                        </CifraHeroica>
                      </p>
                      <p className="text-[10px] tabular-nums text-cdm-muted">
                        {totales[tipo].usd !== 0
                          ? `+ US$ ${formatMoneyUsdInt(totales[tipo].usd)}`
                          : hint}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Cuentas y bolsillos */}
            <section className={CARD}>
              <p className={LABEL}>Cuentas y bolsillos</p>
              <ul className="mt-3 space-y-4">
                {(cuentas?.cuentas ?? [])
                  .filter((c) => c.activa && (porCuenta.has(c.id) || c.saldo !== 0))
                  .map((c) => {
                    const bolsillos = porCuenta.get(c.id) ?? [];
                    return (
                      <li key={c.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-[13px] text-cdm-fg">
                            {c.nombre}
                          </span>
                          <span className="shrink-0 tabular-nums text-[13px] text-cdm-fg">
                            {fmtMonto(c.saldo, c.moneda)}
                          </span>
                        </div>
                        {bolsillos.length > 0 && (
                          <ul className="mt-1 space-y-0.5 border-l border-cdm-line pl-3">
                            {bolsillos.map((b) => (
                              <li
                                key={`${b.dueno_tipo}|${b.dueno_obra_id ?? ""}`}
                                className="flex items-baseline justify-between gap-3 text-[11px]"
                              >
                                <span className="flex min-w-0 items-center gap-1.5 truncate text-cdm-muted">
                                  <span
                                    className={`inline-block h-1.5 w-1.5 shrink-0 ${COLOR_DUENO[b.dueno_tipo]}`}
                                  />
                                  {nombreDueno(b.dueno_tipo, b.dueno_obra_id, obras)}
                                </span>
                                <span
                                  className={`shrink-0 tabular-nums ${
                                    parseNum(b.saldo) < 0 ? "text-red-400" : "text-cdm-fg"
                                  }`}
                                >
                                  {fmtMonto(parseNum(b.saldo), b.moneda)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>

            {/* Libro de deudas */}
            <section className={CARD}>
              <p className={LABEL}>Libro de deudas</p>
              {abiertas.length === 0 ? (
                <p className="mt-2 text-[13px] text-cdm-muted">
                  Nadie le debe nada a nadie. Las deudas nacen cuando una obra
                  gasta plata de otra (o tuya, o de RAVN).
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {abiertas.map((d) => (
                    <li key={d.id} className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-cdm-fg">
                          {nombreDueno(d.deudor_tipo, d.deudor_obra_id, obras)}{" "}
                          <span className="text-cdm-muted">debe a</span>{" "}
                          {nombreDueno(d.acreedor_tipo, d.acreedor_obra_id, obras)}
                        </p>
                        <p className="text-[10px] tabular-nums text-cdm-muted">
                          hace {d.dias} {d.dias === 1 ? "día" : "días"}
                          {d.saldoPendiente !== d.montoOriginal &&
                            ` · devuelto ${fmtMonto(d.montoOriginal - d.saldoPendiente, d.moneda)} de ${fmtMonto(d.montoOriginal, d.moneda)}`}
                          {d.notas ? ` · ${d.notas}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-[13px] text-red-400">
                        {fmtMonto(d.saldoPendiente, d.moneda)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {historicas.length > 0 && (
                <details className="mt-3 border-t border-cdm-line pt-2">
                  <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
                    Historial ({historicas.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {historicas.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-baseline justify-between gap-3 text-[11px] text-cdm-muted"
                      >
                        <span className="min-w-0 truncate">
                          {nombreDueno(d.deudor_tipo, d.deudor_obra_id, obras)} →{" "}
                          {nombreDueno(d.acreedor_tipo, d.acreedor_obra_id, obras)} ·{" "}
                          {d.estado}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {fmtMonto(d.montoOriginal, d.moneda)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            {/* Borradores del bot */}
            {grupos.length > 0 && (
              <section className={CARD}>
                <p className={LABEL}>Borradores sin confirmar</p>
                <ul className="mt-3 space-y-2">
                  {grupos.map((g) => (
                    <li key={g.grupo_id} className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-cdm-fg">
                          {g.descripcion || g.origen_tipo.replace(/_/g, " ")}
                        </p>
                        <p className="text-[10px] tabular-nums text-cdm-muted">
                          {fmtFecha(g.fecha)} · {g.patas}{" "}
                          {g.patas === 1 ? "pata" : "patas"} · confirmalo desde
                          WhatsApp
                        </p>
                      </div>
                      <span className="shrink-0 tabular-nums text-[13px] text-amber-300">
                        {g.totalArs > 0 && formatMoneyInt(g.totalArs)}
                        {g.totalArs > 0 && g.totalUsd > 0 && " + "}
                        {g.totalUsd > 0 && `US$ ${formatMoneyUsdInt(g.totalUsd)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Composición del costo por obra */}
            {composicion.length > 0 && (
              <section className={CARD}>
                <p className={LABEL}>Quién financia cada obra</p>
                <ul className="mt-3 space-y-4">
                  {composicion.map((c) => (
                    <li key={c.obra_id}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] text-cdm-fg">
                          {obras[c.obra_id] ?? "Obra sin nombre"}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-cdm-muted">
                          costo {formatMoneyInt(c.costo)}
                        </span>
                      </div>
                      {c.costo > 0 && (
                        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden bg-cdm-fg/10">
                          <div
                            className="h-full bg-cdm-accent/70"
                            style={{ width: `${Math.round(c.pctPropio * 100)}%` }}
                            title="caja propia"
                          />
                          <div
                            className="h-full bg-red-400/70"
                            style={{
                              width: `${Math.min(100, Math.round((c.financiadoTotal / c.costo) * 100))}%`,
                            }}
                            title="financiado"
                          />
                        </div>
                      )}
                      <p className="mt-1 text-[10px] tabular-nums text-cdm-muted">
                        {c.costo > 0 && `${Math.round(c.pctPropio * 100)}% caja propia · `}
                        {c.financiado
                          .map(
                            (f) =>
                              `${nombreDueno(f.acreedor_tipo, f.acreedor_obra_id, obras)} puso ${formatMoneyInt(f.monto)}`
                          )
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
