"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchCompartido } from "@/lib/fetch-compartido";
import type { EconomiaObra } from "@/lib/economia-obras";
import { useRealtimeTable } from "./use-realtime-table";
let ultimo: { proyectos: EconomiaObra[]; fecha: number } | null = null;
export function useEconomiaObras() {
  const [proyectos, setProyectos] = useState<EconomiaObra[] | null>(()=>ultimo?.proyectos ?? null);
  const [error, setError] = useState("");
  const cargar = useCallback(async()=>{
    try {
      const res = await fetchCompartido("/api/proyectos");
      const body = res.body as {proyectos?: EconomiaObra[]; error?:string};
      if (!res.ok || !body.proyectos) throw new Error(body.error || "No se pudieron actualizar los proyectos.");
      ultimo = { proyectos: body.proyectos, fecha: Date.now() }; setProyectos(body.proyectos); setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo conectar."); }
  },[]);
  useEffect(()=>{if(!ultimo || Date.now()-ultimo.fecha>15000) void cargar();},[cargar]);
  useRealtimeTable("presupuestos_gastos", cargar);
  useRealtimeTable("cashflow_items", cargar);
  useRealtimeTable("obras", cargar);
  const onFoto = (id:string, url:string)=>setProyectos(prev=>{const next=prev?.map(p=>p.id===id?{...p,fotoUrl:url}:p) ?? null; if(next) ultimo={proyectos:next,fecha:Date.now()};return next;});
  return {proyectos,error,cargar,onFoto};
}
