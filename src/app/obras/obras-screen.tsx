"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { useEconomiaObras } from "@/hooks/use-economia-obras";
import { NuevaObraModal } from "@/components/cockpit/nueva-obra-modal";
import { ProyectoEconomiaCard } from "@/components/finanzas/proyecto-economia-card";
import { PageIntro, Metric, LoadingCards, control, money, surface } from "@/components/finanzas/finance-ui";
export function ObrasScreen() {
  const {proyectos,error,cargar,onFoto}=useEconomiaObras();
  const [vista,setVista]=useState("todas");
  const [busqueda,setBusqueda]=useState("");
  const [modal,setModal]=useState(false);
  const [orden,setOrden]=useState("recientes");
  const visibles=useMemo(()=>{
    const q=busqueda.trim().toLocaleLowerCase("es");
    const rows=(proyectos??[]).filter(p=>(vista==="todas" || (vista==="finalizadas"?p.finalizada:!p.finalizada&&p.aprobado)) && `${p.nombre} ${p.cliente??""}`.toLocaleLowerCase("es").includes(q));
    if(orden==="margen") rows.sort((a,b)=>(b.margenPct??-Infinity)-(a.margenPct??-Infinity));
    return rows;
  },[proyectos,vista,busqueda,orden]);
  const medibles=visibles.filter(p=>p.resultadoArs!=null);
  const total=medibles.reduce((n,p)=>n+(p.resultadoArs??0),0);
  return <main className="font-raleway mx-auto max-w-7xl px-4 py-6 pb-16 text-cdm-fg sm:px-8 sm:py-8">
    <PageIntro eyebrow="RAVN · Obras" title="Lo que deja cada obra." description="Costos, pagos y resultado. Tus números, a la vista." action={<button className={`${control} inline-flex items-center gap-2 font-semibold`} onClick={()=>setModal(true)}><Plus size={17}/>Nueva obra</button>}/>
    {proyectos && <section className={`${surface} mb-6 grid grid-cols-2 gap-5 p-5 sm:grid-cols-4`} aria-label="Totales de las obras filtradas"><Metric label="Resultado registrado" value={medibles.length?money(total):"Sin dato"} detail={`${medibles.length} de ${visibles.length} obras con importe`}/><Metric label="Mano de obra pagada" value={money(visibles.reduce((n,p)=>n+p.moPagadaArs,0))} detail="Mano de obra identificada"/><Metric label="Costo registrado" value={money(visibles.reduce((n,p)=>n+p.gastadoArs,0))}/><div className="flex items-center"><Link href="/mano-obra" className={`${control} inline-flex items-center gap-2`}><Users size={17}/>Pagos al personal</Link></div></section>}
    <div className="mb-5 flex flex-wrap gap-3"><div className="flex rounded-xl bg-cdm-fg/5 p-1" role="group" aria-label="Estado de obra">{[["todas","Todas"],["activas","En curso"],["finalizadas","Finalizadas"]].map(([id,label])=><button key={id} aria-pressed={vista===id} onClick={()=>setVista(id)} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${vista===id?"bg-cdm-fg text-cdm-bg":"text-cdm-muted"}`}>{label}</button>)}</div><label className="relative min-w-44 flex-1"><Search size={16} className="absolute left-3 top-3.5 text-cdm-muted"/><input aria-label="Buscar obra o cliente" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar obra o cliente" className={`${control} h-full w-full pl-9`}/></label><select aria-label="Ordenar obras" value={orden} onChange={e=>setOrden(e.target.value)} className={control}><option value="recientes">Más recientes</option><option value="margen">Mayor margen</option></select></div>
    {error && <div role="alert" className={`${surface} mb-4 p-4 text-sm`}>{error} <button onClick={()=>void cargar()} className="underline">Reintentar</button>{proyectos && <p>Mostrando la última lectura disponible.</p>}</div>}
    {!proyectos ? <LoadingCards/> : <><p className="mb-4 text-xs text-cdm-muted">{visibles.length} proyectos · Resultado directo: contrato menos costos registrados. Las obras abiertas pueden tener gastos por cargar.</p><div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibles.map(p=><ProyectoEconomiaCard key={p.id} p={p} onFoto={onFoto}/>)}</div>{!visibles.length&&<p className={`${surface} p-8 text-center text-sm text-cdm-muted`}>No hay obras para estos filtros.</p>}</>}
    <NuevaObraModal open={modal} onClose={()=>setModal(false)} onCreated={()=>{setModal(false);setVista("todas");void cargar();}}/>
  </main>;
}
