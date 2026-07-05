"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";

/**
 * CALENDARIO DEL CICLO — el historial día por día de la tarjeta.
 *
 * Cada celda es un día del ciclo (26 → 25): verde si ese día sobró plata, rojo
 * si se pasó, HOY resaltado, y los días futuros apagados. El número de la
 * celda es la ALCANCÍA acumulada al cierre de ese día (en los futuros, la
 * proyección si no gastás más). Tocás un día y se abre el detalle: asignación,
 * gastado, saldo del día, alcancía y la lista de gastos. Todo se reconstruye
 * del motor (`lib/finanzas-personal.ts`) — acá solo se dibuja.
 */

export type DiaCiclo = {
  fecha: string; // YYYY-MM-DD
  dia_ciclo: number;
  presupuesto: number;
  gastado: number;
  saldo: number;
  ahorrado_acum: number;
  estado: "verde" | "rojo" | "hoy" | "futuro";
  gastos: Array<{
    id: string;
    fecha: string;
    concepto: string;
    monto: number;
    categoria: string;
  }>;
};

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

const MESES_ABR = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Columna lunes-primero de una fecha ISO (0 = lunes … 6 = domingo). */
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

/** Monto compacto para la celda: 46k / 1,2M / 800. Sin signo (va aparte). */
function fmtCompacto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = (abs / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "");
    return `${v}M`;
  }
  if (abs >= 1000) return `${Math.round(abs / 1000)}k`;
  return `${Math.round(abs)}`;
}

function estiloCelda(d: DiaCiclo, seleccionado: boolean): string {
  const base =
    "flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[12px] transition-colors";
  const sel = seleccionado ? " ring-2 ring-cdm-accent" : " ring-1 ring-transparent";
  switch (d.estado) {
    case "rojo":
      return `${base}${sel} bg-red-500/10 hover:bg-red-500/20`;
    case "verde":
      return `${base}${sel} bg-emerald-500/10 hover:bg-emerald-500/20`;
    case "hoy":
      return `${base}${sel} ${
        d.saldo < 0 ? "bg-red-500/15" : "bg-emerald-500/15"
      } ${seleccionado ? "" : "ring-1 ring-cdm-accent/60"}`;
    default:
      return `${base}${sel} bg-cdm-fg/[0.03] hover:bg-cdm-fg/[0.07]`;
  }
}

function colorSaldo(d: DiaCiclo): string {
  if (d.estado === "futuro") return "text-cdm-muted/60";
  return d.saldo < 0
    ? "text-red-600 dark:text-red-400"
    : "text-emerald-600 dark:text-emerald-400";
}

/** Color del número de la celda: la alcancía acumulada a ese día. */
function colorAlcancia(d: DiaCiclo): string {
  if (d.estado === "futuro") return "text-cdm-muted/60";
  return d.ahorrado_acum < 0
    ? "text-red-600 dark:text-red-400"
    : "text-emerald-600 dark:text-emerald-400";
}

const ESTADO_LABEL: Record<DiaCiclo["estado"], string> = {
  verde: "Cerró en verde",
  rojo: "Cerró en rojo",
  hoy: "Hoy · en vivo",
  futuro: "Proyectado",
};

export function CalendarioCiclo({ dias }: { dias: DiaCiclo[] }) {
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
        {dias.map((d) => (
          <button
            key={d.fecha}
            type="button"
            onClick={() => setSeleccion(seleccion === d.fecha ? null : d.fecha)}
            className={estiloCelda(d, seleccion === d.fecha)}
            aria-label={`${fechaLarga(d.fecha)}: ${ESTADO_LABEL[d.estado]}, alcancía ${formatMoneyInt(d.ahorrado_acum)}`}
          >
            <span
              className={`font-geist text-[12px] font-medium tabular-nums leading-none ${
                d.estado === "futuro" ? "text-cdm-muted/60" : "text-cdm-fg"
              }`}
            >
              {diaDelMes(d.fecha)}
            </span>
            <span
              className={`font-mono-hud text-[9px] tabular-nums leading-none ${colorAlcancia(d)}`}
            >
              {d.estado === "futuro"
                ? `≈${fmtCompacto(d.ahorrado_acum)}`
                : `${d.ahorrado_acum < 0 ? "−" : "+"}${fmtCompacto(d.ahorrado_acum)}`}
            </span>
          </button>
        ))}
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
                {fechaLarga(dia.fecha)} · día {dia.dia_ciclo}
              </span>
              <span
                className={`font-mono-hud text-[10px] uppercase tracking-widest ${colorSaldo(dia)}`}
              >
                {ESTADO_LABEL[dia.estado]}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-4 gap-x-3 text-[11px]">
              <div>
                <dt className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">
                  Tu día
                </dt>
                <dd className="font-geist tabular-nums font-medium text-cdm-fg">
                  {formatMoneyInt(dia.presupuesto)}
                </dd>
              </div>
              <div>
                <dt className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">
                  Gastado
                </dt>
                <dd className="font-geist tabular-nums font-medium text-cdm-fg">
                  {formatMoneyInt(dia.gastado)}
                </dd>
              </div>
              <div>
                <dt className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">
                  Saldo
                </dt>
                <dd className={`font-geist tabular-nums font-medium ${colorSaldo(dia)}`}>
                  {formatMoneyInt(dia.saldo)}
                </dd>
              </div>
              <div>
                <dt className="font-mono-hud uppercase tracking-[0.12em] text-cdm-muted">
                  Alcancía
                </dt>
                <dd className={`font-geist tabular-nums font-medium ${colorAlcancia(dia)}`}>
                  {dia.estado === "futuro" ? "≈" : ""}{formatMoneyInt(dia.ahorrado_acum)}
                </dd>
              </div>
            </dl>

            {dia.gastos.length > 0 ? (
              <ul className="mt-3 divide-y divide-cdm-line">
                {dia.gastos.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-baseline justify-between gap-3 py-2 text-[11px]"
                  >
                    <div>
                      <div className="font-geist text-cdm-fg">{g.concepto}</div>
                      <div className="font-mono-hud text-[9px] uppercase tracking-[0.1em] text-cdm-muted">
                        {g.categoria}
                      </div>
                    </div>
                    <span className="font-geist tabular-nums font-medium text-cdm-fg">
                      {formatMoneyInt(g.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-mono-hud mt-3 text-[10px] uppercase tracking-[0.12em] text-cdm-muted">
                {dia.estado === "futuro" ? "Todavía no llegó." : "Sin gastos ese día."}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
