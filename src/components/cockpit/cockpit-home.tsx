"use client";

import { motion } from "framer-motion";
import { useEntradaAnimada } from "@/hooks/use-entrada-animada";
import type { CerebroData } from "@/types/centro-mando";
import { CommandBar } from "./command-bar";
import { PanelVariantProvider } from "./panel";
import { ModuloSaludNegocio } from "./modulo-salud-negocio";
import { ModuloFinanzas } from "./modulo-finanzas";
import { ModuloObras } from "./modulo-obras";
import { ModuloPlata } from "./modulo-plata";
import { ModuloPendientes } from "./modulo-pendientes";
import { ModuloSemana } from "./modulo-semana";
import { ModuloCotizaciones } from "./modulo-cotizaciones";
import { ModuloActividad } from "./modulo-actividad";
import { ModuloCerebro } from "./modulo-cerebro";
import { ModuloAdn } from "./modulo-adn";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/**
 * HOME nueva — CARDS que scrollean (pedido de Eze 14/06): la estética HeroUI
 * que pasó, "que se lean bien claro". Reemplaza el HUD denso de una pantalla
 * por un BENTO vertical de tarjetas limpias (redondeadas, sombra suave) sobre
 * un fondo calmo y neutro — SaaS premium (Linear / HeroUI), no la cabina.
 *
 * Reusa TODA la lógica y los datos de los módulos existentes: solo cambia la
 * carcasa, vía <PanelVariantProvider value="card"> (los Panel internos pasan
 * a piel CARD). Fuente Geist (limpia); la marca "RAVN." sigue Raleway.
 */
export function CockpitHome({ cerebro }: { cerebro: CerebroData }) {
  const animar = useEntradaAnimada();
  const hoy = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <PanelVariantProvider value="card">
      <div className="font-geist relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-[#0a0a0c] dark:text-zinc-100">
        {/* Fondo calmo: un wash neutro muy sutil, sin shader ni líneas que
            compitan con las cards. Theme-aware por dark:. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(8,145,178,0.05),transparent_55%)] dark:bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(34,211,238,0.06),transparent_55%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-12">
          {/* ── HERO: la barra de comando, prominente ── */}
          <motion.div
            initial={animar ? { opacity: 0, y: -12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <CommandBar />
          </motion.div>

          {/* Saludo + fecha, debajo del hero */}
          <motion.div
            initial={animar ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
            className="mb-9 mt-6 flex flex-wrap items-baseline justify-between gap-2 px-1"
          >
            <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900 sm:text-[26px] dark:text-zinc-50">
              Buen día, Ezequiel
            </h1>
            <span className="text-[13px] capitalize text-zinc-500 dark:text-zinc-400">
              {hoy}
            </span>
          </motion.div>

          {/* ── BENTO de cards (12 cols, scroll vertical, aire generoso) ── */}
          <motion.div
            variants={stagger}
            initial={animar ? "hidden" : false}
            animate="visible"
            className="grid grid-cols-1 gap-5 lg:grid-cols-12"
          >
            {/* Fila 0 — SALUD DEL NEGOCIO: lo primero que se ve (pedido 25/06) */}
            <ModuloSaludNegocio className="lg:col-span-12" />

            {/* Fila 0b — FINANZAS PERSONALES: la libreta personal, hermana de Salud */}
            <ModuloFinanzas className="lg:col-span-12" />

            {/* Fila 1 — Obras (grande) + Plata */}
            <ModuloObras className="lg:col-span-7" />
            <ModuloPlata className="lg:col-span-5" />

            {/* Fila 2 — Pendientes (sectorizado por área) + Cerebro */}
            <ModuloPendientes className="lg:col-span-7" />
            <ModuloCerebro cerebro={cerebro} className="lg:col-span-5" />

            {/* Fila 3 — Semana (ancha, calendario lun→dom) */}
            <ModuloSemana className="lg:col-span-12" />

            {/* Fila 4 — Actividad (feed) + Cotizaciones */}
            <ModuloActividad className="lg:col-span-7" />
            <ModuloCotizaciones className="lg:col-span-5" />

            {/* Fila 5 — ADN (teaser) a todo el ancho */}
            <ModuloAdn className="lg:col-span-12" />
          </motion.div>
        </div>
      </div>
    </PanelVariantProvider>
  );
}
