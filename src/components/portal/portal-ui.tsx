"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Piezas visuales del portal del cliente. Acero monocromo RAVN: negro #070707,
 * blanco cálido #f2efe8, hairlines, cero radio y cero color — el estado se
 * dice con palabras y con relleno, nunca con un semáforo.
 *
 * Los colores van explícitos (no por tokens cdm-*) porque el portal es siempre
 * oscuro, sin importar el tema que Eze tenga elegido en la app.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-raleway select-none font-light uppercase text-[#f2efe8] ${className}`}
      style={{ letterSpacing: "0.517em", fontFamily: "var(--font-raleway), Raleway, system-ui, sans-serif" }}
      role="img"
      aria-label="RAVN"
    >
      RAVN.
    </span>
  );
}

export function Etiqueta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f2efe8]/75 ${className}`}>
      {children}
    </span>
  );
}

/** Sección con hairline superior que entra una sola vez al aparecer en pantalla. */
export function Seccion({
  id,
  titulo,
  lateral,
  children,
}: {
  id?: string;
  titulo: string;
  lateral?: ReactNode;
  children: ReactNode;
}) {
  const quieto = useReducedMotion();
  return (
    <motion.section
      id={id}
      className="scroll-mt-6 border-t border-[#f2efe8]/15 py-10 sm:py-14"
      initial={quieto ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.03em] sm:text-[26px]">{titulo}</h2>
        {lateral}
      </div>
      {children}
    </motion.section>
  );
}

/** Barra fina: el relleno crece por transform (scaleX), sin reflow. */
/** Colores del bloque de pagos (pedido de Eze, 15/11/2026): único lugar del portal con color. */
export const VERDE_PAGADO = "#5fd08a";
export const AMBAR_SALDO = "#e6b45a";

export function Barra({
  pct,
  alto = 2,
  etiqueta,
  color,
  fondo,
}: {
  pct: number;
  alto?: number;
  etiqueta: string;
  color?: string;
  fondo?: string;
}) {
  const quieto = useReducedMotion();
  const v = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div
      className="w-full overflow-hidden bg-[#f2efe8]/15"
      style={{ height: alto, ...(fondo ? { backgroundColor: fondo } : null) }}
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <motion.div
        className="h-full origin-left bg-[#f2efe8]"
        initial={quieto ? false : { scaleX: 0 }}
        whileInView={{ scaleX: v }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
        style={{ ...(color ? { backgroundColor: color } : null), ...(quieto ? { transform: `scaleX(${v})` } : null) }}
      />
    </div>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-[#f2efe8]/20 px-5 py-8 text-[16px] leading-relaxed text-[#f2efe8]/75">{children}</p>;
}
