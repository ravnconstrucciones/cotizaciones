"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Tono semántico del display, ruteado a tokens theme-aware. Es el camino
 * preferido (vs. `colorBase` con hex hardcodeado): el mismo valor lee bien
 * en oscuro Y en claro porque el token se remapea bajo `html.light`.
 * - `neutro`   → off-white / tinta (--cdm-fg)
 * - `accent`   → cian holograma (--cdm-accent)
 * - `positivo` → plata positiva (semáforo verde)
 * - `negativo` → plata negativa (semáforo rojo)
 */
type TonoCifra = "neutro" | "accent" | "positivo" | "negativo";

const TONO_VAR: Record<TonoCifra, string> = {
  neutro: "var(--cdm-fg)",
  accent: "var(--cdm-accent)",
  positivo: "var(--cdm-positivo)",
  negativo: "var(--cdm-negativo)",
};

type CifraHeroicaProps = {
  children: React.ReactNode;
  /** Tamaño/leading del display: ej. `text-[clamp(30px,2.4vw,44px)] leading-none`. */
  className?: string;
  /**
   * Tono semántico (preferido): rutea por token theme-aware. Si se pasa,
   * gana sobre `colorBase`.
   */
  tono?: TonoCifra;
  /**
   * Color base del número (el gleam barre encima). Por defecto off-white.
   * Legacy: preferir `tono` para que lea bien en claro. Aceptá CSS color
   * (hex o `var(--…)`).
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
  tono,
  colorBase = "var(--cdm-fg)",
  delay = 0.15,
}: CifraHeroicaProps) {
  const reducirMovimiento = useReducedMotion();
  // `tono` (token theme-aware) gana sobre el `colorBase` hex legacy.
  const color = tono ? TONO_VAR[tono] : colorBase;
  // Bloom suave (iteración 5): si el contenido es texto plano, una copia
  // difuminada cian respira detrás de la cifra — el dato emana luz.
  const bloom = typeof children === "string" ? children : undefined;
  return (
    <motion.span
      initial={
        reducirMovimiento ? false : { backgroundPosition: "130% 0" }
      }
      animate={{ backgroundPosition: "-30% 0" }}
      transition={{ duration: 1.3, ease: "easeOut", delay }}
      data-bloom={bloom}
      className={`font-raleway inline-block font-black tabular-nums ${
        bloom ? "cdm-bloom-suave" : ""
      } ${className ?? ""}`}
      style={{
        // El gleam usa --cdm-gleam (theme-aware): blanco casi puro en oscuro,
        // veta blanca tenue en claro (un blanco fuerte lavaría el número oscuro).
        backgroundImage: `linear-gradient(105deg, ${color} 40%, var(--cdm-gleam) 50%, ${color} 60%)`,
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
