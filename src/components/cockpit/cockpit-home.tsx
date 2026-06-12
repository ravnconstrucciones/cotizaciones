"use client";

import { motion } from "framer-motion";
import type { CerebroData } from "@/types/centro-mando";
import { CommandBar } from "./command-bar";
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
 * Los Placeholder se reemplazan por módulos reales en las tareas 12-15.
 */
export function CockpitHome({ cerebro }: { cerebro: CerebroData }) {
  return (
    <div className="flex min-h-screen flex-col gap-3 bg-cdm-bg p-4 text-cdm-fg lg:h-screen lg:overflow-hidden">
      <div className="flex items-baseline justify-between px-1">
        <h1 className="font-raleway text-[11px] uppercase tracking-[0.35em] text-cdm-muted">
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
        className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-2"
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
