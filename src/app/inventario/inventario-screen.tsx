"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, Boxes, History, Mic, Search, Square, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cantidadItem, interpretarMovimiento, normalizarBusqueda, RUBRO_LABELS, type BorradorMovimiento, type InventarioItem, type InventarioUbicacion } from "@/lib/inventario";

type Movimiento = { id: string; item_id: string; origen_id: string; destino_id: string; texto_original: string | null; nota: string | null; creado_at: string };
type Datos = { items: InventarioItem[]; ubicaciones: InventarioUbicacion[]; movimientos: Movimiento[] };
type Voz = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };
type VozCtor = new () => Voz;

function vozCtor(): VozCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: VozCtor; webkitSpeechRecognition?: VozCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function InventarioScreen() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [ubicacion, setUbicacion] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [vista, setVista] = useState<"stock" | "revision" | "historial">("stock");
  const [comando, setComando] = useState("");
  const [borrador, setBorrador] = useState<BorradorMovimiento | null>(null);
  const [mensajeInterpretacion, setMensajeInterpretacion] = useState<string | null>(null);
  const [escuchando, setEscuchando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const vozRef = useRef<Voz | null>(null);
  const reducirMovimiento = useReducedMotion();

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/inventario", { cache: "no-store" });
      const json = await res.json() as Datos & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el inventario.");
      setDatos(json); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Error de red"); }
  }, []);
  useEffect(() => { void cargar(); return () => vozRef.current?.stop(); }, [cargar]);

  const items = useMemo(() => {
    if (!datos) return [];
    const q = normalizarBusqueda(busqueda);
    return datos.items.filter((item) => {
      if (vista === "revision" && item.estado_revision === "confirmado") return false;
      if (ubicacion !== "todas" && item.ubicacion_id !== ubicacion) return false;
      if (tipo !== "todos" && item.tipo !== tipo) return false;
      return !q || normalizarBusqueda(`${item.nombre} ${RUBRO_LABELS[item.rubro] ?? item.rubro}`).includes(q);
    });
  }, [datos, busqueda, ubicacion, tipo, vista]);

  const porRubro = useMemo(() => Object.entries(items.reduce<Record<string, InventarioItem[]>>((acc, item) => { (acc[item.rubro] ??= []).push(item); return acc; }, {})), [items]);
  const ubicacionPorId = useMemo(() => new Map((datos?.ubicaciones ?? []).map((u) => [u.id, u])), [datos]);
  const itemPorId = useMemo(() => new Map((datos?.items ?? []).map((i) => [i.id, i])), [datos]);

  function interpretar(texto = comando) {
    if (!datos || !texto.trim()) return;
    const r = interpretarMovimiento(texto, datos.items, datos.ubicaciones);
    setBorrador(r.borrador);
    setMensajeInterpretacion(r.borrador ? null : `No pude identificar ${r.faltantes.join(" y ")}. Elegilos en la confirmación.`);
    if (!r.borrador) {
      setBorrador({ item_id: datos.items[0]?.id ?? "", origen_id: datos.items[0]?.ubicacion_id ?? "", destino_id: "", texto_original: texto.trim() });
    }
  }

  function alternarVoz() {
    if (escuchando) { vozRef.current?.stop(); return; }
    const Ctor = vozCtor();
    if (!Ctor) { setError("Este navegador no permite dictado. Escribí el movimiento."); return; }
    const rec = new Ctor(); rec.lang = "es-AR"; rec.interimResults = false; rec.continuous = false;
    rec.onresult = (e) => { const t = Array.from(e.results, (r) => r[0]?.transcript ?? "").join(" ").trim(); if (t) { setComando(t); interpretar(t); } };
    rec.onend = () => setEscuchando(false); rec.onerror = () => { setEscuchando(false); setError("No pude escuchar el dictado. Revisá el permiso del micrófono."); };
    vozRef.current = rec; setEscuchando(true); setError(null); rec.start();
  }

  function cambiarItem(itemId: string) {
    if (!borrador || !datos) return;
    const item = datos.items.find((x) => x.id === itemId);
    setBorrador({ ...borrador, item_id: itemId, origen_id: item?.ubicacion_id ?? "" });
  }

  async function confirmar() {
    if (!borrador?.item_id || !borrador.destino_id || borrador.origen_id === borrador.destino_id) { setMensajeInterpretacion("Elegí un ítem y un destino distinto del origen."); return; }
    setGuardando(true); setError(null);
    try {
      const res = await fetch("/api/inventario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(borrador) });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudo mover el ítem.");
      setOk("Movimiento registrado."); setBorrador(null); setComando(""); setMensajeInterpretacion(null); await cargar();
      window.setTimeout(() => setOk(null), 4000);
    } catch (e) { setError(e instanceof Error ? e.message : "Error de red"); } finally { setGuardando(false); }
  }

  return (
    <div className="min-h-dvh bg-[#070707] text-[#f2efe8]">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <motion.header initial={reducirMovimiento ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="border-b border-white/20 pb-7">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-white/50">Operación / Depósito</p><h1 className="mt-2 text-4xl font-black uppercase tracking-[-0.04em] sm:text-6xl">Inventario</h1><p className="mt-3 max-w-xl text-base leading-relaxed text-white/60">Qué hay, dónde está y cómo se movió. Las obras activas se incorporan automáticamente.</p></div>
            {datos && <div className="flex gap-6 border-l border-white/20 pl-5 tabular-nums"><div><b className="block text-2xl">{datos.items.length}</b><span className="text-xs uppercase tracking-wider text-white/50">Ítems</span></div><div><b className="block text-2xl">{datos.items.filter(i => i.estado_revision !== "confirmado").length}</b><span className="text-xs uppercase tracking-wider text-amber-300">A revisar</span></div></div>}
          </div>
        </motion.header>

        <section aria-labelledby="movimiento-title" className="mt-6 border border-white/25 bg-white/[0.04] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><h2 id="movimiento-title" className="text-lg font-bold">Mover por voz o texto</h2><p className="mt-1 text-sm text-white/50">Interpretamos primero. Vos corregís y confirmás después.</p></div><button type="button" onClick={alternarVoz} className="flex min-h-12 min-w-12 items-center justify-center border border-white/30 transition-colors hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={escuchando ? "Detener dictado" : "Dictar movimiento"}>{escuchando ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button></div>
          <form onSubmit={(e) => { e.preventDefault(); interpretar(); }} className="mt-4 flex flex-col gap-3 sm:flex-row"><label htmlFor="movimiento" className="sr-only">Movimiento en lenguaje natural</label><input id="movimiento" value={comando} onChange={(e) => setComando(e.target.value)} placeholder="Ej.: mandé la amoladora del depósito a Pueyrredón" className="min-h-12 flex-1 border border-white/25 bg-black px-4 text-base outline-none placeholder:text-white/30 focus:border-white"/><button className="min-h-12 border border-[#f2efe8] bg-[#f2efe8] px-6 text-sm font-bold uppercase tracking-wider text-[#070707] disabled:opacity-40" disabled={!comando.trim()}>Interpretar</button></form>
          {escuchando && <p className="mt-3 text-sm font-semibold text-red-300" role="status">Escuchando… tocá el cuadrado para terminar.</p>}
          <AnimatePresence>{borrador && datos && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 border-t border-white/20 pt-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Confirmación editable</p><div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]"><Select label="Ítem" value={borrador.item_id} onChange={cambiarItem} options={datos.items.map(i => ({ value: i.id, label: i.nombre }))}/><ArrowRight className="hidden self-end mb-3 h-5 w-5 text-white/40 md:block"/><Select label="Origen" value={borrador.origen_id} onChange={(v) => setBorrador({ ...borrador, origen_id: v })} options={datos.ubicaciones.map(u => ({ value: u.id, label: u.nombre }))}/><ArrowRight className="hidden self-end mb-3 h-5 w-5 text-white/40 md:block"/><Select label="Destino" value={borrador.destino_id} onChange={(v) => setBorrador({ ...borrador, destino_id: v })} options={[{ value: "", label: "Elegir destino" }, ...datos.ubicaciones.map(u => ({ value: u.id, label: u.nombre }))]}/></div>{mensajeInterpretacion && <p className="mt-3 text-sm text-amber-300" role="alert">{mensajeInterpretacion}</p>}<div className="mt-4 flex flex-wrap gap-3"><button onClick={() => void confirmar()} disabled={guardando} className="min-h-11 bg-[#f2efe8] px-5 text-sm font-bold text-[#070707] disabled:opacity-50">{guardando ? "Registrando…" : "Confirmar movimiento"}</button><button onClick={() => setBorrador(null)} className="min-h-11 border border-white/30 px-5 text-sm">Cancelar</button></div></motion.div>}</AnimatePresence>
        </section>

        {(error || ok) && <div className={`mt-4 border p-3 text-sm ${error ? "border-red-400/60 text-red-300" : "border-emerald-400/60 text-emerald-300"}`} role="status">{error ?? ok}</div>}

        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Vistas de inventario">
          <Tab active={vista === "stock"} onClick={() => setVista("stock")} icon={Boxes}>Stock</Tab><Tab active={vista === "revision"} onClick={() => setVista("revision")} icon={AlertTriangle}>Revisar</Tab><Tab active={vista === "historial"} onClick={() => setVista("historial")} icon={History}>Historial</Tab>
        </div>

        {vista !== "historial" && <><div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="relative"><span className="sr-only">Buscar inventario</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-white/40"/><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar ítem o rubro" className="min-h-11 w-full border border-white/20 bg-transparent pl-10 pr-3 text-base outline-none focus:border-white"/></label><SelectSimple label="Ubicación" value={ubicacion} onChange={setUbicacion} options={[{ value: "todas", label: "Todas las ubicaciones" }, ...(datos?.ubicaciones.map(u => ({ value: u.id, label: u.nombre })) ?? [])]}/><SelectSimple label="Tipo" value={tipo} onChange={setTipo} options={[{ value: "todos", label: "Herramientas y materiales" }, { value: "herramienta", label: "Herramientas" }, { value: "material", label: "Materiales" }]}/></div>
          {!datos ? <div className="mt-8 grid gap-3 sm:grid-cols-2"><div className="h-32 animate-pulse bg-white/5"/><div className="h-32 animate-pulse bg-white/5"/></div> : <div className="mt-7 space-y-8">{porRubro.map(([rubro, grupo]) => <section key={rubro}><div className="flex items-end justify-between border-b border-white/20 pb-2"><h2 className="text-lg font-bold uppercase tracking-wide">{RUBRO_LABELS[rubro] ?? rubro}</h2><span className="text-xs text-white/40">{grupo.length} ítems</span></div><div className="grid gap-px bg-white/15 sm:grid-cols-2 lg:grid-cols-3">{grupo.map(item => <article key={item.id} className="min-w-0 bg-[#070707] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold leading-snug">{item.nombre}</h3><p className="mt-1 text-sm text-white/55">{cantidadItem(item)} · {ubicacionPorId.get(item.ubicacion_id)?.nombre ?? "Ubicación no disponible"}</p></div>{item.tipo === "herramienta" && <Wrench className="h-4 w-4 shrink-0 text-white/45" aria-label="Herramienta"/>}</div>{item.estado_revision !== "confirmado" && <div className="mt-3 border-l-2 border-amber-300 pl-3 text-xs leading-relaxed text-amber-200"><b>Revisar:</b> {item.nota_revision}</div>}</article>)}</div></section>)}{porRubro.length === 0 && <p className="border border-white/20 p-8 text-center text-white/50">No hay ítems para estos filtros.</p>}</div>}</>}

        {vista === "historial" && <div className="mt-6"><h2 className="sr-only">Historial de movimientos</h2>{!datos ? <div className="h-32 animate-pulse bg-white/5"/> : datos.movimientos.length === 0 ? <p className="border border-white/20 p-8 text-center text-white/50">Todavía no hay movimientos confirmados.</p> : <ol className="divide-y divide-white/15 border-y border-white/15">{datos.movimientos.map(m => <li key={m.id} className="grid gap-2 py-4 sm:grid-cols-[160px_1fr] sm:gap-6"><time className="text-xs tabular-nums text-white/45">{new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(m.creado_at))}</time><div><p className="font-semibold">{itemPorId.get(m.item_id)?.nombre ?? "Ítem"}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/55"><span>{ubicacionPorId.get(m.origen_id)?.nombre ?? "Origen"}</span><ArrowRight className="h-4 w-4"/><span>{ubicacionPorId.get(m.destino_id)?.nombre ?? "Destino"}</span></p>{m.texto_original && <p className="mt-2 text-xs italic text-white/35">“{m.texto_original}”</p>}</div></li>)}</ol>}</div>}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange(v: string): void; options: { value: string; label: string }[] }) { return <label className="block"><span className="mb-1 block text-xs text-white/50">{label}</span><select value={value} onChange={e => onChange(e.target.value)} className="min-h-12 w-full border border-white/25 bg-black px-3 text-base focus:border-white focus:outline-none">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function SelectSimple(props: Parameters<typeof Select>[0]) { return <Select {...props}/>; }
function Tab({ active, onClick, icon: Icon, children }: { active: boolean; onClick(): void; icon: typeof Boxes; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex min-h-11 items-center gap-2 border px-4 text-sm font-semibold transition-colors ${active ? "border-[#f2efe8] bg-[#f2efe8] text-[#070707]" : "border-white/25 text-white/65 hover:border-white"}`}><Icon className="h-4 w-4"/>{children}</button>; }
