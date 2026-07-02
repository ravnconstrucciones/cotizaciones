"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { CifraHeroica } from "./cifra-heroica";
import { SkeletonCifra } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt } from "@/lib/format-currency";
import {
  guitaTotal,
  comprometidoDerivado,
  type ObraResumen,
  type RetirosResumen,
} from "@/lib/salud-negocio";

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

/** De /api/negocio/config: retiros netos + patrimonio (pesos y USD) para el total. */
type ConfigPayload = {
  config?: {
    patrimonio_neto_inicial_ars?: number;
    patrimonio_neto_inicial_usd?: number;
  };
  retiros?: RetirosResumen;
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
 * Módulo 3: GUITA TOTAL (rediseño 02/07: "contá todo lo que tenemos").
 *
 * El héroe es TODA la guita en un número: patrimonio personal en pesos +
 * caja de la empresa (obras − retiros netos) + los dólares (patrimonio USD +
 * cobros de obra en billete) valuados al blue venta del día — los USD flotan,
 * nunca se congelan en pesos. Abajo, el desglose y el movimiento:
 *  - Caja empresa: lo que queda de las obras; de acá salen los retiros.
 *  - Por cobrar: guita que viene a entrar (NO está todavía).
 *  - Comprometido: lo que falta gastar para terminar las obras en curso,
 *    derivado obra por obra (costo estimado − gastado). Es plata del cliente.
 * Lo personal (categorías Salud/Comida/Salidas…) vive en /finanzas.
 */
export function ModuloPlata({ className }: { className?: string }) {
  const [caja, setCaja] = useState<ResumenCaja | null>(null);
  const [cfgPayload, setCfgPayload] = useState<ConfigPayload | null>(null);
  const [fin, setFin] = useState<FinanzasResumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      // fetchCompartido: /cashflow/resumen y /api/negocio/config se comparten
      // con ModuloSaludNegocio (un solo request por endpoint).
      const [resCaja, resCfg, resFin] = await Promise.all([
        fetchCompartido("/cashflow/resumen"),
        fetchCompartido("/api/negocio/config"),
        fetchCompartido("/api/finanzas"),
      ]);
      if (resCaja.ok) setCaja(resCaja.body as ResumenCaja);
      if (resCfg.ok) setCfgPayload(resCfg.body as ConfigPayload);
      if (resFin.ok) setFin(resFin.body as FinanzasResumen);
      if (!resCaja.ok && !resFin.ok) setError("No se pudo cargar la plata.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const total = useMemo(() => {
    if (!caja) return null;
    return guitaTotal({
      patrimonioArs: cfgPayload?.config?.patrimonio_neto_inicial_ars ?? 0,
      saldoCajaObras: caja.saldo_caja_total ?? 0,
      retirosNetoTotal: cfgPayload?.retiros?.neto_total ?? 0,
      usd:
        (cfgPayload?.config?.patrimonio_neto_inicial_usd ?? 0) +
        (caja.caja_obras_usd ?? 0),
      blue: caja.blue_venta ?? null,
    });
  }, [caja, cfgPayload]);
  const blue = caja?.blue_venta ?? null;

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
      titulo="Plata"
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
            Guita total (pesos + USD al blue)
          </p>
          {!caja && !error ? (
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
                  {total && total.usd > 0 ? "sin blue del día" : "—"}
                </span>
              )}
            </p>
          )}
          {total && (
            <p className="text-[10px] tabular-nums text-cdm-muted">
              personal {formatMoneyInt(total.patrimonioArs)} · empresa{" "}
              {formatMoneyInt(total.cajaEmpresaArs)}
              {total.usd > 0 && (
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
        <div className="grid grid-cols-3 gap-3 border-t border-cdm-line pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Caja empresa
            </p>
            <p className="text-lg font-light tabular-nums">
              {total ? formatMoneyInt(total.cajaEmpresaArs) : "—"}
            </p>
            <p className="text-[10px] text-cdm-muted">
              de acá salen los retiros
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
