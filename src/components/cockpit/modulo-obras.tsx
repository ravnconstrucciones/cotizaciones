"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Panel } from "./panel";
import { SkeletonGlass } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt } from "@/lib/format-currency";

type ObraActiva = {
  obra_id: string;
  /** Las rutas /obras/[id] usan presupuesto_id (convención de la app). */
  presupuesto_id: string;
  nombre_obra: string;
  ingresos_caja: number;
  egresos_caja: number;
  saldo_caja: number;
  cobranza_cerrada?: boolean;
  /** Campos agregados por la extensión de /cashflow/resumen (Task 12). */
  finalizada: boolean;
  margen_al_dia_ars: number | null;
};

type MovimientoReciente = {
  obra_id: string;
  tipo: "ingreso" | "egreso";
  descripcion: string;
  monto_real: number;
  fecha_real: string;
};

type ResumenCashflow = {
  saldo_caja_total: number;
  obras_activas: ObraActiva[];
  movimientos_recientes?: MovimientoReciente[];
};

function estadoObra(o: ObraActiva): { label: string; cls: string } {
  if (o.cobranza_cerrada) return { label: "Cobranza cerrada", cls: "text-cdm-accent" };
  if (o.finalizada) return { label: "Finalizada", cls: "text-amber-300" };
  return { label: "En curso", cls: "text-emerald-400" };
}

/** Módulo 2: obras activas con estado, margen al día y último gasto (spec §4.2). */
export function ModuloObras({ className }: { className?: string }) {
  const [data, setData] = useState<ResumenCashflow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      // fetchCompartido: comparte el request con ModuloPlata (antes eran
      // dos hits idénticos a /cashflow/resumen) y consume el prefetch
      // inline del documento si está fresco (ronda 6).
      const res = await fetchCompartido("/cashflow/resumen");
      const j = res.body as ResumenCashflow & { error?: string };
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el resumen.");
        return;
      }
      setError(null);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ultimoEgresoDe = (obraId: string) =>
    data?.movimientos_recientes?.find(
      (m) => m.obra_id === obraId && m.tipo === "egreso"
    );

  return (
    <Panel
      titulo="Obras"
      className={className}
      accion={
        <span className="flex items-baseline gap-3">
          <Link
            href="/obras"
            className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [PROYECTOS] ↑
          </Link>
          <Link
            href="/cashflow"
            className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
          >
            [CASHFLOW] ↑
          </Link>
        </span>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && !data && (
        <SkeletonGlass
          filas={5}
          anchos={["w-3/4", "w-1/2", "w-full", "w-2/3", "w-2/5"]}
        />
      )}
      {data && data.obras_activas.length === 0 && (
        <p className="text-[11px] text-cdm-muted">Sin obras activas.</p>
      )}
      <ul className="space-y-3">
        {data?.obras_activas.map((o) => {
          const ultimo = ultimoEgresoDe(o.obra_id);
          const estado = estadoObra(o);
          return (
            <li key={o.obra_id} className="border-b border-cdm-line pb-2 last:border-0">
              <div className="flex items-baseline justify-between gap-2">
                {/* Cada obra abre su orbital (rubros + % ejecutado). */}
                <Link
                  href={`/obras/${o.presupuesto_id}`}
                  className="truncate text-xs text-cdm-fg transition-colors hover:text-cdm-accent"
                >
                  {o.nombre_obra}
                </Link>
                <span
                  className={`shrink-0 text-[9px] uppercase tracking-[0.15em] ${estado.cls}`}
                >
                  {estado.label}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2 text-[10px]">
                <span className="text-cdm-muted">
                  Margen al día:{" "}
                  {o.margen_al_dia_ars === null ? (
                    "sin propuesta"
                  ) : (
                    <span
                      className={`tabular-nums ${
                        o.margen_al_dia_ars >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatMoneyInt(o.margen_al_dia_ars)}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 tabular-nums ${
                    o.saldo_caja >= 0 ? "text-cdm-fg/70" : "text-red-400"
                  }`}
                >
                  Caja {formatMoneyInt(o.saldo_caja)}
                </span>
              </div>
              {ultimo && (
                <p className="mt-0.5 truncate text-[10px] text-cdm-muted">
                  Último gasto: {ultimo.descripcion} · {formatMoneyInt(ultimo.monto_real)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
