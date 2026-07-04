"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { VolverAlInicio } from "@/components/volver-al-inicio";
import { formatMoneyInt } from "@/lib/format-currency";
import type { MesEmpresa } from "@/lib/gastos-empresa";
import { CATEGORIA_DOT, CalendarioEmpresa } from "./calendario-empresa";

/**
 * /empresa — LOS GASTOS DEL NEGOCIO, día por día.
 *
 * Reemplaza a la vieja "libreta empresa" (que Eze no usaba): un calendario
 * del mes con cada gasto de la empresa (NO de obras) y el desglose por
 * categoría — Fijo / Variable / Herramientas / Indumentaria — para saber
 * cuánto cuesta tener la empresa abierta. Los datos entran por el bot de
 * WhatsApp ("20 dólares de rendair, empresa") y acá se leen.
 */

const CARD = "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5";

const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function hoyAR(): string {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function mesVecino(mes: string, delta: number): string {
  const [anio, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(anio!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function labelMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return `${MESES_LARGOS[(m ?? 1) - 1]} ${anio}`;
}

export function EmpresaScreen() {
  const hoy = hoyAR();
  const mesActual = hoy.slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const [data, setData] = useState<MesEmpresa | null>(null);
  const [estado, setEstado] = useState<"cargando" | "ok" | "error">("cargando");

  // mesVivo evita la carrera al saltar de mes rápido: una respuesta vieja que
  // llega tarde no pisa los datos (ni el estado) del mes que se está viendo.
  const mesVivo = useRef(mes);

  const cargar = useCallback((m: string) => {
    setEstado("cargando");
    fetch(`/api/gastos-empresa?mes=${m}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: MesEmpresa) => {
        if (mesVivo.current !== m) return;
        setData(body);
        setEstado("ok");
      })
      .catch(() => {
        if (mesVivo.current === m) setEstado("error");
      });
  }, []);

  useEffect(() => {
    mesVivo.current = mes;
    cargar(mes);
  }, [mes, cargar]);

  return (
    <main className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <div className="mx-auto w-full max-w-lg">
        <VolverAlInicio />

        {/* Header */}
        <div className="pt-4 pb-6">
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Gastos de empresa
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Lo que cuesta tener el negocio abierto — sin obras
          </p>
        </div>

        {/* HERO: total del mes + navegación */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`${CARD} border-l-2 border-l-amber-300/40`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMes(mesVecino(mes, -1))}
              className="flex h-11 w-11 items-center justify-center rounded-full text-cdm-muted transition-colors hover:bg-cdm-fg/[0.06] hover:text-cdm-fg"
              aria-label="Mes anterior"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="font-mono-hud text-[11px] uppercase tracking-[0.18em] text-cdm-fg">
              {labelMes(mes)}
            </span>
            <button
              type="button"
              onClick={() => setMes(mesVecino(mes, 1))}
              disabled={mes >= mesActual}
              className="flex h-11 w-11 items-center justify-center rounded-full text-cdm-muted transition-colors hover:bg-cdm-fg/[0.06] hover:text-cdm-fg disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Mes siguiente"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>

          <div className="mt-3 text-center">
            <span className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
              La empresa gastó
            </span>
            <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
              <span className="font-geist tabular-nums text-[clamp(32px,6vw,44px)] leading-none font-semibold text-cdm-fg">
                {estado === "cargando" ? "—" : formatMoneyInt(data?.total_ars ?? 0)}
              </span>
              {(data?.total_usd ?? 0) > 0 && (
                <span className="font-geist tabular-nums text-lg font-medium text-emerald-400">
                  + US${Math.round(data!.total_usd).toLocaleString("es-AR")}
                </span>
              )}
            </div>
            {estado === "ok" && (
              <p className="font-mono-hud mt-2 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                {data!.cantidad === 0
                  ? "Sin gastos este mes"
                  : `${data!.cantidad} gasto${data!.cantidad === 1 ? "" : "s"} en el mes`}
              </p>
            )}
          </div>
        </motion.div>

        {estado === "error" && (
          <div className={`${CARD} mt-3`}>
            <p className="font-mono-hud text-[11px] text-cdm-muted">
              No se pudieron leer los gastos ahora.{" "}
              <button
                type="button"
                onClick={() => cargar(mes)}
                className="text-cdm-accent underline-offset-2 hover:underline"
              >
                Reintentar
              </button>
            </p>
          </div>
        )}

        {estado !== "error" && (
          <>
            {/* Desglose por categoría */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.06 }}
              className={`${CARD} mt-3`}
            >
              <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
                Por categoría
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                {(data?.por_categoria ?? []).map((c) => (
                  <div key={c.categoria}>
                    <dt className="font-mono-hud flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${CATEGORIA_DOT[c.categoria]}`} />
                      {c.categoria}
                    </dt>
                    <dd className="font-geist mt-0.5 tabular-nums font-medium text-cdm-fg">
                      {formatMoneyInt(c.total_ars)}
                      {c.total_usd > 0 && (
                        <span className="ml-1.5 text-[11px] text-emerald-400">
                          + US${Math.round(c.total_usd).toLocaleString("es-AR")}
                        </span>
                      )}
                    </dd>
                    <dd className="font-mono-hud text-[9px] uppercase tracking-[0.1em] text-cdm-muted/70">
                      {c.cantidad === 0 ? "sin gastos" : `${c.cantidad} gasto${c.cantidad === 1 ? "" : "s"}`}
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>

            {/* Calendario día por día */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.12 }}
              className={`${CARD} mt-3`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
                  Día por día
                </h2>
                <span className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted/70">
                  Tocá un día
                </span>
              </div>
              <div className="mt-3">
                {estado === "cargando" ? (
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 35 }, (_, i) => (
                      <div key={i} className="min-h-[52px] animate-pulse rounded-[12px] bg-cdm-fg/[0.04]" />
                    ))}
                  </div>
                ) : (
                  <CalendarioEmpresa dias={data?.dias ?? []} hoyIso={hoy} />
                )}
              </div>
              {estado === "ok" && data!.cantidad === 0 && (
                <p className="font-mono-hud mt-4 border-t border-cdm-line pt-4 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                  Todavía no hay gastos de empresa este mes. Se cargan por WhatsApp:
                  &ldquo;20 lucas de mechas, empresa&rdquo;.
                </p>
              )}
            </motion.div>
          </>
        )}
      </div>
    </main>
  );
}
