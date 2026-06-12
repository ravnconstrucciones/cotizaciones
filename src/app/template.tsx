"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useEntradaAnimada } from "@/hooks/use-entrada-animada";

/**
 * Transición de página del cockpit (iteración 3): fade + rise al navegar.
 * `template.tsx` se re-monta en cada navegación → la entrada corre siempre,
 * mientras la carcasa (AppShell, sidebar) queda quieta.
 *
 * RONDA 6 — bug del "vacío negro": con `initial={{opacity: 0}}` el SSR
 * mandaba el HTML con opacity:0 inline y la página entera quedaba INVISIBLE
 * hasta que Framer Motion hidrataba (segundos en frío) — solo se veían el
 * sidebar y el theme-toggle ("el cuadrado con la luna"). Por eso la PRIMERA
 * carga (documento) no anima: el contenido pinta con el HTML. La entrada
 * animada queda para las navegaciones client-side, donde sí corre al toque.
 *
 * Los documentos A4 (propuesta, remito, /documento) y la landing quedan
 * EXCLUIDOS: van a impresión/PDF y no deben llevar wrappers animados.
 * Con prefers-reduced-motion el contenido aparece sin animación.
 */

const SIN_TRANSICION = ["/propuesta", "/remito", "/landing"];
const SIN_TRANSICION_SUFIJO = ["/documento"];

export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reducirMovimiento = useReducedMotion();
  const animarEntrada = useEntradaAnimada();

  const esDocumento =
    SIN_TRANSICION.some((p) => pathname.startsWith(p)) ||
    SIN_TRANSICION_SUFIJO.some((s) => pathname.endsWith(s));

  if (esDocumento || reducirMovimiento) return <>{children}</>;

  return (
    <motion.div
      initial={animarEntrada ? { opacity: 0, y: 14 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
