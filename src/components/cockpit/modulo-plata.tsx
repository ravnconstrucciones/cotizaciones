"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { CifraHeroica } from "./cifra-heroica";
import { SkeletonCifra } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt, roundArs2 } from "@/lib/format-currency";
import { comprometidoDerivado, type ObraResumen } from "@/lib/salud-negocio";
import { totalesPorDueno, type BolsilloVista } from "@/lib/dinero-tablero";
import type { SaldosCuentas } from "@/lib/cuentas";

type Semaforo = "verde" | "amarillo" | "rojo";

/** Campos de /cashflow/resumen que consume la caja real (rediseño 01/07). */
type ResumenCaja = {
  saldo_caja_total?: number;
  caja_obras_usd?: number;
  blue_venta?: number | null;
  total_por_cobrar_clientes_ars?: number;
  obras_activas?: ObraResumen[];
  gastos_obra_hoy_ars?: number;
};

/** De /api/dinero: los bolsillos del ledger — la posta que carga Eze. */
type PayloadDinero = {
  bolsillos: BolsilloVista[];
  tarjetas?: string[];
};

/** Contrato de /api/finanzas (presupuesto personal por ciclo de tarjeta). */
type FinanzasResumen = {
  ciclo: { label: string };
  gastado_variable: number;
  discrecional_mes: number;
  semaforo: Semaforo;
  ultimos_gastos: { fecha: string; monto: number }[];
};

