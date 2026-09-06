"use client";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { PanelVariantProvider } from "./panel";
import { ModuloObras } from "./modulo-obras";
import { ModuloPendientes } from "./modulo-pendientes";
import { ModuloSemana } from "./modulo-semana";
import { ControlFinancieroBlock } from "@/app/finanzas/control-financiero-block";

export function CockpitHome() {
  const reduced = useReducedMotion();
  return <PanelVariantProvider value="card"><div className="font-raleway mx-auto max-w-6xl px-4 py-8 text-cdm-fg sm:px-8">
    <motion.header initial={reduced ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-cdm-line pb-6">
      <div><p className="text-xs uppercase tracking-[.2em] text-cdm-muted">RAVN · Tu día en orden</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Lo que necesita tu atención.</h1><p className="mt-3 max-w-xl text-sm text-cdm-muted">Proyectos, plata y próximos pasos. Cargá una sola vez lo que pasa en la calle.</p></div>
      <Link href="/gasto" className="inline-flex min-h-12 items-center bg-cdm-fg px-5 text-sm font-semibold text-cdm-bg">Registrar movimiento</Link>
    </motion.header>
    <ControlFinancieroBlock mode="resumen" />
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <Link href="/compras" className="border border-cdm-line p-5"><p className="text-xs uppercase tracking-widest text-cdm-muted">Tu semana</p><h2 className="mt-2 text-xl font-semibold">Compras resueltas</h2><p className="mt-2 text-sm">Lunes: compra principal. Jueves: reponer sólo lo que falte.</p></Link>
      <Link href="/pendientes" className="border border-cdm-line p-5"><p className="text-xs uppercase tracking-widest text-cdm-muted">Un solo lugar</p><h2 className="mt-2 text-xl font-semibold">Pendientes y agenda</h2><p className="mt-2 text-sm">Pagos, gestiones y tareas con su fecha.</p></Link>
    </div>
    <ModuloObras />
    <div className="mt-6"><ModuloSemana /></div>
    <details className="mt-6 border-t border-cdm-line"><summary className="min-h-12 cursor-pointer py-4 font-semibold">Ver todos los pendientes por área</summary><ModuloPendientes /></details>
  </div></PanelVariantProvider>;
}
