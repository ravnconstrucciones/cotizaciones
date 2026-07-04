"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";
import type { CategoriaEmpresa, DiaEmpresa } from "@/lib/gastos-empresa";

/**
 * CALENDARIO DE EMPRESA — los gastos del negocio día por día.
 *
 * Hermano del CalendarioCiclo de /finanzas, pero acá no hay presupuesto ni
 * verde/rojo: cada celda muestra cuánto gastó la EMPRESA ese día. Día con
 * gasto = ámbar (la identidad de "empresa" en el sistema); hoy resaltado;
 * futuro apagado. Tocás un día y se abre la lista con la categoría de cada
 * gasto (Fijo/Variable/Herramientas/Indumentaria).
 */

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

const MESES_ABR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Punto de color por categoría — siempre acompañado del label (nunca color solo). */
export const CATEGORIA_DOT: Record<CategoriaEmpresa, string> = {
  Fijo: "bg-sky-400",
  Variable: "bg-amber-300",
  Herramientas: "bg-emerald-400",
  Indumentaria: "bg-fuchsia-400",
};

function columnaDe(fechaIso: string): number {
  return (new Date(`${fechaIso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function diaDelMes(fechaIso: string): number {
  return Number(fechaIso.slice(8, 10));
}

function fechaLarga(fechaIso: string): string {
  const [, m, d] = fechaIso.split("-").map(Number);
  return `${d} ${MESES_ABR[(m ?? 1) - 1]}`;
}

/** Monto compacto para la celda: 46k / 1,2M / 800. */
function fmtCompacto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = (abs / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "");
    return `${v}M`;
  }
  if (abs >= 1000) return `${Math.round(abs / 1000)}k`;
  return `${Math.round(abs)}`;
}

type EstadoDia = "con-gasto" | "sin-gasto" | "futuro";

function estadoDe(d: DiaEmpresa, hoyIso: string): EstadoDia {
  if (d.fecha > hoyIso) return "futuro";
  return d.gastos.length > 0 ? "con-gasto" : "sin-gasto";
}

function estiloCelda(estado: EstadoDia, esHoy: boolean, seleccionado: boolean): string {
  const base =
    "flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] transition-colors";
  const sel = seleccionado ? " ring-2 ring-cdm-accent" : esHoy ? " ring-1 ring-cdm-accent/60" : " ring-1 ring-transparent";
  switch (estado) {
    case "con-gasto":
      return `${base}${sel} bg-amber-400/10 hover:bg-amber-400/20`;
    case "futuro":
      return `${base}${sel} bg-transparent`;
    default:
      return `${base}${sel} bg-cdm-fg/[0.03] hover:bg-cdm-fg/[0.07]`;
  }
}

export function CalendarioEmpresa({ dias, hoyIso }: { dias: DiaEmpresa[]; hoyIso: string }) {
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const dia = dias.find((d) => d.fecha === seleccion) ?? null;
  const offset = dias.length > 0 ? columnaDe(dias[0]!.fecha) : 0;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS_SEMANA.map((n, i) => (
          <span
            key={`${n}-${i}`}
            className="font-mono-hud pb-1 text-center text-[9px] uppercase tracking-widest text-cdm-muted/70"
          >
            {n}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {dias.map((d) => {
          const estado = estadoDe(d, hoyIso);
          const esHoy = d.fecha === hoyIso;
          return (
            <button
              key={d.fecha}
              type="button"
              onClick={() => setSeleccion(seleccion === d.fecha ? null : d.fecha)}
              className={estiloCelda(estado, esHoy, seleccion === d.fecha)}
              aria-label={`${fechaLarga(d.fecha)}: ${
                d.gastos.length > 0
                  ? `${d.gastos.length} gasto${d.gastos.length === 1 ? "" : "s"}, ${[
                      d.total_ars > 0 ? formatMoneyInt(d.total_ars) : null,
                      d.total_usd > 0 ? `US$${Math.round(d.total_usd).toLocaleString("es-AR")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")}`
                  : estado === "futuro"
                    ? "todavía no llegó"
                    : "sin gastos"
              }`}
            >
              <span
                className={`font-geist text-[12px] font-medium tabular-nums leading-none ${
                  estado === "futuro" ? "text-cdm-muted/50" : "text-cdm-fg"
                }`}
              >
                {diaDelMes(d.fecha)}
              </span>
              <span className="font-mono-hud text-[9px] tabular-nums leading-none text-amber-300">
                {/* Pesos en la celda; día solo-USD marca "U$" — nunca sumar monedas. */}
                {estado === "con-gasto"
                  ? d.total_ars > 0
                    ? `${fmtCompacto(d.total_ars)}${d.total_usd > 0 ? "+U$" : ""}`
                    : `U$${fmtCompacto(d.total_usd)}`
                  : "\u00a0"}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {dia && (
          <motion.div
            key={dia.fecha}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-4 border-t border-cdm-line pt-4"
          >
            <div className="flex items-baseline justify-between">
              <span className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-fg">
                {fechaLarga(dia.fecha)}
                {dia.fecha === hoyIso ? " · hoy" : ""}
              </span>
              <span className="font-geist text-[12px] font-semibold tabular-nums text-cdm-fg">
                {dia.total_ars > 0 ? formatMoneyInt(dia.total_ars) : null}
                {dia.total_usd > 0 ? (
                  <span className="ml-2 text-emerald-400">
                    US${Math.round(dia.total_usd).toLocaleString("es-AR")}
                  </span>
                ) : null}
              </span>
            </div>

            {dia.gastos.length > 0 ? (
              <ul className="mt-3 divide-y divide-cdm-line">
                {dia.gastos.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-baseline justify-between gap-3 py-2 text-[11px]"
                  >
                    <div>
                      <div className="font-geist text-cdm-fg">{g.concepto}</div>
                      <div className="font-mono-hud mt-0.5 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.1em] text-cdm-muted">
                        <span className={`h-1.5 w-1.5 rounded-full ${CATEGORIA_DOT[g.categoria]}`} />
                        {g.categoria}
                      </div>
                    </div>
                    <span className="font-geist tabular-nums font-medium text-cdm-fg">
                      {g.moneda === "USD"
                        ? `US$${Math.round(g.monto).toLocaleString("es-AR")}`
                        : formatMoneyInt(g.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono-hud mt-3 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                {dia.fecha > hoyIso ? "Todavía no llegó." : "La empresa no gastó ese día."}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
