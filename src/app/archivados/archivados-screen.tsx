"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import {
  DESTINOS_ARCHIVADO,
  textoDeEvento,
  type DestinoArchivado,
} from "@/lib/archivados-destinos";
import type { Evento } from "@/types/centro-mando";

type ObraOpcion = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
};

const DESTINO_LABEL: Record<DestinoArchivado, string> = {
  tarea: "Tarea",
  gasto_obra: "Gasto de obra",
  foto_obra: "Foto de obra",
  gasto_personal: "Gasto personal",
  filosofia: "Filosofía",
  referencia_estetica: "Ref. estética",
  descartar: "Descartar",
};

const CATEGORIAS_GASTO = [
  "Supermercado",
  "Delivery",
  "Salidas",
  "Combustible",
  "Farmacia",
  "Ropa",
  "Varios",
];

const INPUT_CLS =
  "font-geist w-full rounded-lg border border-cdm-line bg-white/40 dark:bg-zinc-900/30 px-3 py-2 text-xs text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none";

function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FormResolver({
  evento,
  obras,
  onResuelto,
}: {
  evento: Evento;
  obras: ObraOpcion[];
  onResuelto: (id: string) => void;
}) {
  const [destino, setDestino] = useState<DestinoArchivado>("tarea");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [presupuestoId, setPresupuestoId] = useState("");
  const [etiquetas, setEtiquetas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolver(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/archivados/resolver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento_id: evento.id,
          destino,
          monto: monto ? Number(monto) : undefined,
          categoria: categoria || undefined,
          presupuesto_id: presupuestoId || undefined,
          etiquetas: etiquetas
            ? etiquetas.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      onResuelto(evento.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setEnviando(false);
    }
  }

  const pideMonto = destino === "gasto_obra" || destino === "gasto_personal";

  return (
    <form onSubmit={resolver} className="space-y-2 border-t border-cdm-line px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {DESTINOS_ARCHIVADO.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDestino(d)}
            className={`font-mono-hud rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] ring-1 transition-colors ${
              destino === d
                ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
            }`}
          >
            {DESTINO_LABEL[d]}
          </button>
        ))}
      </div>

      {pideMonto && (
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="Monto"
          data-no-spinner
          className={INPUT_CLS}
        />
      )}
      {(destino === "gasto_obra" || destino === "foto_obra") && (
        <select
          value={presupuestoId}
          onChange={(e) => setPresupuestoId(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Elegí la obra…</option>
          {obras.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre_obra || o.nombre_cliente || o.id.slice(0, 8)}
            </option>
          ))}
        </select>
      )}
      {destino === "gasto_personal" && (
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={INPUT_CLS}
        >
          <option value="">Categoría (Varios)</option>
          {CATEGORIAS_GASTO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      {destino === "referencia_estetica" && (
        <input
          type="text"
          value={etiquetas}
          onChange={(e) => setEtiquetas(e.target.value)}
          placeholder="Etiquetas separadas por coma (tipografia, material…)"
          className={INPUT_CLS}
        />
      )}

      {error && (
        <p className="text-[10px] uppercase tracking-widest text-red-400">{error}</p>
      )}
      <button
        type="submit"
        disabled={enviando}
        className="font-mono-hud w-full rounded-full ring-1 ring-cdm-accent/50 bg-cdm-accent/10 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-cdm-accent transition-colors hover:bg-cdm-accent/20 disabled:opacity-40"
      >
        {enviando ? "Resolviendo…" : destino === "descartar" ? "Descartar" : "Resolver"}
      </button>
    </form>
  );
}

/** UI Archivados (spec §4.7): nada se pierde — todo lo sin clasificar espera acá. */
export function ArchivadosScreen() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [obras, setObras] = useState<ObraOpcion[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [ev, ob] = await Promise.all([
      supabase
        .from("eventos")
        .select("*")
        .eq("estado", "archivado")
        .order("creado_at", { ascending: false }),
      supabase
        .from("presupuestos")
        .select("id, nombre_obra, nombre_cliente")
        .eq("presupuesto_aprobado", true)
        .order("created_at", { ascending: false }),
    ]);
    setEventos((ev.data as Evento[]) ?? []);
    setObras((ob.data as ObraOpcion[]) ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRealtimeTable("eventos", cargar);

  function quitarResuelto(id: string) {
    setEventos((es) => es.filter((e) => e.id !== id));
    setAbierto(null);
  }

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-8 text-cdm-fg sm:px-8">
      <div className="relative z-10 mx-auto max-w-3xl">
        {/* Header — mismo lenguaje que ObrasScreen */}
        <header className="mb-6">
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Archivados
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Bandeja sin clasificar · pérdida cero
          </p>
        </header>

        {cargando && (
          <p className="font-mono-hud text-[11px] uppercase tracking-[0.14em] text-cdm-muted">
            Cargando…
          </p>
        )}
        {!cargando && eventos.length === 0 && (
          <div className="mt-4 flex h-24 items-center justify-center rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40">
            <span className="font-mono-hud text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Nada sin clasificar. Pérdida: cero.
            </span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {eventos.map((e) => (
            <motion.div
              key={e.id}
              layout
              exit={{ opacity: 0, x: 24 }}
              className="mt-4 overflow-hidden rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40"
            >
              <button
                onClick={() => setAbierto((a) => (a === e.id ? null : e.id))}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                <span className="font-geist min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-cdm-fg">
                  {e.titulo}
                </span>
                <span className="font-mono-hud shrink-0 text-[10px] tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
              </button>
              {abierto === e.id && (
                <>
                  <p className="border-t border-cdm-line px-4 py-2.5 font-geist text-[11px] italic text-cdm-muted">
                    &ldquo;{textoDeEvento(e)}&rdquo;
                  </p>
                  <FormResolver evento={e} obras={obras} onResuelto={quitarResuelto} />
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
