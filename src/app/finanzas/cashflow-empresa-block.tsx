"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";
import { fetchCompartido } from "@/lib/fetch-compartido";

/**
 * BLOQUE — Cashflow del negocio (compacto).
 *
 * La foto rápida de la EMPRESA dentro de la libreta personal: mundos separados.
 * Pendiente de cobro arriba (lo que entra), caja en pesos + dólares, e ingresado
 * vs gastado del mes. No edita nada — linkea a `/cashflow` para el detalle.
 *
 * Datos: `/cashflow/resumen` (el mismo endpoint compartido que usa Salud del
 * Negocio). La plata en USD se cuenta en USD y se valúa al blue del día.
 */

type ObraPorCobrar = {
  obra_id: string;
  nombre_obra?: string | null;
  nombre_cliente?: string | null;
  saldo_por_cobrar_ars?: number | null;
  monto_total_a_cobrar_usd?: number | null;
};

type ResumenCashflow = {
  caja_mes?: { mes: string; ingresos: number; egresos: number; saldo: number };
  saldo_caja_total?: number;
  caja_obras_usd?: number;
  blue_venta?: number | null;
  total_por_cobrar_clientes_ars?: number;
  obras_activas?: ObraPorCobrar[];
  error?: string;
};

const CARD = "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5";

function fmtUsd(n: number): string {
  return `US$${Math.round(n).toLocaleString("es-AR")}`;
}

export function CashflowEmpresaBlock() {
  const [data, setData] = useState<ResumenCashflow | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  useEffect(() => {
    let vivo = true;
    fetchCompartido("/cashflow/resumen")
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.body && typeof r.body === "object") {
          setData(r.body as ResumenCashflow);
          setEstado("ok");
        } else {
          setEstado("error");
        }
      })
      .catch(() => vivo && setEstado("error"));
    return () => {
      vivo = false;
    };
  }, []);

  const cajaPesos = data?.saldo_caja_total ?? 0;
  const cajaUsd = data?.caja_obras_usd ?? 0;
  const blue = data?.blue_venta ?? null;
  const cajaUsdArs = blue ? cajaUsd * blue : 0;
  const ingresos = data?.caja_mes?.ingresos ?? 0;
  const egresos = data?.caja_mes?.egresos ?? 0;
  const porCobrar = data?.total_por_cobrar_clientes_ars ?? 0;
  const obrasPorCobrar = (data?.obras_activas ?? [])
    .map((o) => ({
      id: o.obra_id,
      nombre: o.nombre_obra?.trim() || o.nombre_cliente?.trim() || "Obra",
      saldo: o.saldo_por_cobrar_ars ?? 0,
      usd: (o.monto_total_a_cobrar_usd ?? 0) > 0,
    }))
    .filter((o) => o.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`${CARD} mt-3 border-l-2 border-l-cdm-accent/40`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
          El negocio · cashflow
        </h2>
        <Link
          href="/cashflow"
          className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-accent transition-colors hover:text-cdm-fg"
        >
          Ver →
        </Link>
      </div>
      <p className="font-mono-hud mt-1 text-[10px] text-cdm-muted/80">
        Plata de la empresa — separada de la tuya. Lo que te pagás a vos mismo es un retiro.
      </p>

      {estado === "error" && (
        <p className="font-mono-hud mt-4 text-[11px] text-cdm-muted">
          No se pudo leer el cashflow ahora.
        </p>
      )}

      {estado !== "error" && (
        <>
          {/* Pendiente de cobro — arriba, destacado */}
          <div className="mt-4 border-b border-cdm-line pb-4">
            <span className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
              Pendiente de cobro
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-geist tabular-nums text-[clamp(26px,5vw,34px)] leading-none font-semibold text-cdm-accent">
                {estado === "cargando" ? "—" : formatMoneyInt(porCobrar)}
              </span>
              <span className="font-mono-hud text-[11px] text-cdm-muted">clientes</span>
            </div>
            {estado === "ok" && obrasPorCobrar.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {obrasPorCobrar.map((o) => (
                  <li key={o.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="font-geist text-cdm-muted">
                      {o.nombre}
                      {o.usd && (
                        <span className="ml-1.5 font-mono-hud text-[8.5px] uppercase tracking-[0.08em] text-cdm-accent/70">
                          USD · flota al blue
                        </span>
                      )}
                    </span>
                    <span className="font-geist tabular-nums text-cdm-fg">{formatMoneyInt(o.saldo)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Caja pesos + USD */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <dt className="font-mono-hud text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                Caja en pesos
              </dt>
              <dd className="font-geist tabular-nums font-medium text-cdm-fg">
                {estado === "cargando" ? "—" : formatMoneyInt(cajaPesos)}
              </dd>
            </div>
            <div>
              <dt className="font-mono-hud text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                Caja en dólares
              </dt>
              <dd className="font-geist tabular-nums font-medium text-cdm-fg">
                {estado === "cargando" ? "—" : cajaUsd > 0 ? fmtUsd(cajaUsd) : "US$0"}
              </dd>
              {cajaUsd > 0 && blue && (
                <dd className="font-mono-hud text-[10px] text-cdm-muted">
                  ≈ {formatMoneyInt(cajaUsdArs)} · blue {formatMoneyInt(blue)}
                </dd>
              )}
            </div>
          </dl>

          {/* Ingresado vs gastado del mes */}
          <div className="mt-4 flex items-center justify-between border-t border-cdm-line pt-3 text-[12px]">
            <div>
              <div className="font-mono-hud text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                Ingresó este mes
              </div>
              <div className="font-geist tabular-nums font-medium text-emerald-400">
                {estado === "cargando" ? "—" : formatMoneyInt(ingresos)}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono-hud text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                Gastó este mes
              </div>
              <div className="font-geist tabular-nums font-medium text-cdm-fg">
                {estado === "cargando" ? "—" : formatMoneyInt(egresos)}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
