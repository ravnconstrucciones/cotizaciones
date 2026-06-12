"use client";

import { motion, useReducedMotion } from "framer-motion";

type CifraHeroicaProps = {
  children: React.ReactNode;
  /** Tamaño/leading del display: ej. `text-[clamp(30px,2.4vw,44px)] leading-none`. */
  className?: string;
  /**
   * Color base del número (el gleam barre encima). Por defecto off-white;
   * pasar p. ej. `#f87171` para saldos negativos.
   */
  colorBase?: string;
  /** Demora del gleam al montar (para escalonar varios displays). */
  delay?: number;
};

/**
 * Número heroico del cockpit (iteración 3 — jerarquía): Raleway 900 en
 * display grande con un gleam/sheen que barre el texto al montar.
 * El contraste de tamaño contra los labels de 10px es lo que hace
 * "cockpit de nave": la plata del mes y el total del presupuesto se
 * leen desde la otra punta de la habitación.
 *
 * El sheen es un gradiente clipeado al texto cuya posición anima UNA vez
 * (Framer Motion); con prefers-reduced-motion el número aparece estático.
 */
export function CifraHeroica({
  children,
  className,
  colorBase = "var(--cdm-fg)",
  delay = 0.15,
}: CifraHeroicaProps) {
  const reducirMovimiento = useReducedMotion();
  return (
    <motion.span
      initial={
        reducirMovimiento ? false : { backgroundPosition: "130% 0" }
      }
      animate={{ backgroundPosition: "-30% 0" }}
      transition={{ duration: 1.3, ease: "easeOut", delay }}
      className={`font-raleway inline-block font-black tabular-nums ${className ?? ""}`}
      style={{
        backgroundImage: `linear-gradient(105deg, ${colorBase} 40%, rgba(255, 255, 255, 0.95) 50%, ${colorBase} 60%)`,
        backgroundSize: "220% 100%",
        backgroundPosition: "-30% 0",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {children}
    </motion.span>
  );
}
