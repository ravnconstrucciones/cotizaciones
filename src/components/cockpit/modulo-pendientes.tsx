"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { useRefrescoAlVolver } from "@/hooks/use-refresco-al-volver";
import { Panel } from "./panel";
import type { Tarea } from "@/types/centro-mando";

function fmtFecha(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Un color por área para escanear de un vistazo (dots/acentos, se leen en
 *  ambos temas). Tonos medios, no chillones. */
const AREA_COLOR: Record<string, string> = {
  OBRA: "#22d3ee", // cian (el core)
  FINANZAS: "#fbbf24", // ámbar
  COMPRAS: "#34d399", // verde
  GESTIONES: "#a78bfa", // violeta
  PERSONAL: "#60a5fa", // azul
  SALUD: "#fb7185", // rosa
  CONTENIDO: "#f472b6", // fucsia
  PUBLICIDAD: "#fb923c", // naranja
  INMOBILIARIO: "#2dd4bf", // teal
  OTROS: "#94a3b8", // gris
};

/** Orden de las secciones: la obra primero (es el core), después el resto. */
const AREA_ORDEN = [
  "OBRA",
  "FINANZAS",
  "COMPRAS",
  "INMOBILIARIO",
  "GESTIONES",
  "PUBLICIDAD",
  "CONTENIDO",
  "SALUD",
  "PERSONAL",
  "OTROS",
];

/** Normaliza la categoría libre de la tarea a un área conocida. */
function areaDe(cat: string | null): string {
  const c = (cat ?? "").toUpperCase();
  if (c.startsWith("OBRA")) return "OBRA";
  if (c.startsWith("FINANZAS")) return "FINANZAS";
  if (c.startsWith("COMPRA")) return "COMPRAS";
  if (c.startsWith("GESTION")) return "GESTIONES";
  if (c.startsWith("PERSONAL")) return "PERSONAL";
  if (c.startsWith("SALUD")) return "SALUD";
  if (c.startsWith("CONTENIDO")) return "CONTENIDO";
  if (c.startsWith("PUBLICIDAD") || c.includes("AGENCIA")) return "PUBLICIDAD";
  if (c.startsWith("INMOBILIARIO")) return "INMOBILIARIO";
  return "OTROS";
}

function colorDe(area: string): string {
  return AREA_COLOR[area] ?? AREA_COLOR.OTROS;
}

/** Módulo 4: tabla `tareas` unificada — única fuente de pendientes (spec §4.4).
 *  `tactil`: variante /pendientes para el cel — tap targets grandes y la cruz
 *  de borrar siempre visible (en touch no existe el hover). */
export function ModuloPendientes({ className, tactil = false }: { className?: string; tactil?: boolean }) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tareas")
      .select("*")
      .eq("estado", "pendiente")
      .order("fecha", { ascending: true, nullsFirst: false })
      .order("creado_at", { ascending: true });
    if (error) {
      setError(error.message);
      return;
    }
    setError(null);
    setTareas((data as Tarea[]) ?? []);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);
  useRefrescoAlVolver(cargar);
  useRealtimeTable("tareas", cargar);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    const texto = nueva.trim();
    if (!texto) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("tareas")
      .insert({ texto, origen: "web" });
    if (error) {
      setError(error.message);
      return;
    }
    setNueva("");
    await cargar();
  }

  // Tilde/borrado OPTIMISTA (pedido de Eze 17/07): el ítem sale de la lista al
  // toque y la base se actualiza atrás. Solo si el update falla se recarga
  // (el ítem reaparece — nunca queda tildado en la pantalla y vivo en la base).
  async function completar(id: string) {
    setTareas((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    const { error } = await supabase.from("tareas").update({ estado: "hecha" }).eq("id", id);
    if (error) await cargar();
  }

  async function borrar(id: string) {
    setTareas((prev) => prev.filter((t) => t.id !== id));
    const supabase = createClient();
    const { error } = await supabase.from("tareas").delete().eq("id", id);
    if (error) await cargar();
  }

  // Pendientes sectorizados por área, en el orden definido; solo las que tienen.
  const grupos = AREA_ORDEN.map((area) => ({
    area,
    color: colorDe(area),
    items: tareas.filter((t) => areaDe(t.categoria) === area),
  })).filter((g) => g.items.length > 0);

  return (
    <Panel
      titulo="Pendientes"
      className={className}
      accion={
        <span className="flex items-baseline gap-2.5">
          {tareas.length > 0 && (
            <span className="font-mono-hud text-[9px] tabular-nums text-cdm-muted">
              {tareas.length}
            </span>
          )}
          {/* En /pendientes ya estás ahí — el link solo tiene sentido en la home. */}
          {!tactil && (
            <Link
              href="/pendientes"
              className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-cyan-700 dark:text-zinc-400 dark:hover:text-cyan-300"
            >
              Pantalla completa →
            </Link>
          )}
        </span>
      }
    >
      <form onSubmit={agregar} className="mb-3 flex">
        <input
          type="text"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Anotar pendiente…"
          className={`font-raleway w-full border border-cdm-line bg-transparent text-cdm-fg placeholder:text-cdm-muted/50 focus:border-cdm-accent focus:outline-none ${tactil ? "px-4 py-3 text-sm" : "px-3 py-1.5 text-[11px]"}`}
        />
        <button
          type="submit"
          disabled={!nueva.trim()}
          className={`shrink-0 border border-l-0 border-cdm-line uppercase tracking-widest text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg disabled:opacity-30 ${tactil ? "px-5 text-sm" : "px-3 text-[10px]"}`}
        >
          +
        </button>
      </form>
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!error && tareas.length === 0 && (
        <p className="text-[11px] text-cdm-muted">Nada pendiente.</p>
      )}
      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {grupos.map((g) => (
            <motion.section
              key={g.area}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              // Acento de color del área en el borde izquierdo de la sección.
              className="border-l-2 pl-2.5"
              style={{ borderColor: g.color }}
            >
              {/* Encabezado del área: dot del color + nombre + cantidad. */}
              <div className="mb-1 flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <span
                  className="font-mono-hud text-[9px] font-medium uppercase tracking-[0.18em]"
                  style={{ color: g.color }}
                >
                  {g.area}
                </span>
                <span className="font-mono-hud text-[9px] tabular-nums text-cdm-muted/60">
                  {g.items.length}
                </span>
              </div>
              <ul className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {g.items.map((t) => (
                    <motion.li
                      key={t.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.12 }}
                      className={`group flex items-start ${tactil ? "gap-3 py-1 text-sm" : "gap-2 text-[11px]"}`}
                    >
                      <button
                        onClick={() => completar(t.id)}
                        aria-label="Marcar hecha"
                        className={`shrink-0 border border-cdm-line transition-colors hover:border-cdm-accent hover:bg-cdm-accent ${tactil ? "mt-0.5 h-5 w-5" : "mt-0.5 h-3 w-3"}`}
                      />
                      <span className="min-w-0 flex-1 leading-snug text-cdm-fg/85">
                        {t.texto}
                        {fmtFecha(t.fecha) && (
                          <span className={`ml-2 uppercase tracking-widest text-cdm-muted/70 ${tactil ? "text-[11px]" : "text-[9px]"}`}>
                            {fmtFecha(t.fecha)}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => borrar(t.id)}
                        aria-label="Eliminar"
                        className={`text-cdm-muted transition-opacity hover:text-red-400 ${tactil ? "px-2 text-lg leading-none" : "opacity-0 group-hover:opacity-100"}`}
                      >
                        ×
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </motion.section>
          ))}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
