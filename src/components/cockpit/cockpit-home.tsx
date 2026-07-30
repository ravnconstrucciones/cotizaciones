"use client";

import { motion } from "framer-motion";
import { useEntradaAnimada } from "@/hooks/use-entrada-animada";
import { PanelVariantProvider } from "./panel";
import { ModuloSaludNegocio } from "./modulo-salud-negocio";
import { ModuloFinanzas } from "./modulo-finanzas";
import { ModuloIa } from "./modulo-ia";
import { ModuloObras } from "./modulo-obras";
import { ModuloPlata } from "./modulo-plata";
import { ModuloPendientes } from "./modulo-pendientes";
import { ModuloSemana } from "./modulo-semana";

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/**
 * HOME nueva — el comando abre la pantalla como una pieza editorial y las
 * tarjetas quedan contenidas en una retícula monocroma de acero RAVN.
 *
 * Reusa TODA la lógica y los datos de los módulos existentes: solo cambia la
 * carcasa, vía <PanelVariantProvider value="card"> (los Panel internos pasan
 * a piel CARD). Fuente Geist (limpia); la marca "RAVN." sigue Raleway.
 */
export function CockpitHome() {
  const animar = useEntradaAnimada();
  const hoy = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <PanelVariantProvider value="card">
      <div className="font-raleway relative min-h-screen bg-cdm-bg text-cdm-fg">
        {/* Velo monocromo: profundidad sin color ni ruido de cabina. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(100%_78%_at_50%_-12%,rgba(7,7,7,0.06),transparent_56%)] dark:bg-[radial-gradient(100%_78%_at_50%_-12%,rgba(242,239,232,0.045),transparent_56%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-12">
          {/* La barra de comando salió de la home (pedido 29/07): escribía a
              `trabajos_cola` y ningún daemon la levantaba — última orden
              ejecutada 17/06, 12 pendientes colgadas. La tabla sigue viva
              porque el bot de WhatsApp escribe ahí. Si vuelve, vuelve con
              motor. */}

          {/* Saludo + fecha: ahora abre la pantalla */}
          <motion.div
            initial={animar ? { opacity: 0, y: -12 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mb-9 flex flex-wrap items-baseline justify-between gap-2 border-b border-cdm-line px-1 pb-4"
          >
            <h1 className="text-[22px] font-semibold uppercase tracking-[0.08em] text-cdm-fg sm:text-[26px]">
              Buen día, Ezequiel
            </h1>
            <span className="font-mono-hud text-[11px] uppercase tracking-[0.12em] text-cdm-muted">
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

            {/* Fila 0c — IA DE RAVN (pedido 29/07): suscripciones (fijas, en
                dólares) contra API por uso (variable, centavos). Van juntas
                porque el punto es que dejen de confundirse en un solo número. */}
            <ModuloIa className="lg:col-span-12" />

            {/* Fila 1 — Obras (grande) + Plata */}
            <ModuloObras className="lg:col-span-7" />
            <ModuloPlata className="lg:col-span-5" />

            {/* DINERO (Bolsillos y deudas) salió de la home (pedido 09/07):
                vive en /dinero. */}

            {/* Fila 2 — Pendientes (sectorizado por área) a todo el ancho.
                "El cerebro" se borró (pedido 09/07: FODA/Patrones zombie). */}
            <ModuloPendientes className="lg:col-span-12" />

            {/* Fila 3 — Semana (ancha, calendario lun→dom) */}
            <ModuloSemana className="lg:col-span-12" />

            {/* El grafo salió de la home (pedido 28/07): el grafo del vault
                se mira en Obsidian y se consulta con `graphify query`. */}

            {/* Actividad y Cotizaciones salieron de la home (pedido 02/07):
                viven en /actividad y /cotizaciones.
                ADN (teaser) salió de la home (pedido 09/07): vive en /adn. */}
          </motion.div>
        </div>
      </div>
    </PanelVariantProvider>
  );
}
