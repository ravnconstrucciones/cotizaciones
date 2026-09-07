"use client";
import Link from "next/link";
import { ArrowUpRight, Plus, ShoppingBag, CalendarDays } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { PanelVariantProvider } from "./panel";
import { ModuloObras } from "./modulo-obras";
import { ModuloPendientes } from "./modulo-pendientes";
import { ModuloSemana } from "./modulo-semana";
import { ControlFinancieroBlock } from "@/app/finanzas/control-financiero-block";

export function CockpitHome() {
  const reduced = useReducedMotion();
  return <PanelVariantProvider value="card"><div className="font-raleway mx-auto max-w-6xl px-4 py-8 pb-16 text-cdm-fg sm:px-8 sm:py-12">
    <motion.header initial={reduced ? false : {opacity:0,y:8}} animate={{opacity:1,y:0}} className="mb-8 grid gap-6 border-b border-cdm-line pb-8 sm:grid-cols-[1fr_auto] sm:items-end">
      <div><p className="text-xs uppercase tracking-[.2em] text-cdm-muted">RAVN · Centro de mando</p><h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Tu día, en orden.</h1><p className="mt-4 max-w-lg text-base leading-relaxed text-cdm-muted">Proyectos, plata y próximos pasos. Cargá una sola vez lo que pasa en la calle.</p></div>
      <Link href="/gasto" className="inline-flex min-h-12 items-center justify-center gap-3 bg-cdm-fg px-5 text-sm font-semibold text-cdm-bg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cdm-fg"><Plus size={18} aria-hidden />Registrar movimiento</Link>
    </motion.header>
    <ControlFinancieroBlock mode="resumen" />
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <Link href="/compras" className="group relative border border-cdm-line bg-cdm-panel p-5 hover:border-cdm-fg/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cdm-fg sm:p-6"><ShoppingBag size={20} className="mb-5" aria-hidden /><ArrowUpRight size={20} className="absolute right-5 top-5 text-cdm-muted" aria-hidden /><p className="text-xs uppercase tracking-widest text-cdm-muted">Tu semana</p><h2 className="mt-2 text-xl font-semibold">Compras resueltas</h2><p className="mt-2 text-sm leading-relaxed text-cdm-muted">Lunes: compra principal. Jueves: reponer sólo lo que falte.</p></Link>
      <Link href="/pendientes" className="group relative border border-cdm-line bg-cdm-panel p-5 hover:border-cdm-fg/50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cdm-fg sm:p-6"><CalendarDays size={20} className="mb-5" aria-hidden /><ArrowUpRight size={20} className="absolute right-5 top-5 text-cdm-muted" aria-hidden /><p className="text-xs uppercase tracking-widest text-cdm-muted">Un solo lugar</p><h2 className="mt-2 text-xl font-semibold">Pendientes y agenda</h2><p className="mt-2 text-sm leading-relaxed text-cdm-muted">Pagos, gestiones y tareas con su fecha.</p></Link>
    </div>
    <ModuloObras />
    <div className="mt-6"><ModuloSemana /></div>
    <details className="mt-6 border-t border-cdm-line"><summary className="min-h-12 cursor-pointer py-4 font-semibold">Ver todos los pendientes por área</summary><ModuloPendientes /></details>
  </div></PanelVariantProvider>;
}
