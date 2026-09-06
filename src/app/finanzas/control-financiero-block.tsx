"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";

type Revision = {
  fecha: string; resumen: string;
  indicadores: { nombre: string; valor: string; detalle: string }[];
  pendientes: { titulo: string; detalle: string }[];
  margenes: { obra: string; venta: number; costo: number; margen: number; nota: string }[];
  compras: { dia: string; lugar: string; accion: string }[];
  canasta: string[];
};

export function ControlFinancieroBlock({mode = "economia"}: {mode?: "economia" | "compras" | "resumen"}) {
  const [data,setData] = useState<Revision|null>(null);
  const [estado,setEstado] = useState("cargando");
  const [intento,setIntento] = useState(0);
  const reduced = useReducedMotion();
  useEffect(()=>{
    const controller=new AbortController();
    setEstado("cargando");
    fetch("/api/finanzas/control",{cache:"no-store",signal:controller.signal})
      .then(async r=>{if(!r.ok) throw new Error(); return r.json();})
      .then(j=>{setData(j.revision?.contenido?.informe??null);setEstado("ok");})
      .catch(e=>{if(e.name!=="AbortError")setEstado("error");});
    return ()=>controller.abort();
  },[intento]);
  const old=data ? Date.now()-Date.parse(`${data.fecha}T12:00:00-03:00`)>7*86400000:false;
  const indicadores=mode==="resumen"?data?.indicadores.slice(0,3):data?.indicadores;
  return <motion.section initial={reduced?false:{opacity:0}} animate={{opacity:1}} transition={{duration:.2}} aria-label={mode==="compras"?"Plan de compras":"Control financiero"} className="mb-6 border border-cdm-line p-5 sm:p-6">
    {mode!=="compras"&&<div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{mode==="resumen"?"Tu economía, con fecha":"Saldos y compromisos"}</h2><Link href={mode==="resumen"?"/finanzas":"/gasto"} className="inline-flex min-h-11 items-center border border-cdm-line px-4 text-sm">{mode==="resumen"?"Ver economía":"Registrar movimiento"}</Link></div>}
    {estado==="cargando"&&<p role="status" className="mt-4 text-sm">Leyendo la última revisión…</p>}
    {estado==="error"&&<div role="alert" className="mt-4 text-sm"><p>No se pudo cargar la revisión. No significa que no haya pendientes.</p><button type="button" className="mt-3 min-h-11 border border-cdm-line px-4" onClick={()=>setIntento(x=>x+1)}>Volver a intentar</button></div>}
    {estado==="ok"&&!data&&<p className="mt-4 text-sm">Todavía no hay una revisión guardada.</p>}
    {data&&estado==="ok"&&<>
      <p className="mt-4 text-xs leading-relaxed text-cdm-muted">Revisado el {data.fecha.split("-").reverse().join("/")} · {old?"Necesita actualización":"Información de esa fecha"}. {mode!=="compras"&&"No es una conexión bancaria en vivo."}</p>
      {mode!=="compras"&&<>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{indicadores?.map(i=><div key={i.nombre} className="border-t border-cdm-line pt-3"><dt className="text-sm">{i.nombre}</dt><dd className="mt-2 text-2xl font-semibold tracking-tight">{i.valor}</dd><dd className="mt-2 text-xs leading-relaxed text-cdm-muted">{i.detalle}</dd></div>)}</dl>
        {mode==="economia"&&<>
          <p className="mt-6 text-sm leading-relaxed text-cdm-muted">{data.resumen}</p>
          <details className="mt-5 border-t border-cdm-line"><summary className="min-h-12 cursor-pointer py-4 font-semibold">Por resolver · {data.pendientes.length} temas</summary><ul className="space-y-4 text-sm">{data.pendientes.map(p=><li key={p.titulo}><h3 className="font-semibold">{p.titulo}</h3><p className="mt-1 leading-relaxed text-cdm-muted">{p.detalle}</p></li>)}</ul><Link href="/pendientes" className="mt-4 inline-flex min-h-11 items-center underline">Ir a pendientes</Link></details>
          <details className="border-t border-cdm-line"><summary className="min-h-12 cursor-pointer py-4 font-semibold">Cuánto dejan los proyectos</summary><p className="mb-4 text-sm text-cdm-muted">Margen bruto: falta descontar estructura e impuestos. Una obra abierta tiene resultado provisional.</p><ul className="grid gap-5 sm:grid-cols-2">{data.margenes.map(m=><li key={m.obra} className="border border-cdm-line p-4"><h3 className="font-semibold">{m.obra}</h3><p className="mt-2 text-2xl font-semibold">{(m.margen*100).toFixed(1)}%</p><p className="mt-2 text-sm">Venta {formatMoneyInt(m.venta)} · costo {formatMoneyInt(m.costo)}</p><p className="mt-1 text-sm">Diferencia bruta {formatMoneyInt(m.venta-m.costo)}</p><p className="mt-2 text-xs leading-relaxed text-cdm-muted">{m.nota}</p></li>)}</ul></details>
        </>}
      </>}
      {mode==="compras"&&<>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2">{data.compras.map((c,index)=><li key={c.dia} className="border border-cdm-line p-4"><span className="text-xs text-cdm-muted">0{index+1}</span><h2 className="mt-2 text-lg font-semibold">{c.dia}</h2><p className="mt-1 text-sm font-medium">{c.lugar}</p><p className="mt-3 text-sm leading-relaxed text-cdm-muted">{c.accion}</p></li>)}</ol>
        <h2 className="mt-7 text-xl font-semibold">Tu lista para 7 días</h2>
        <ul className="mt-4 divide-y divide-cdm-line">{data.canasta.map(c=><li key={c} className="py-3 text-sm leading-relaxed">{c}</li>)}</ul>
        <p className="mt-4 text-xs leading-relaxed text-cdm-muted">Dieta confirmada: carne pesada en crudo; fruta 100 g y miel una cucharada por merienda. Freezer superior de heladera. Descontá stock antes de comprar. Las promociones y precios requieren verificación vigente; esta lista no representa un pedido realizado.</p>
        <details className="mt-5 border-t border-cdm-line"><summary className="min-h-12 cursor-pointer py-4 font-semibold">Cómo evitar cargas repetidas</summary><p className="text-sm leading-relaxed">Usá Registrar para guardar el comprobante, la cuenta y si fue personal, empresa o proyecto. Si el movimiento ya vino del banco, completá su identificación al conciliar. El pago del resumen no vuelve a contarse como compra.</p></details>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/gasto" className="inline-flex min-h-11 items-center border border-cdm-fg px-4 text-sm">Registrar compra</Link><Link href="/inventario" className="inline-flex min-h-11 items-center border border-cdm-line px-4 text-sm">Materiales y herramientas de obra</Link></div>
      </>}
    </>}
  </motion.section>;
}
