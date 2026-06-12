"use client";

import { motion } from "framer-motion";
import type { CerebroData } from "@/types/centro-mando";
import { CommandBar } from "./command-bar";
import { WavesBackdrop } from "./waves-backdrop";
import { ModuloObras } from "./modulo-obras";
import { ModuloPlata } from "./modulo-plata";
import { ModuloPendientes } from "./modulo-pendientes";
import { ModuloCotizaciones } from "./modulo-cotizaciones";
import { ModuloActividad } from "./modulo-actividad";
import { ModuloArchivados } from "./modulo-archivados";
import { ModuloCerebro } from "./modulo-cerebro";
import { ModuloAdn } from "./modulo-adn";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/**
 * Home cockpit — iteración 5 (IGLOO): restricción brutal. Dos niveles:
 *   1. Lo que manda: prompt box + Obras / Plata / Pendientes en grande.
 *   2. El resto del sistema: tiles colapsados de una línea (se expanden
 *      al click — la funcionalidad completa sigue ahí).
 * La pantalla RESPIRA: márgenes generosos, aire entre niveles, atmósfera
 * de niebla detrás (WavesBackdrop). En < lg degrada a una columna.
 */
export function CockpitHome({ cerebro }: { cerebro: CerebroData }) {
  return (
    <div className="font-grotesk relative flex min-h-screen flex-col gap-7 bg-cdm-bg px-5 pb-10 pt-6 text-cdm-fg lg:px-10 lg:pt-8">
      <WavesBackdrop />

      {/* pr-14: la fecha no debe quedar debajo del theme-toggle fijo (right-4). */}
      <div className="relative z-10 flex items-baseline justify-between px-1 pb-3 pr-14">
        {/* Línea de horizonte: luz cian a ancho completo detrás del header. */}
        <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
        <h1 className="font-mono-hud text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
          <span aria-hidden className="mr-2 text-cdm-accent/60">
            {"//////"}
          </span>
          Centro de mando
        </h1>
        <span className="font-mono-hud text-[10px] uppercase tracking-[0.12em] text-cdm-muted/60">
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>

      <CommandBar />

      {/* Nivel 1 — lo que manda: tres módulos en grande, con aire. */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative z-10 grid grid-cols-1 gap-5 lg:h-[46vh] lg:min-h-[340px] lg:grid-cols-3"
      >
        <ModuloObras />
        <ModuloPlata />
        <ModuloPendientes />
      </motion.div>

      {/* Nivel 2 — el resto del sistema, replegado en la niebla. */}
      <div className="relative z-10 mt-1 px-1">
        <p className="font-mono-hud text-[9px] uppercase tracking-[0.3em] text-cdm-muted/50">
          <span aria-hidden className="mr-2 text-cdm-accent/30">
            {"//////"}
          </span>
          Sistemas
        </p>
      </div>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        transition={{ delayChildren: 0.25 }}
        className="relative z-10 -mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        <ModuloCotizaciones colapsable />
        <ModuloActividad colapsable />
        <ModuloCerebro cerebro={cerebro} colapsable />
        <ModuloArchivados colapsable />
        <ModuloAdn colapsable />
      </motion.div>
    </div>
  );
}
