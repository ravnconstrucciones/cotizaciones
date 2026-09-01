"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { PanelVariantProvider } from "@/components/cockpit/panel";
import { ModuloPendientes } from "@/components/cockpit/modulo-pendientes";

/**
 * /pendientes — la lista de tareas SOLA, a pantalla completa, pensada para el
 * cel (pedido de Eze 17/07): entrar, tildar con el dedo y salir. Reusa el
 * módulo de la home en variante táctil (tap targets grandes, cruz visible);
 * misma tabla `tareas`, mismo realtime — lo que anota el bot aparece solo.
 */
export function PendientesScreen() {
  const hoy = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <PanelVariantProvider value="card">
      <div className="font-geist relative min-h-screen bg-zinc-50 text-zinc-900 dark:bg-[#0a0a0c] dark:text-zinc-100">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(8,145,178,0.05),transparent_55%)] dark:bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(34,211,238,0.06),transparent_55%)]"
        />

        <div className="relative z-10 mx-auto w-full max-w-xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
          <motion.header
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mb-5 flex items-baseline justify-between"
          >
            <div>
              <h1 className="font-raleway text-lg font-semibold tracking-tight">
                Pendientes
              </h1>
              <p className="text-xs capitalize text-zinc-500 dark:text-zinc-400">
                {hoy}
              </p>
            </div>
            <Link
              href="/panel"
              className="text-xs uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              ← Home
            </Link>
          </motion.header>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
          >
            <ModuloPendientes tactil />
          </motion.div>
        </div>
      </div>
    </PanelVariantProvider>
  );
}
