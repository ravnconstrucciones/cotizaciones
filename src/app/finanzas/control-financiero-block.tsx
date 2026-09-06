"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";

type Revision = {
  fecha: string;
  resumen: string;
  indicadores: { nombre: string; valor: string; detalle: string }[];
  pendientes: { titulo: string; detalle: string }[];
  margenes: { obra: string; venta: number; costo: number; margen: number; nota: string }[];
  compras: { dia: string; lugar: string; accion: string }[];
  canasta: string[];
};
export function ControlFinancieroBlock() {
  const [data, setData] = useState<Revision | null>(null);
  const [estado, setEstado] = useState("cargando");
  const reduced = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/finanzas/control", { cache: "no-store", signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(j => { setData(j.revision?.contenido?.informe ?? null); setEstado("ok"); })
      .catch(e => { if (e.name !== "AbortError") setEstado("error"); });
    return () => controller.abort();
  }, []);
  const old = data ? Date.now() - Date.parse(`${data.fecha}T12:00:00-03:00`) > 7 * 86400000 : false;
  return (
    <motion.section initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2 }} aria-label="Control financiero" className="mb-5 border border-cdm-line p-5">
      <p className="text-xs uppercase tracking-widest text-cdm-muted">Primero, tu caja real</p>
      <h2 className="mt-2 text-xl font-semibold">Tu presupuesto necesita respaldo</h2>
      <p className="mt-2 text-sm leading-relaxed">El presupuesto de abajo reparte un tope. Antes de gastar, verificá saldos, deuda de tarjetas, cobros y pagos pendientes. Un gasto sin registrar puede hacer que parezca que sobra plata.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link className="inline-flex min-h-11 items-center border border-cdm-fg px-4 text-sm" href="/gasto">Registrar gasto con cuenta</Link>
        <Link className="inline-flex min-h-11 items-center border border-cdm-line px-4 text-sm" href="/dinero">Revisar caja</Link>
      </div>
      {estado === "cargando" && <p className="mt-4 text-sm" role="status">Leyendo tu última revisión…</p>}
      {estado === "error" && <p className="mt-4 text-sm" role="alert">No se pudo cargar la revisión. Actualizá la página; este error no significa que no haya pendientes.</p>}
      {estado === "ok" && !data && <p className="mt-4 text-sm">Todavía no hay una revisión financiera guardada.</p>}
      {data && <>
        <p className="mt-5 text-xs text-cdm-muted">Revisión del {data.fecha.split("-").reverse().join("/")} · {old ? "Necesita actualizarse" : "Foto de esa fecha, no saldo bancario en vivo"}</p>
        <p className="mt-2 text-sm leading-relaxed">{data.resumen}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">{data.indicadores.map(i => <div key={i.nombre} className="border-t border-cdm-line pt-3"><dt className="text-sm">{i.nombre}</dt><dd className="mt-1 text-xl font-semibold">{i.valor}</dd><dd className="mt-1 text-xs leading-relaxed text-cdm-muted">{i.detalle}</dd></div>)}</dl>
        <details className="mt-5 border-t border-cdm-line pt-2"><summary className="min-h-11 cursor-pointer py-3 font-medium">Qué falta registrar o conciliar</summary><ul className="space-y-4 text-sm">{data.pendientes.map(p => <li key={p.titulo}><strong>{p.titulo}</strong><p className="mt-1 leading-relaxed text-cdm-muted">{p.detalle}</p></li>)}</ul></details>
        <details className="border-t border-cdm-line pt-2"><summary className="min-h-11 cursor-pointer py-3 font-medium">Cuánto dejan las obras</summary><p className="mb-3 text-sm">Margen bruto sobre venta: falta descontar estructura e impuestos. El dinero cobrado se revisa por separado.</p><ul className="space-y-4 text-sm">{data.margenes.map(m => <li key={m.obra}><strong>{m.obra} · {(m.margen * 100).toFixed(1)}%</strong><p>Venta {formatMoneyInt(m.venta)} − costos {formatMoneyInt(m.costo)} = {formatMoneyInt(m.venta-m.costo)}</p><p className="mt-1 text-cdm-muted">{m.nota}</p></li>)}</ul><Link href="/cashflow" className="mt-4 inline-flex min-h-11 items-center underline">Abrir obras y cobros</Link></details>
        <details className="border-t border-cdm-line pt-2"><summary className="min-h-11 cursor-pointer py-3 font-medium">Mi compra semanal</summary><ul className="space-y-3 text-sm">{data.compras.map(c => <li key={c.dia}><strong>{c.dia} · {c.lugar}</strong><p className="mt-1 leading-relaxed">{c.accion}</p></li>)}</ul><p className="mt-4 font-medium">Lista para 7 días · descontá lo que ya tenés</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{data.canasta.map(c => <li key={c}>{c}</li>)}</ul><p className="mt-3 text-xs text-cdm-muted">Cantidades basadas en tu dieta. Falta confirmar peso crudo/cocido de carnes, porción de fruta y miel, y stock. Las promociones se verifican antes de pagar.</p></details>
      </>}
    </motion.section>
  );
}
