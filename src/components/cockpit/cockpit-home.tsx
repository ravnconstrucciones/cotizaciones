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
 * Home cockpit (spec §4): una pantalla, sin scroll en desktop (cada módulo
 * scrollea adentro). En < lg degrada a una columna con scroll normal.
 * Skin futurista: malla Waves de fondo (WavesBackdrop, z-0) + contenido en z-10
 * con Space Grotesk como fuente de interfaz (Raleway queda solo para la marca).
 */
export function CockpitHome({ cerebro }: { cerebro: CerebroData }) {
  return (
    <div className="font-grotesk relative flex min-h-screen flex-col gap-3 bg-cdm-bg p-4 text-cdm-fg lg:h-screen lg:overflow-hidden">
      <WavesBackdrop />

      {/* pr-14: la fecha no debe quedar debajo del theme-toggle fijo (right-4). */}
      <div className="relative z-10 flex items-baseline justify-between px-1 pb-2 pr-14">
        {/* Línea de horizonte: luz cian a ancho completo detrás del header. */}
        <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
        <h1 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
          <span
            aria-hidden
            className="h-[5px] w-[5px] bg-cdm-accent shadow-[0_0_8px_rgba(34,211,238,0.9)]"
          />
          Centro de mando
        </h1>
        <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
          {new Date().toLocaleDateString("es-AR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>

      <CommandBar />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-2"
      >
        <ModuloObras className="lg:col-span-3" />
        <ModuloPlata className="lg:col-span-3" />
        <ModuloPendientes className="lg:col-span-3" />
        <ModuloCotizaciones className="lg:col-span-3" />
        <ModuloActividad className="lg:col-span-4" />
        <ModuloCerebro cerebro={cerebro} className="lg:col-span-4" />
        <ModuloArchivados className="lg:col-span-2" />
        <ModuloAdn className="lg:col-span-2" />
      </motion.div>
    </div>
  );
}
