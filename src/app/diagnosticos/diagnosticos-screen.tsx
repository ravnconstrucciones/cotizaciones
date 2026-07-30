"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import {
  ESTADO_COLOR,
  ESTADO_LABEL,
  type DiagnosticoListado,
  type EstadoDiagnostico,
} from "./tipos";

// Arranca por "Todos": son pocos y el que está a medio armar es justo el que hay
// que ver. Espeja el lenguaje de chips de /cotizaciones.
const FILTROS: Array<{ valor: EstadoDiagnostico | "todos"; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "borrador", etiqueta: "Borradores" },
  { valor: "listo", etiqueta: "Listos" },
  { valor: "enviado", etiqueta: "Enviados" },
  { valor: "cotizado", etiqueta: "Cotizados" },
];

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

export function DiagnosticosScreen() {
  const router = useRouter();
  const [diagnosticos, setDiagnosticos] = useState<DiagnosticoListado[]>([]);
  const [filtro, setFiltro] = useState<EstadoDiagnostico | "todos">("todos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nuevoTitulo, setNuevoTitulo] = useState("");
  const [creando, setCreando] = useState(false);

  async function crearNuevo(e: React.FormEvent) {
    e.preventDefault();
    const titulo = nuevoTitulo.trim();
    if (!titulo || creando) return;
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnosticos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al crear");
      router.push(`/diagnosticos/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
      setCreando(false);
    }
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = filtro === "todos" ? "" : `?estado=${filtro}`;
      const res = await fetch(`/api/diagnosticos${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setDiagnosticos((json.diagnosticos ?? []) as DiagnosticoListado[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      <header className="relative z-10 flex flex-wrap items-baseline justify-between gap-4 px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Diagnósticos
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Relevamiento de campo · documento al cliente
          </p>
        </div>

        {!nuevaAbierta ? (
          <button
            onClick={() => setNuevaAbierta(true)}
            className="font-mono-hud inline-flex items-center gap-1.5 rounded-full border border-cdm-accent/50 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/10"
          >
            + Nuevo diagnóstico
          </button>
        ) : (
          <form onSubmit={crearNuevo} className="flex items-center gap-2">
            <input
              autoFocus
              value={nuevoTitulo}
              onChange={(e) => setNuevoTitulo(e.target.value)}
              placeholder="Título del trabajo"
              disabled={creando}
              className="w-56 border-0 border-b border-cdm-line bg-transparent px-1 py-1.5 text-xs text-cdm-fg placeholder:text-cdm-muted/50 focus-visible:border-cdm-accent focus-visible:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={creando || !nuevoTitulo.trim()}
              className="font-mono-hud inline-flex items-center rounded-full border border-cdm-accent/50 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent transition-colors hover:bg-cdm-accent/10 disabled:opacity-40"
            >
              {creando ? "Creando…" : "Crear"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNuevaAbierta(false);
                setNuevoTitulo("");
              }}
              disabled={creando}
              className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-cdm-muted transition-colors hover:text-cdm-fg disabled:opacity-40"
            >
              Cancelar
            </button>
          </form>
        )}
      </header>

      <div className="relative z-10 flex flex-wrap gap-2 px-6 pt-6 md:px-10">
        {FILTROS.map((f) => {
          const activo = filtro === f.valor;
          return (
            <button
              key={f.valor}
              onClick={() => setFiltro(f.valor)}
              className={`font-mono-hud inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                activo
                  ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                  : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
              }`}
            >
              {f.etiqueta}
            </button>
          );
        })}
      </div>

      <div className="relative z-10 px-6 pt-8 pb-24 md:px-10">
        {error && <p className="mb-4 text-[12px] text-red-400">{error}</p>}

        {cargando ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonGlass key={i} filas={3} anchos={["w-2/3", "w-full", "w-1/2"]} />
            ))}
          </div>
        ) : diagnosticos.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="px-6 text-center text-[12px] uppercase tracking-[0.2em] text-cdm-muted">
              Sin diagnósticos acá. Relevá el laburo con el checklist de visita y bajalo por la barra de comando.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {diagnosticos.map((d, i) => (
              <motion.li
                key={d.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(i * 0.04, 0.3), ease: "easeOut" }}
              >
                <button
                  onClick={() => router.push(`/diagnosticos/${d.id}`)}
                  className="group h-full w-full border border-cdm-line bg-cdm-panel/60 p-5 text-left transition-colors hover:border-cdm-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[15px] font-semibold leading-tight text-cdm-fg">
                      {d.titulo}
                    </h2>
                    <span
                      className={`font-mono-hud shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ring-1 ${ESTADO_COLOR[d.estado]}`}
                    >
                      {ESTADO_LABEL[d.estado]}
                    </span>
                  </div>
                  {(d.direccion || d.cliente) && (
                    <p className="mt-2 text-[12px] text-cdm-muted">
                      {[d.cliente, d.direccion].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="font-mono-hud mt-4 text-[10px] uppercase tracking-[0.14em] text-cdm-muted">
                    {fecha(d.creado_at)}
                    {d.cotizacion_id ? " · con cotización" : ""}
                  </p>
                </button>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
