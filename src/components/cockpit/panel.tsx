"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type PanelProps = {
  titulo: string;
  /** Acción del header (link "[VER] ↑", badge, etc.). */
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Nivel 2 de la home (iteración 5 — IGLOO, restricción brutal): el panel
   * arranca como una sola línea (label mono + acción) y se expande al click.
   * La funcionalidad completa sigue ahí — pero la pantalla respira.
   */
  colapsable?: boolean;
};

/**
 * Carcasa de módulo del cockpit: panel HUD translúcido sobre la atmósfera
 * (.cdm-glass: backdrop-blur + borde gradiente 1px + esquinas cian,
 * radius 0 — ADN RAVN). Header con label terminal `////// TITULO`
 * (IBM Plex Mono — lenguaje IGLOO), cuerpo con scroll interno.
 * Anima como hijo del stagger de cockpit-home (variants hidden/visible).
 */
export function Panel({
  titulo,
  accion,
  children,
  className,
  colapsable = false,
}: PanelProps) {
  const [abierto, setAbierto] = useState(!colapsable);

  const labelMono = (
    <h2 className="font-mono-hud min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.2em] text-cdm-accent">
      <span aria-hidden className="mr-2 text-cdm-accent/45">
        {"//////"}
      </span>
      {titulo}
    </h2>
  );

  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
      }}
      className={`cdm-glass flex min-h-0 flex-col ${className ?? ""}`}
    >
      {colapsable ? (
        <header className="flex items-center justify-between gap-2 bg-[linear-gradient(90deg,rgba(34,211,238,0.07),transparent_60%)] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            {labelMono}
          </button>
          <span className="flex shrink-0 items-center gap-2.5">
            {accion}
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              aria-label={abierto ? `Colapsar ${titulo}` : `Expandir ${titulo}`}
              className="font-mono-hud cursor-pointer text-[10px] text-cdm-muted transition-colors hover:text-cdm-accent"
            >
              {abierto ? "[−]" : "[+]"}
            </button>
          </span>
        </header>
      ) : (
        <header className="flex items-baseline justify-between gap-2 border-b border-cdm-line bg-[linear-gradient(90deg,rgba(34,211,238,0.07),transparent_60%)] px-4 py-2.5">
          {labelMono}
          {accion}
        </header>
      )}

      {colapsable ? (
        <AnimatePresence initial={false}>
          {abierto && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden border-t border-cdm-line"
            >
              <div className="max-h-72 min-h-0 overflow-y-auto p-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      )}
    </motion.section>
  );
}
