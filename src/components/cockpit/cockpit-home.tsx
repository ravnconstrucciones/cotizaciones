"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Terminal } from "lucide-react";
import { useEntradaAnimada } from "@/hooks/use-entrada-animada";
import type { CerebroData } from "@/types/centro-mando";
import { CommandBar } from "./command-bar";
import { PanelVariantProvider } from "./panel";
import { Card } from "@/components/ui/heroui-card";
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

            {/* Fila 5 — chicas: ADN (teaser) + Terminal (acceso) */}
            <ModuloAdn className="lg:col-span-7" />
            <TarjetaTerminal className="lg:col-span-5" />
          </motion.div>
        </div>
      </div>
    </PanelVariantProvider>
  );
}

/**
 * Tarjeta chica de acceso a la Terminal: la misma piel HeroUI, un atajo
 * limpio al espacio de trabajo conversacional.
 */
function TarjetaTerminal({ className }: { className?: string }) {
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
      <Link href="/terminal" className="block h-full">
        <Card
          interactive
          variant="accent"
          className="group flex h-full flex-col justify-between gap-4 p-6 sm:p-7"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300">
              <Terminal className="h-5 w-5" />
            </span>
            <ArrowUpRight className="h-5 w-5 text-zinc-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-zinc-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Terminal
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Tu espacio de trabajo conversacional. Cotizá, redactá y dirigí
              el sistema por chat.
            </p>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
