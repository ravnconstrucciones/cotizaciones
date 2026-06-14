"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card } from "@/components/ui/heroui-card";

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
 * Variante visual de la carcasa de módulo:
 *   - "hud"  → vidrio HUD denso (.cdm-glass) — el cockpit clásico (DEFAULT).
 *   - "card" → tarjeta HeroUI limpia (redondeada, sombra suave) — la home
 *              nueva de cards que scrollea.
 * Vive en un contexto para no tocar la firma de cada módulo: la home nueva
 * envuelve sus módulos en <PanelVariantProvider value="card">; el resto de
 * las páginas no lo envuelve y conserva el HUD. Cero duplicación de lógica.
 */
export type PanelVariant = "hud" | "card";
const PanelVariantContext = createContext<PanelVariant>("hud");

export function PanelVariantProvider({
  value,
  children,
}: {
  value: PanelVariant;
  children: ReactNode;
}) {
  return (
    <PanelVariantContext.Provider value={value}>
      {children}
    </PanelVariantContext.Provider>
  );
}

/**
 * Carcasa de módulo del cockpit. Dos pieles según el contexto:
 *
 * HUD (default): panel translúcido sobre la atmósfera (.cdm-glass:
 * backdrop-blur + borde gradiente 1px + esquinas cian, radius 0 — ADN RAVN).
 * Header con label terminal `////// TITULO` (IBM Plex Mono — lenguaje IGLOO).
 *
 * CARD (home nueva): tarjeta HeroUI limpia y legible — esquinas redondeadas,
 * sombra suave, título prolijo + acción a la derecha. Pensada para leerse
 * bien claro en un bento que scrollea, no para el HUD denso.
 *
 * Anima como hijo del stagger de la home (variants hidden/visible).
 */
export function Panel({
  titulo,
  accion,
  children,
  className,
  colapsable = false,
}: PanelProps) {
  const variante = useContext(PanelVariantContext);
  const [abierto, setAbierto] = useState(!colapsable);

  if (variante === "card") {
    return (
      <PanelCard
        titulo={titulo}
        accion={accion}
        className={className}
        colapsable={colapsable}
        abierto={abierto}
        setAbierto={setAbierto}
      >
        {children}
      </PanelCard>
    );
  }

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

/**
 * Piel CARD (home nueva). Tarjeta HeroUI: redondeada, sombra suave, título
 * limpio. El cuerpo NO scrollea por dentro — el aire lo da la página entera
 * scrolleando para abajo (pedido de Eze). Los módulos colapsables conservan
 * su [+]/[−] como en el HUD.
 */
function PanelCard({
  titulo,
  accion,
  children,
  className,
  colapsable,
  abierto,
  setAbierto,
}: {
  titulo: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
  colapsable: boolean;
  abierto: boolean;
  setAbierto: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const titulo_el = (
    <h2 className="font-grotesk min-w-0 truncate text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
      {titulo}
    </h2>
  );

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.4, ease: "easeOut" },
        },
      }}
      className={className}
    >
      <Card
        interactive
        className="font-grotesk flex h-full min-h-0 flex-col"
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-950/[0.06] px-6 py-4 dark:border-white/[0.06]">
          {colapsable ? (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              aria-expanded={abierto}
              className="flex min-w-0 flex-1 cursor-pointer items-center text-left"
            >
              {titulo_el}
            </button>
          ) : (
            titulo_el
          )}
          <span className="flex shrink-0 items-center gap-3 text-zinc-500 dark:text-zinc-400">
            {accion}
            {colapsable && (
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
                aria-label={abierto ? `Colapsar ${titulo}` : `Expandir ${titulo}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200"
              >
                <motion.span
                  aria-hidden
                  animate={{ rotate: abierto ? 0 : -90 }}
                  transition={{ duration: 0.2 }}
                  className="inline-block text-[11px]"
                >
                  ▾
                </motion.span>
              </button>
            )}
          </span>
        </header>

        {colapsable ? (
          <AnimatePresence initial={false}>
            {abierto && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="px-6 py-5">{children}</div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <div className="min-h-0 flex-1 px-6 py-5">{children}</div>
        )}
      </Card>
    </motion.div>
  );
}
