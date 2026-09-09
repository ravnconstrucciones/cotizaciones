"use client";
import Link from "next/link";
import {Plus,ArrowUpRight,Users,Wallet,ShoppingBag} from "lucide-react";
import {useEconomiaObras} from "@/hooks/use-economia-obras";
import {ProyectoEconomiaCard} from "@/components/finanzas/proyecto-economia-card";
import {PageIntro,Metric,LoadingCards,control,money,surface} from "@/components/finanzas/finance-ui";
export function CockpitHome(){
  const {proyectos,error,cargar,onFoto}=useEconomiaObras();const activas=(proyectos??[]).filter(p=>p.aprobado&&!p.finalizada);
  return <div className="font-raleway mx-auto max-w-7xl px-4 py-6 pb-16 text-cdm-fg sm:px-8 sm:py-8"><PageIntro eyebrow="RAVN · Centro de mando" title="Tus números, a la vista." description="Lo que deja cada obra, lo que gastás y cada pago al personal." action={<Link href="/gasto" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cdm-fg px-4 py-3 text-sm font-semibold text-cdm-bg"><Plus size={18}/>Registrar movimiento</Link>}/>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">{[["/finanzas","Mi vida personal","Cuánto gasté y en qué.",Wallet],["/mano-obra","Pagos al personal","Historial y resumen semanal.",Users],["/compras","Compras","Materiales e insumos.",ShoppingBag]].map(([href,title,detail,Icon])=>{const I=Icon as typeof Users;return <Link key={String(href)} href={String(href)} className={`${surface} relative flex items-center gap-4 p-5`}><I size={22} className="shrink-0"/><div><h2 className="text-base font-semibold">{String(title)}</h2><p className="mt-1 text-xs text-cdm-muted">{String(detail)}</p></div><ArrowUpRight size={17} className="ml-auto shrink-0 text-cdm-muted"/></Link>;})}</div>
    {error&&<p role="alert" className={`${surface} mb-4 p-4 text-sm`}>{error} <button onClick={()=>void cargar()} className="underline">Reintentar</button></p>}
    {proyectos&&<section className={`${surface} mb-6 grid grid-cols-2 gap-5 p-5 sm:grid-cols-3`}><Metric label="Obras en curso" value={String(activas.length)}/><Metric label="Mano de obra por pagar" value={money(activas.reduce((n,p)=>n+p.moPendienteArs,0))} detail="Acuerdos de obras en curso · ARS"/><Metric label="Costos registrados" value={money(activas.reduce((n,p)=>n+p.gastadoArs,0))} detail="Obras en curso"/></section>}
    <div className="mb-4 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold tracking-tight">Tus obras en curso</h2><Link href="/obras" className={`${control} text-sm`}>Ver todas →</Link></div>
    {!proyectos?<LoadingCards/>:<div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{activas.slice(0,6).map(p=><ProyectoEconomiaCard key={p.id} p={p} onFoto={onFoto}/>)}</div>}
    {proyectos&&!activas.length&&<p className={`${surface} p-6 text-sm text-cdm-muted`}>No hay obras en curso. Podés consultar las finalizadas en Proyectos.</p>}
    <Link href="/obras/costos" className={`${surface} mt-6 flex items-center justify-between gap-4 p-5`}><div><h2 className="font-semibold">Mis costos reales</h2><p className="mt-1 text-sm text-cdm-muted">Tu historial por rubro y unidad para el próximo presupuesto.</p></div><ArrowUpRight className="shrink-0" size={20}/></Link>
  </div>;
}
