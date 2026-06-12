"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

type PanelProps = {
  titulo: string;
  /** Acción del header (link "Ver todo →", badge, etc.). */
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Carcasa de módulo del cockpit: panel HUD translúcido sobre el shader
 * (.cdm-glass: backdrop-blur + borde gradiente 1px + esquinas taupe,
 * radius 0 — ADN RAVN), header uppercase taupe con lavado sutil,
 * cuerpo con scroll interno (la home no scrollea en desktop; cada módulo sí).
 * Anima como hijo del stagger de cockpit-home (variants hidden/visible).
 */
export function Panel({ titulo, accion, children, className }: PanelProps) {
  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
      }}
      className={`cdm-glass flex min-h-0 flex-col ${className ?? ""}`}
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-cdm-line bg-[linear-gradient(90deg,rgba(200,180,154,0.07),transparent_60%)] px-4 py-2.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cdm-taupe">
          {titulo}
        </h2>
        {accion}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </motion.section>
  );
}
