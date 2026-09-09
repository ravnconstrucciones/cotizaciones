"use client";
import { useRef, useState, type ReactNode } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { comprimirPortada } from "@/lib/comprimir-portada";

export const money = (n: number | null | undefined) => n == null ? "Sin dato" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
export const number = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
export const surface = "rounded-2xl border border-cdm-line bg-cdm-panel";
export const control = "min-h-11 rounded-xl border border-cdm-line bg-cdm-panel px-3 py-2 text-sm text-cdm-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cdm-fg disabled:opacity-50";

export function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="min-w-0"><p className="text-xs font-medium text-cdm-muted">{label}</p><p className="mt-1 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>{detail && <p className="mt-1 text-xs leading-relaxed text-cdm-muted">{detail}</p>}</div>;
}
export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.header initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }} className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[.16em] text-cdm-muted">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-cdm-muted">{description}</p></div>{action}</motion.header>;
}
export function CostBar({ total, mo, otros }: { total: number | null; mo: number; otros: number }) {
  const base = Math.max(total ?? 0, mo + otros, 1);
  const remaining = Math.max(0, (total ?? 0) - mo - otros);
  return <div><div role="img" aria-label={`Mano de obra ${money(mo)}, otros costos ${money(otros)}${total != null ? `, resultado ${money(total - mo - otros)}` : ""}`} className="flex h-2.5 overflow-hidden rounded-full bg-cdm-fg/10"><span className="bg-cdm-fg" style={{ width: `${mo / base * 100}%` }} /><span className="bg-cdm-fg/45" style={{ width: `${otros / base * 100}%` }} /><span className="bg-cdm-fg/15" style={{ width: `${remaining / base * 100}%` }} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-cdm-muted"><span>■ Mano de obra</span><span>▨ Otros costos</span>{total != null && <span>□ Resultado</span>}</div></div>;
}
export function LoadingCards() {
  return <div role="status" aria-label="Cargando datos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0,1,2].map(i=><div key={i} className={`${surface} h-64 p-5`}><div className="h-5 w-2/3 rounded bg-cdm-fg/10"/><div className="mt-8 h-9 w-1/2 rounded bg-cdm-fg/10"/><p className="mt-8 text-sm text-cdm-muted">Cargando registros…</p></div>)}</div>;
}
export function FotoPortada({ id, tieneFoto, onFoto }: { id: string; tieneFoto: boolean; onFoto: (url: string)=>void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function subir(file: File) {
    setBusy(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", await comprimirPortada(file));
      const res = await fetch(`/api/obras/${id}/portada`, { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || "No se pudo guardar la foto.");
      onFoto(body.url);
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo subir."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div className="relative"><input ref={input} type="file" accept="image/*" className="hidden" aria-label="Foto de portada" onChange={e=>{const f=e.target.files?.[0]; if(f) void subir(f);}}/><button type="button" disabled={busy} onClick={()=>input.current?.click()} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-medium text-cdm-muted hover:text-cdm-fg focus-visible:outline-2">{busy ? <LoaderCircle size={15}/> : <Camera size={15}/>} {busy ? "Guardando foto…" : tieneFoto ? "Cambiar foto" : "Agregá una foto de esta obra"}</button>{error && <p role="alert" className="text-xs">{error}</p>}</div>;
}