/** Hoy en zona BA (YYYY-MM-DD) para aislar los gastos personales del día. */
function hoyIsoBA(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatUsdInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

const DOT: Record<Semaforo, string> = {
  verde: "bg-emerald-400",
  amarillo: "bg-amber-300",
  rojo: "bg-red-400",
};

function PuntoSemaforo({ s }: { s: Semaforo }) {
  return (
    <motion.span
      animate={s === "rojo" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
      transition={{ repeat: Infinity, duration: 1.2 }}
      className={`inline-block h-2 w-2 ${DOT[s]}`}
    />
  );
}

/**
 * Módulo 3: DINERO TOTAL desde el LEDGER (rediseño 08/07: "la posta es lo
 * que venimos cargando en Dinero").
 *
 * El héroe es TODA la guita en un número, sumando los bolsillos del ledger
 * Dinero (obra + RAVN): pesos + dólares valuados al blue venta del día — los
 * USD flotan, nunca se congelan en pesos. Las tarjetas quedan afuera: son
 * personales, control nomás (regla 08/07). Abajo, el desglose y el movimiento:
 *  - Caja RAVN: el bolsillo empresa del ledger; de acá salen los retiros.
 *  - Por cobrar: guita que viene a entrar (NO está todavía).
 *  - Comprometido: lo que falta gastar para terminar las obras en curso,
 *    derivado obra por obra (costo estimado − gastado). Es plata del cliente.
 * Lo personal (categorías Salud/Comida/Salidas…) vive en /finanzas.
 */
export function ModuloPlata({ className }: { className?: string }) {
  const [caja, setCaja] = useState<ResumenCaja | null>(null);
  const [dinero, setDinero] = useState<PayloadDinero | null>(null);
  const [fin, setFin] = useState<FinanzasResumen | null>(null);
  const [cuentas, setCuentas] = useState<SaldosCuentas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      // fetchCompartido: /cashflow/resumen y /api/dinero se comparten con
      // ModuloSaludNegocio y ModuloDinero (un solo request por endpoint).
      const [resCaja, resDinero, resFin, resCuentas] = await Promise.all([
        fetchCompartido("/cashflow/resumen"),
        fetchCompartido("/api/dinero"),
        fetchCompartido("/api/finanzas"),
        fetchCompartido("/api/cuentas"),
      ]);
      if (resCaja.ok) setCaja(resCaja.body as ResumenCaja);
      if (resDinero.ok) setDinero(resDinero.body as PayloadDinero);
      if (resFin.ok) setFin(resFin.body as FinanzasResumen);
      if (resCuentas.ok) setCuentas(resCuentas.body as SaldosCuentas);
      if (!resDinero.ok && !resFin.ok) setError("No se pudo cargar la plata.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const blue = caja?.blue_venta ?? null;

  // Bolsillos del ledger por dueño (tarjetas afuera). El total junta obra +
  // RAVN: los pesos directo, los USD al blue del día — sin blue no hay total.
  const totales = useMemo(
    () =>
      dinero && dinero.bolsillos.length > 0
        ? totalesPorDueno(dinero.bolsillos, new Set(dinero.tarjetas ?? []))
        : null,
    [dinero]
  );
  const total = useMemo(() => {
    if (!totales) return null;
    const ars = roundArs2(totales.obra.ars + totales.empresa.ars);
    const usd = roundArs2(totales.obra.usd + totales.empresa.usd);
    const usdEnArs =
      usd === 0 ? 0 : blue && blue > 0 ? roundArs2(usd * blue) : null;
    const totalArs = usdEnArs == null ? null : roundArs2(ars + usdEnArs);
    return { ars, usd, usdEnArs, totalArs };
  }, [totales, blue]);

  const porCobrar = caja?.total_por_cobrar_clientes_ars ?? 0;
  const comprometido = useMemo(
    () => comprometidoDerivado(caja?.obras_activas ?? []),
    [caja]
  );

  const gastosObraHoy = caja?.gastos_obra_hoy_ars ?? 0;
  // Gasto personal de HOY: del ciclo, los que caen en la fecha de hoy (BA).
  const gastadoPersonalHoy = fin
    ? fin.ultimos_gastos
        .filter((g) => g.fecha.slice(0, 10) === hoyIsoBA())
        .reduce((acc, g) => acc + Number(g.monto || 0), 0)
    : 0;
  // Gastos de HOY = obra + personales (spec §4.3). Sin /api/finanzas no se
  // puede armar el total: se muestra "—" en lugar de un número incompleto.
  const gastosHoyTotal = fin ? gastosObraHoy + gastadoPersonalHoy : null;

  return (
    <Panel
      titulo="Dinero"
      className={className}
      accion={
        <Link
          href="/finanzas"
          className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          [FINANZAS] ↑
        </Link>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="space-y-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
            Dinero total (pesos + USD al blue)
          </p>
          {!dinero && !error ? (
            <SkeletonCifra className="mt-2" />
          ) : (
            <p className="mt-1">
              {total?.totalArs != null ? (
                <CifraHeroica
                  className="text-[clamp(28px,2.3vw,44px)] leading-none"
                  tono={total.totalArs < 0 ? "negativo" : "neutro"}
                >
                  {formatMoneyInt(total.totalArs)}
                </CifraHeroica>
              ) : (
                <span className="text-2xl font-light text-cdm-muted">
                  {total && total.usd !== 0 ? "sin blue del día" : "—"}
                </span>
              )}
            </p>
          )}
          {total && totales && (
            <p className="text-[10px] tabular-nums text-cdm-muted">
              RAVN {formatMoneyInt(totales.empresa.ars)} · obras{" "}
              {formatMoneyInt(totales.obra.ars)}
              {total.usd !== 0 && (
                <>
                  {" "}· US$ {formatUsdInt(total.usd)}
                  {total.usdEnArs != null && blue != null && (
                    <>
                      {" "}≈ {formatMoneyInt(total.usdEnArs)} (blue{" "}
                      {formatUsdInt(blue)})
                    </>
                  )}
                </>
              )}
            </p>
          )}
        </div>
        {cuentas && cuentas.cuentas.some((c) => c.activa) && (
          <div className="border-t border-cdm-line pt-3">
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Dónde está
            </p>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
              {cuentas.cuentas
                .filter((c) => c.activa)
                .map((c) => (
                  <li
                    key={c.id}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-cdm-muted">
                      {c.nombre}
                      {c.procedencia === "obra" && (
                        <span
                          className="ml-1 text-[9px] uppercase tracking-[0.08em] text-cdm-muted/60"
                          title="Caja de obra: es plata del cliente, no tuya"
                        >
                          obra
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-cdm-fg">
                      {c.moneda === "USD"
                        ? `US$ ${formatUsdInt(c.saldo)}`
                        : formatMoneyInt(c.saldo)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 border-t border-cdm-line pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Caja RAVN
            </p>
            <p
              className={`text-lg font-light tabular-nums ${
                totales && totales.empresa.ars < 0 ? "text-red-400" : ""
              }`}
            >
              {totales ? formatMoneyInt(totales.empresa.ars) : "—"}
            </p>
            <p className="text-[10px] text-cdm-muted">
              {totales && totales.empresa.usd !== 0
                ? `+ US$ ${formatUsdInt(totales.empresa.usd)} · de acá salen los retiros`
                : "de acá salen los retiros"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Por cobrar
            </p>
            <p className="text-lg font-light tabular-nums text-emerald-400">
              {caja ? formatMoneyInt(porCobrar) : "—"}
            </p>
            <p className="text-[10px] text-cdm-muted">viene, no está</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Comprometido
            </p>
            <p className="text-lg font-light tabular-nums text-red-400">
              {caja ? formatMoneyInt(comprometido.total) : "—"}
            </p>
            <p className="text-[10px] text-cdm-muted">
              {comprometido.obrasSinCosto > 0
                ? `${comprometido.obrasSinCosto} obra${comprometido.obrasSinCosto > 1 ? "s" : ""} sin costo cargado`
                : "falta gastar en obras"}
            </p>
          </div>
        </div>
        <div className="flex items-baseline justify-between border-t border-cdm-line pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Gastos de hoy (obra + personal)
            </p>
            <p className="text-lg font-light tabular-nums">
              {gastosHoyTotal === null ? "—" : formatMoneyInt(gastosHoyTotal)}
            </p>
            <p className="text-[10px] tabular-nums text-cdm-muted">
              Obra {formatMoneyInt(gastosObraHoy)} · Personal{" "}
              {fin ? formatMoneyInt(gastadoPersonalHoy) : "—"}
            </p>
          </div>
          {fin && <PuntoSemaforo s={fin.semaforo} />}
        </div>
      </div>
    </Panel>
  );
}
