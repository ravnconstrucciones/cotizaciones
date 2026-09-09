"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { EconomiaObra } from "@/lib/economia-obras";
import { CostBar, FotoPortada, money, number, surface } from "./finance-ui";
export function ProyectoEconomiaCard({p,onFoto}:{p:EconomiaObra;onFoto:(id:string,url:string)=>void}) {
  return <article className={`${surface} relative isolate overflow-hidden p-5`}>
    {p.fotoUrl && <><img src={p.fotoUrl} alt="" loading="lazy" decoding="async" className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-20 grayscale"/><div className="absolute inset-0 -z-10 bg-gradient-to-t from-cdm-panel via-cdm-panel/80 to-cdm-panel/35"/></>}
    <Link href={`/obras/${p.id}`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4">
      <div className="flex items-start justify-between gap-4"><p className="rounded-full border border-cdm-line bg-cdm-panel/80 px-2.5 py-1 text-[11px] font-medium">{p.finalizada ? "Finalizada" : p.aprobado ? "En curso" : "En preparación"}</p><ArrowUpRight size={18} className="shrink-0 text-cdm-muted"/></div>
      <h2 className="mt-4 text-base font-semibold leading-snug tracking-tight">{p.nombre}</h2><p className="mt-1 text-xs text-cdm-muted">{p.cliente}</p>
      <div className="my-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs text-cdm-muted">{p.finalizada ? "Resultado registrado" : "Resultado a hoy"}</p><p className="mt-1 text-[28px] font-semibold leading-tight tracking-tight tabular-nums">{money(p.resultadoArs)}</p></div><div className="text-right"><p className="text-2xl font-semibold tabular-nums">{p.margenPct == null ? "—" : `${number(p.margenPct)}%`}</p><p className="text-xs text-cdm-muted">margen directo</p></div></div>
      <CostBar total={p.contratoArs} mo={p.moPagadaArs} otros={Math.max(0,p.gastadoArs-p.moPagadaArs)}/>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-cdm-line pt-4"><div><dt className="text-xs text-cdm-muted">Mano de obra pagada</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{money(p.moPagadaArs)}</dd></div><div><dt className="text-xs text-cdm-muted">Costo registrado</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{money(p.gastadoArs)}</dd></div></dl>
      {p.pagosPersonalSinAcuerdoArs > 0 && <p className="mt-3 text-xs text-cdm-muted">Además, {money(p.pagosPersonalSinAcuerdoArs)} pagados al personal sin acuerdo vinculado. Incluidos en el costo.</p>}
      {p.cantGastos === 0 && p.gastadoArs === 0 && <p className="mt-3 text-xs text-cdm-muted">Todavía no hay costos registrados.</p>}
      {p.contratoArs == null && <p className="mt-3 text-xs text-cdm-muted">Falta el importe del contrato{p.esUsd ? " o su cotización" : ""}.</p>}
      {p.esUsd && p.contratoArs != null && <p className="mt-3 text-xs text-cdm-muted">Contrato USD valuado al cambio pactado.</p>}
    </Link>
    {p.obraId && <div className="mt-2"><FotoPortada id={p.id} tieneFoto={Boolean(p.fotoUrl)} onFoto={url=>onFoto(p.id,url)}/></div>}
  </article>;
}
