"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { SkeletonGlass } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt } from "@/lib/format-currency";

/**
 * MÓDULO FINANZAS PERSONALES — la libreta personal de Eze, hermana de "Salud
 * del negocio". El número estrella ("cuánto podés gastar hoy") con su semáforo
 * y la línea del ciclo de la tarjeta; el detalle vive en /finanzas.
 */

type Semaforo = "verde" | "amarillo" | "rojo";

type ResumenFinanzas = {
  ciclo: { label: string; dia_actual: number; dias_total: number };
  asignacion_diaria: number;
  disponible_ciclo: number;
  disponible_hoy: number;
  ritmo_semanal: number;
  semaforo: Semaforo;
  error?: string;
};

const DOT: Record<Semaforo, string> = {
  verde: "bg-emerald-500",
  amarillo: "bg-amber-400",
  rojo: "bg-red-500",
};
const SEM_TEXT: Record<Semaforo, string> = {
  verde: "text-emerald-600 dark:text-emerald-400",
  amarillo: "text-amber-600 dark:text-amber-400",
  rojo: "text-red-600 dark:text-red-400",
};

export function ModuloFinanzas({ className }: { className?: string }) {
  const [data, setData] = useState<ResumenFinanzas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetchCompartido("/api/finanzas");
      if (res.ok) {
        setData(res.body as ResumenFinanzas);
        setError(null);
      } else {
        setError("No se pudo cargar el presupuesto personal.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <Panel
      titulo="Finanzas personales"
      className={className}
      accion={
        <Link
          href="/finanzas"
          className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300"
        >
          Mi libreta →
        </Link>
      }
    >
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {!error && !data && (
        <SkeletonGlass filas={2} anchos={["w-2/3", "w-1/2"]} />
      )}

      {data && (
        <div>
          <div className="flex items-center gap-2">
            <motion.span
              animate={data.semaforo === "rojo" ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
              transition={{ repeat: Infinity, duration: 1.3 }}
              className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[data.semaforo]}`}
            />
            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              Hoy podés gastar
            </span>
          </div>
          <p className={`mt-1 text-[clamp(26px,3vw,38px)] font-semibold tabular-nums tracking-tight ${SEM_TEXT[data.semaforo]}`}>
            {formatMoneyInt(data.disponible_hoy)} <span className="text-[14px] font-normal text-zinc-500 dark:text-zinc-400">/ día</span>
          </p>
          <p className="mt-1 text-[12px] tabular-nums text-zinc-500 dark:text-zinc-400">
            Te quedan {formatMoneyInt(data.disponible_ciclo)} hasta el cierre
          </p>
          <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            Ciclo {data.ciclo.label} · día {data.ciclo.dia_actual}/{data.ciclo.dias_total}
          </p>
        </div>
      )}
    </Panel>
  );
}
