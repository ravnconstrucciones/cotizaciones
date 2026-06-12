"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { CifraHeroica } from "./cifra-heroica";
import { SkeletonCifra } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt } from "@/lib/format-currency";

type Semaforo = "verde" | "amarillo" | "rojo";

/** Bloque `caja_mes` agregado a /cashflow/resumen en la extensión de Task 12. */
type CajaMes = {
  mes: string;
  ingresos: number;
  egresos: number;
  saldo: number;
};

type ResumenCaja = {
  caja_mes?: CajaMes;
  gastos_obra_hoy_ars?: number;
};

type FinanzasResumen = {
  gastado_hoy: number;
  total_mes: number;
  presupuesto_mensual: number;
  semaforo_dia: Semaforo;
  semaforo_mes: Semaforo;
};

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

/** Módulo 3: cashflow del mes + gastos de hoy (obra + personales) + semáforo (spec §4.3). */
export function ModuloPlata({ className }: { className?: string }) {
  const [caja, setCaja] = useState<ResumenCaja | null>(null);
  const [fin, setFin] = useState<FinanzasResumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      // fetchCompartido: /cashflow/resumen se comparte con ModuloObras
      // (un solo request) y ambos consumen el prefetch del documento.
      const [resCaja, resFin] = await Promise.all([
        fetchCompartido("/cashflow/resumen"),
        fetchCompartido("/api/finanzas"),
      ]);
      if (resCaja.ok) setCaja(resCaja.body as ResumenCaja);
      if (resFin.ok) setFin(resFin.body as FinanzasResumen);
      if (!resCaja.ok && !resFin.ok) setError("No se pudo cargar la plata.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const gastosObraHoy = caja?.gastos_obra_hoy_ars ?? 0;
  // Gastos de HOY = obra + personales (spec §4.3). Sin /api/finanzas no se
  // puede armar el total: se muestra "—" en lugar de un número incompleto.
  const gastosHoyTotal = fin ? gastosObraHoy + fin.gastado_hoy : null;

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
            Cashflow del mes (obras)
          </p>
          {/* Display heroico (iteración 3): la plata del mes manda en el panel. */}
          {!caja && !error ? (
            <SkeletonCifra className="mt-2" />
          ) : (
            <p className="mt-1">
              {caja?.caja_mes ? (
                <CifraHeroica
                  className="text-[clamp(28px,2.3vw,44px)] leading-none"
                  colorBase={
                    caja.caja_mes.saldo < 0 ? "#f87171" : "var(--cdm-fg)"
                  }
                >
                  {formatMoneyInt(caja.caja_mes.saldo)}
                </CifraHeroica>
              ) : (
                <span className="text-2xl font-light text-cdm-muted">—</span>
              )}
            </p>
          )}
          {caja?.caja_mes && (
            <p className="text-[10px] tabular-nums text-cdm-muted">
              <span className="text-emerald-400">
                ↑ {formatMoneyInt(caja.caja_mes.ingresos)}
              </span>
              {" · "}
              <span className="text-red-400">
                ↓ {formatMoneyInt(caja.caja_mes.egresos)}
              </span>
            </p>
          )}
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
              {fin ? formatMoneyInt(fin.gastado_hoy) : "—"}
            </p>
          </div>
          {fin && <PuntoSemaforo s={fin.semaforo_dia} />}
        </div>
        <div className="flex items-baseline justify-between border-t border-cdm-line pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Mes personal
            </p>
            <p className="text-lg font-light tabular-nums">
              {fin ? formatMoneyInt(fin.total_mes) : "—"}
              {fin && (
                <span className="text-[10px] text-cdm-muted">
                  {" "}
                  / {formatMoneyInt(fin.presupuesto_mensual)}
                </span>
              )}
            </p>
          </div>
          {fin && <PuntoSemaforo s={fin.semaforo_mes} />}
        </div>
      </div>
    </Panel>
  );
}
