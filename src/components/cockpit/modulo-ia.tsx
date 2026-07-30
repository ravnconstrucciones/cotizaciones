"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Panel } from "./panel";
import { SkeletonGlass } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { useRefrescoAlVolver } from "@/hooks/use-refresco-al-volver";
import { formatMoneyInt } from "@/lib/format-currency";
import type { BloqueApi, BloqueSuscripciones } from "@/lib/ia-costos";

/**
 * MÓDULO IA DE RAVN (pedido 29/07) — el gasto de IA partido en dos.
 *
 * Nació de una sorpresa: el fijo "Claude $300.000" parecía gasto de API. No lo
 * era. La card existe para que no se vuelvan a confundir:
 *
 *   IZQUIERDA  suscripciones — fijas, grandes, en dólares.
 *   DERECHA    API por uso  — variable, chica, lo que registra el bot.
 *
 * Los dólares se muestran como dólares y los pesos flotan al blue: nunca se
 * congela un abono en dólares como si fuera un número en pesos.
 */

type PayloadIa = {
  blue_venta: number | null;
  suscripciones: BloqueSuscripciones;
  api: BloqueApi | null;
  ratio: number | null;
  cobertura: { api_registrada: string[]; api_sin_registrar: string[] };
  error?: string;
};

/** USD de abono: enteros, son montos redondos (US$ 100, US$ 20). */
function usdAbono(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

/** USD de API: con centavos, el mes puede ser US$ 0,22. */
function usdApi(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function Lado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
        {rotulo}
      </p>
      {children}
    </div>
  );
}

export function ModuloIa({ className }: { className?: string }) {
  const [data, setData] = useState<PayloadIa | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetchCompartido("/api/ia");
      if (res.ok) {
        setData(res.body as PayloadIa);
        setError(null);
      } else {
        setError("No se pudo cargar el gasto de IA.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRefrescoAlVolver(cargar);

  const sus = data?.suscripciones ?? null;
  const api = data?.api ?? null;

  return (
    <Panel titulo="IA de RAVN" className={className}>
      {error && <p className="text-[12px] text-red-500">{error}</p>}
      {!error && !data && (
        <SkeletonGlass filas={3} anchos={["w-full", "w-2/3", "w-1/2"]} />
      )}

      {data && (
        <div className="space-y-5">
          {/* ── LOS DOS LADOS ── */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Suscripciones: el número grande, en dólares. */}
            <Lado rotulo="Suscripciones · por mes">
              <p className="mt-1 text-[clamp(24px,2.6vw,34px)] font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                US$ {sus ? usdAbono(sus.total_usd) : "—"}
              </p>
              <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {sus?.total_ars != null
                  ? `${formatMoneyInt(sus.total_ars)} al blue${data.blue_venta ? ` (${formatMoneyInt(data.blue_venta)})` : ""}`
                  : "sin cotización del blue"}
              </p>

              <ul className="mt-3 space-y-1.5">
                {(sus?.items ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-baseline justify-between gap-2 text-[12px]"
                  >
                    <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                      {s.nombre}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-200">
                      {s.usd_mes == null
                        ? "—"
                        : `US$ ${usdAbono(s.usd_mes)}`}
                    </span>
                  </li>
                ))}
                {(sus?.items.length ?? 0) === 0 && (
                  <li className="text-[11px] text-zinc-400">
                    Sin suscripciones de IA cargadas.
                  </li>
                )}
              </ul>
            </Lado>

            {/* API por uso: el número chico, el que de verdad escala. */}
            <Lado rotulo="API por uso · mes en curso">
              <p className="mt-1 text-[clamp(24px,2.6vw,34px)] font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                {api ? `US$ ${usdApi(api.mes_usd)}` : "—"}
              </p>
              <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                {api
                  ? `hoy US$ ${usdApi(api.hoy_usd)} · ${api.mes_llamadas} llamada${api.mes_llamadas === 1 ? "" : "s"} en el mes`
                  : "sin registro de uso"}
              </p>

              <ul className="mt-3 space-y-1.5">
                {(api?.por_servicio ?? []).map((s) => (
                  <li
                    key={s.servicio}
                    className="flex items-baseline justify-between gap-2 text-[12px]"
                  >
                    <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                      {s.servicio}
                      <span className="text-zinc-400"> · {s.llamadas}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-200">
                      US$ {usdApi(s.usd)}
                    </span>
                  </li>
                ))}
                {(api?.por_servicio.length ?? 0) === 0 && (
                  <li className="text-[11px] text-zinc-400">
                    Todavía no hay llamadas registradas este mes.
                  </li>
                )}
              </ul>
            </Lado>
          </div>

          {/* ── LA RELACIÓN: por qué la card existe ── */}
          {data.ratio != null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="border-t border-zinc-950/[0.06] pt-4 dark:border-white/[0.06]"
            >
              <p className="text-[12px] text-zinc-600 dark:text-zinc-300">
                El abono pesa{" "}
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {new Intl.NumberFormat("es-AR", {
                    maximumFractionDigits: 0,
                  }).format(data.ratio)}
                  ×
                </span>{" "}
                lo que se gasta de API por uso. El costo de IA es la suscripción,
                no el consumo.
              </p>
            </motion.div>
          )}

          {/* Honestidad de alcance: qué NO está medido acá. */}
          {data.cobertura.api_sin_registrar.length > 0 && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              El uso medido es sólo {data.cobertura.api_registrada.join(", ")}.
              Sin registrar: {data.cobertura.api_sin_registrar.join(", ")}.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
