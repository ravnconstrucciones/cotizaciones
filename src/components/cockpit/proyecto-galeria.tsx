"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * GALERÍA DE PROYECTOS (rediseño /obras, pedido de Eze: "que quede así como en
 * projects"). Carrusel horizontal de cards con FOTO de portada por obra —
 * imagen con gradiente, nombre encima, estado. La card se pone VERDE cuando la
 * obra está cerrada y muestra la RENTABILIDAD (margen al día = propuesta −
 * gastado). Cada card linkea al orbital /obras/[id] donde vive el detalle
 * (avances, pendientes, gastos). Botón para subir/cambiar la portada a mano.
 *
 * Estética: cards limpias (Geist, rounded), lenguaje del cockpit nuevo. La foto
 * llega como signed URL del bucket privado (resumen) o se sube acá.
 */

export type ProyectoFoto = {
  presupuestoId: string;
  nombre: string;
  cliente: string | null;
  estadoLabel: string;
  finalizada: boolean;
  cobranzaCerrada: boolean;
  margenAlDia: number | null;
  fotoUrl: string | null;
  ultimoAvanceTexto: string | null;
  proximaAccion: string | null;
};

const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function CamaraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1 1 0 0 0 .83-.45l.74-1.1A1 1 0 0 1 9.1 4h5.8a1 1 0 0 1 .83.45l.74 1.1a1 1 0 0 0 .83.45h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ProyectoFotoCard({
  p,
  onFoto,
}: {
  p: ProyectoFoto;
  onFoto: (presupuestoId: string, url: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cerrada = p.finalizada || p.cobranzaCerrada;

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/obras/${p.presupuestoId}/portada`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setError(j.error ?? "No se pudo subir.");
        return;
      }
      onFoto(p.presupuestoId, j.url);
    } catch {
      setError("Error de red.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 18 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-[28px] ring-1 transition-shadow duration-300 ${
        cerrada
          ? "ring-emerald-500/30 dark:ring-emerald-400/25"
          : "ring-zinc-950/[0.07] dark:ring-white/[0.08]"
      } shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-20px_rgba(16,24,40,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_22px_50px_-22px_rgba(0,0,0,0.65)]`}
    >
      <Link href={`/obras/${p.presupuestoId}`} className="relative block aspect-[16/11] w-full overflow-hidden">
        {p.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.fotoUrl}
            alt={p.nombre}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800/60 dark:to-zinc-900">
            <span className="font-geist text-6xl font-semibold text-zinc-300 dark:text-zinc-700">
              {p.nombre.trim().charAt(0).toUpperCase() || "·"}
            </span>
          </div>
        )}

        {/* Velo para legibilidad del texto sobre la foto */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
        />

        {/* Badge de estado arriba a la derecha */}
        <span
          className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur ${
            cerrada
              ? "bg-emerald-500/85 text-white"
              : "bg-cdm-accent/85 text-cdm-bg"
          }`}
        >
          {p.estadoLabel}
        </span>

        {/* Título + cliente sobre la foto */}
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h3 className="font-geist text-xl font-semibold leading-tight tracking-tight text-white line-clamp-2">
            {p.nombre}
          </h3>
          {p.cliente && (
            <p className="font-geist mt-1 text-[13px] text-white/70 line-clamp-1">{p.cliente}</p>
          )}
        </div>
      </Link>

      {/* Pie: rentabilidad (verde, si cerrada) o última acción + subir foto */}
      <div className="flex items-center justify-between gap-3 bg-white px-5 py-3.5 dark:bg-zinc-900/70">
        <div className="min-w-0">
          {cerrada ? (
            (() => {
              // Ganancia → verde; pérdida → rojo (no todo lo cerrado da plata).
              const perdida = p.margenAlDia != null && p.margenAlDia < 0;
              const col = perdida
                ? "text-red-500 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400";
              return (
                <>
                  <p className={`font-mono-hud text-[10px] uppercase tracking-[0.16em] ${col}`}>
                    Rentabilidad
                  </p>
                  <p className={`font-geist text-[15px] font-semibold ${col}`}>
                    {p.margenAlDia != null ? ars.format(p.margenAlDia) : "s/d"}
                  </p>
                </>
              );
            })()
          ) : (
            (() => {
              // Hay avance registrado → verde (se mueve). Sin movimientos → colorado.
              const hayAvance = !!p.ultimoAvanceTexto;
              const col = hayAvance
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400";
              return (
                <>
                  <p className={`font-mono-hud text-[10px] uppercase tracking-[0.16em] ${col}`}>
                    {hayAvance ? "Último avance" : "Próxima acción"}
                  </p>
                  <p className={`font-geist truncate text-[13px] font-medium ${col}`}>
                    {p.ultimoAvanceTexto ?? p.proximaAccion ?? "Sin movimientos"}
                  </p>
                </>
              );
            })()
          )}
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          aria-label={p.fotoUrl ? "Cambiar foto de portada" : "Subir foto de portada"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-cdm-muted transition-colors hover:bg-cdm-accent/10 hover:text-cdm-accent disabled:opacity-40"
          title={p.fotoUrl ? "Cambiar foto" : "Subir foto"}
        >
          {subiendo ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cdm-accent/30 border-t-cdm-accent" />
          ) : (
            <CamaraIcon className="h-5 w-5" />
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p className="bg-white px-5 pb-2 text-[11px] text-red-500 dark:bg-zinc-900/70">{error}</p>
      )}
    </motion.article>
  );
}

export function GaleriaProyectos({
  proyectos,
  onFoto,
}: {
  proyectos: ProyectoFoto[];
  onFoto: (presupuestoId: string, url: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(420, el.clientWidth * 0.85), behavior: "smooth" });
  }

  return (
    <div className="relative">
      {/* Flechas (desktop) */}
      {proyectos.length > 1 && (
        <div className="absolute -top-12 right-6 z-10 hidden gap-2 md:flex md:right-10">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => scroll(d)}
              aria-label={d === -1 ? "Anterior" : "Siguiente"}
              className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-cdm-line text-cdm-muted transition-colors hover:text-cdm-accent hover:ring-cdm-accent/40"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                <path
                  d={d === -1 ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ))}
        </div>
      )}

      <motion.div
        ref={scrollerRef}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.06 } } }}
        initial="hidden"
        animate="visible"
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-6 px-6 pb-4 md:scroll-px-10 md:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {proyectos.map((p) => (
          <div key={p.presupuestoId} className="w-[300px] shrink-0 snap-start sm:w-[340px]">
            <ProyectoFotoCard p={p} onFoto={onFoto} />
          </div>
        ))}
      </motion.div>
    </div>
  );
}
