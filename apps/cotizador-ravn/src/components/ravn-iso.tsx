"use client";

import { motion, useReducedMotion } from "framer-motion";

/** Trazado exacto del isotipo RAVN (vector maestro 595:623, App RAVN). */
export const ISO_PATH =
  "M0,0 L346,0 L541,196 L289,196 L594,622 L270,622 L270,443 L201,443 L201,622 L0,622 Z";

/**
 * Isotipo RAVN que se dibuja a trazo y se llena — el único momento autoral
 * del visor (regla 6 del Design System). Es funcional, no decorativo:
 * `drawing` redibuja el trazo mientras se refrescan datos de la cotización.
 */
export function RavnIso({
  drawing = false,
  className,
}: {
  drawing?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <svg
        viewBox="-8 -8 611 639"
        preserveAspectRatio="xMidYMid meet"
        className={className}
        aria-hidden="true"
      >
        <path d={ISO_PATH} fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="-8 -8 611 639"
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <motion.path
        d={ISO_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={26}
        initial={{ pathLength: 0 }}
        animate={drawing ? { pathLength: [0, 1] } : { pathLength: 1 }}
        transition={
          drawing
            ? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
            : { duration: 1.5, delay: 0.2, ease: "easeInOut" }
        }
      />
      <motion.path
        d={ISO_PATH}
        fill="currentColor"
        initial={{ opacity: 0 }}
        animate={{ opacity: drawing ? 0.25 : 1 }}
        transition={{ duration: 1.1, delay: drawing ? 0 : 1.1, ease: "easeOut" }}
      />
    </svg>
  );
}
