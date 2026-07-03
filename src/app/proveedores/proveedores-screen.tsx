"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import { formatoTelefono, linkWhatsapp } from "@/lib/proveedores-whatsapp";

/**
 * AGENDA DE PROVEEDORES — vista de campo, pensada para el celular: buscás
 * "volquetes" y tocás el botón verde → se abre la conversación de WhatsApp
 * (wa.me deja elegir con qué WhatsApp salir: RAVN o personal). Los proveedores
 * los agenda el bot desde flyers/mensajes; acá solo se consultan.
 */

type Proveedor = {
  id: string;
  nombre: string;
  rubro: string | null;
  telefonos: string[];
  zona: string | null;
  notas: string | null;
  origen: string | null;
  imagen_url: string | null;
};

/** Búsqueda sin tildes ni mayúsculas (mismo criterio que el matcher del bot). */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12.04 2c-5.5 0-9.98 4.47-9.98 9.97 0 1.76.46 3.47 1.34 4.98L2 22l5.18-1.36a9.96 9.96 0 0 0 4.86 1.24h.01c5.5 0 9.97-4.47 9.97-9.97 0-2.66-1.03-5.17-2.92-7.05A9.9 9.9 0 0 0 12.04 2Zm0 18.2h-.01a8.26 8.26 0 0 1-4.21-1.15l-.3-.18-3.13.82.84-3.05-.2-.31a8.22 8.22 0 0 1-1.27-4.39c0-4.56 3.72-8.27 8.29-8.27 2.21 0 4.29.86 5.85 2.43a8.2 8.2 0 0 1 2.42 5.85c0 4.56-3.71 8.25-8.28 8.25Zm4.54-6.19c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.25-.64.8-.78.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43l-.48-.01c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

function LupaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ProveedorCard({ p, indice }: { p: Proveedor; indice: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut", delay: Math.min(indice * 0.04, 0.3) }}
      className="relative flex flex-col overflow-hidden rounded-[28px] bg-cdm-panel/80 ring-1 ring-zinc-950/[0.07] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-20px_rgba(16,24,40,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_22px_50px_-22px_rgba(0,0,0,0.65)]"
    >
      <div className="flex items-start gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[17px] font-semibold tracking-tight text-cdm-fg">
              {p.nombre}
            </h2>
            {p.rubro && (
              <span className="font-mono-hud inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/40">
                {p.rubro}
              </span>
            )}
          </div>
          {p.zona && (
            <p className="font-mono-hud mt-1.5 text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
              {p.zona}
            </p>
          )}
          {p.notas && (
            <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-cdm-muted">
              {p.notas}
            </p>
          )}
        </div>

        {/* Flyer original (firmado): miniatura tocable, abre completo. */}
        {p.imagen_url && (
          <a
            href={p.imagen_url}
            target="_blank"
            rel="noreferrer"
            className="block h-16 w-16 shrink-0 overflow-hidden rounded-2xl ring-1 ring-cdm-line transition-opacity hover:opacity-80"
            aria-label={`Ver flyer de ${p.nombre}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.imagen_url}
              alt={`Flyer de ${p.nombre}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </a>
        )}
      </div>

      {/* Un botón por teléfono: target de 48px, verde WhatsApp. */}
      <div className="flex flex-col gap-2 px-5 pb-5">
        {p.telefonos.map((tel) => {
          const link = linkWhatsapp(tel);
          if (!link) {
            return (
              <span
                key={tel}
                className="font-mono-hud inline-flex min-h-12 items-center rounded-2xl px-4 text-[13px] tracking-wide text-cdm-muted ring-1 ring-cdm-line"
              >
                {formatoTelefono(tel)}
              </span>
            );
          }
          return (
            <a
              key={tel}
              href={link}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex min-h-12 items-center gap-3 rounded-2xl bg-[#25d366]/10 px-4 ring-1 ring-[#25d366]/35 transition-colors hover:bg-[#25d366]/20 hover:ring-[#25d366]/60 active:bg-[#25d366]/25"
            >
              <WhatsappIcon className="h-5 w-5 shrink-0 text-[#25d366]" />
              <span className="font-mono-hud text-[14px] font-semibold tracking-wide text-cdm-fg">
                {formatoTelefono(tel)}
              </span>
              <span className="font-mono-hud ml-auto text-[10px] uppercase tracking-[0.16em] text-[#25d366]/80">
                Abrir chat
              </span>
            </a>
          );
        })}
        {p.telefonos.length === 0 && (
          <p className="text-[12px] text-cdm-muted">Sin teléfono agendado.</p>
        )}
      </div>
    </motion.article>
  );
}

export function ProveedoresScreen() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/proveedores", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al cargar");
      setProveedores((json.proveedores ?? []) as Proveedor[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return proveedores;
    return proveedores.filter((p) =>
      normalizar(`${p.nombre} ${p.rubro ?? ""} ${p.zona ?? ""} ${p.notas ?? ""}`).includes(q)
    );
  }, [proveedores, busqueda]);

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      {/* Header — mismo lenguaje que cotizaciones-screen */}
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            Proveedores
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            Agenda de obra · WhatsApp directo
          </p>
        </div>
      </header>

      {/* Búsqueda: el caso de uso es "volquetes" desde la obra. */}
      <div className="relative z-10 px-6 pt-6 md:px-10">
        <label className="relative block max-w-md">
          <LupaIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cdm-muted" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por rubro, nombre o zona…"
            aria-label="Buscar proveedor"
            className="h-12 w-full rounded-2xl bg-cdm-panel/80 pl-11 pr-4 text-[15px] text-cdm-fg ring-1 ring-cdm-line outline-none transition-colors placeholder:text-cdm-muted focus:ring-cdm-accent/50"
          />
        </label>
      </div>

      {/* Contenido */}
      <div className="relative z-10 px-6 pt-6 pb-24 md:px-10">
        {error && <p className="mb-4 text-[12px] text-red-400">{error}</p>}

        {cargando ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonGlass key={i} filas={3} anchos={["w-2/3", "w-full", "w-1/2"]} />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="px-6 text-center text-[12px] uppercase tracking-[0.2em] text-cdm-muted">
              {proveedores.length === 0
                ? "Sin proveedores. Se agendan mandándole el flyer o el contacto al bot de WhatsApp."
                : "Nada con esa búsqueda."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.map((p, i) => (
              <ProveedorCard key={p.id} p={p} indice={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
