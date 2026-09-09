"use client";
import {useEffect,useState} from "react";
import type {Operario} from "@/lib/operarios";
export function SelectorOperario({value,onChange}:{value:string|null;onChange:(id:string|null)=>void}){
  const [operarios,setOperarios]=useState<Operario[]>([]),[error,setError]=useState(false),[intento,setIntento]=useState(0);
  useEffect(()=>{
    const abort=new AbortController();
    setError(false);
    void fetch("/api/mano-obra/operarios",{signal:abort.signal}).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(j=>setOperarios(j.operarios)).catch(()=>{if(!abort.signal.aborted)setError(true);});
    return()=>abort.abort();
  },[intento]);
  return <div className="mt-4"><label htmlFor="operario" className="text-xs text-cdm-muted">Operario, si es un pago al personal</label><select id="operario" value={value??""} onChange={e=>onChange(e.target.value||null)} className="mt-1.5 min-h-11 w-full rounded-none border border-cdm-line bg-cdm-panel px-3 text-base text-cdm-fg"><option value="">Sin vincular a operario</option>{operarios.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select>{error&&<button type="button" onClick={()=>setIntento(n=>n+1)} className="mt-2 min-h-11 text-xs underline">No se cargaron los operarios. Reintentar.</button>}</div>;
}
