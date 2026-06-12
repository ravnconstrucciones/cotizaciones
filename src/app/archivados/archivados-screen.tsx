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
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import type { Evento } from "@/types/centro-mando";

type ObraOpcion = {
  id: string;
  nombre_obra: string | null;
  nombre_cliente: string | null;
};

const DESTINO_LABEL: Record<DestinoArchivado, string> = {
  tarea: "Tarea",
  gasto_obra: "Gasto de obra",
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
  "w-full border border-cdm-line bg-transparent px-3 py-2 text-xs text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none";

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
            className={`border px-2.5 py-1 text-[9px] uppercase tracking-[0.15em] transition-colors ${
              destino === d
                ? "border-cdm-accent bg-cdm-accent text-cdm-bg"
                : "border-cdm-line text-cdm-muted hover:text-cdm-fg"
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
      {destino === "gasto_obra" && (
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
        className="w-full border border-cdm-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg disabled:opacity-40"
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
    <div className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="relative pb-3">
          {/* Línea de horizonte detrás del header — mismo lenguaje que historial/obras. */}
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            Archivados
          </h1>
        </div>
        <p className="mt-4 text-sm text-cdm-muted">
          Lo que el bot no pudo clasificar espera acá. Asignale un destino o descartalo —
          pérdida: cero.
        </p>

        {cargando && <p className="mt-8 text-[11px] text-cdm-muted">Cargando…</p>}
        {!cargando && eventos.length === 0 && (
          <div className="mt-8 flex h-24 items-center justify-center border border-dashed border-cdm-line">
            <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
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
              className="cdm-glass mt-4"
            >
              <button
                onClick={() => setAbierto((a) => (a === e.id ? null : e.id))}
                className="flex w-full items-baseline gap-3 px-4 py-3 text-left"
              >
                <span className="h-1.5 w-1.5 shrink-0 self-center bg-red-400" />
                <span className="min-w-0 flex-1 truncate text-sm text-cdm-fg">
                  {e.titulo}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-cdm-muted">
                  {fmtFechaHora(e.creado_at)}
                </span>
              </button>
              {abierto === e.id && (
                <>
                  <p className="border-t border-cdm-line px-4 py-2 text-[11px] text-cdm-muted">
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
