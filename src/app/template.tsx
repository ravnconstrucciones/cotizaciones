"use client";

import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Transición de página del cockpit (iteración 3): fade + rise al navegar.
 * `template.tsx` se re-monta en cada navegación → la entrada corre siempre,
 * mientras la carcasa (AppShell, sidebar) queda quieta.
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

  const esDocumento =
    SIN_TRANSICION.some((p) => pathname.startsWith(p)) ||
    SIN_TRANSICION_SUFIJO.some((s) => pathname.endsWith(s));

  if (esDocumento || reducirMovimiento) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
