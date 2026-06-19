"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import type { CotizacionArchivo, EstadoCotizacion } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";

/**
 * GALERÍA DE COTIZACIONES (cara de tarjeta, espejo de /obras). Cada tarjeta
 * tiene foto de portada cargable, título + zona, badge de estado, rango de
 * precio y tres accesos: CÁLCULO (mesa de revisión), DIAGNÓSTICO y PROPUESTA
 * (los archivos adjuntos por tipo; menú A/B si hay varios del mismo tipo).
 * Estética calcada de ProyectoFotoCard.
 */

type TipoDoc = "diagnostico" | "propuesta";

const TIPO_LABEL: Record<TipoDoc, string> = {
  diagnostico: "Diagnóstico",
  propuesta: "Propuesta",
};

export type CotizacionFoto = {
  id: string;
  titulo: string;
  zona: string | null;
  estado: EstadoCotizacion;
  totalMin: number | null;
  totalMax: number | null;
  fotoUrl: string | null;
  archivosCount: number;
};

export const ESTADO_LABEL: Record<EstadoCotizacion, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  documento_emitido: "Emitida",
};

// Tono del badge sobre la foto (fondo + texto, ya con velo oscuro debajo).
const ESTADO_BADGE: Record<EstadoCotizacion, string> = {
  borrador: "bg-zinc-500/85 text-white",
  en_revision: "bg-amber-500/90 text-white",
  aprobada: "bg-emerald-500/90 text-white",
  rechazada: "bg-red-500/90 text-white",
  documento_emitido: "bg-cdm-accent/90 text-cdm-bg",
};

function rangoTotal(c: CotizacionFoto): string {
  if (c.totalMin == null && c.totalMax == null) return "—";
  if (c.totalMin != null && c.totalMax != null && c.totalMin !== c.totalMax) {
    return `${formatMoneyInt(c.totalMin)} – ${formatMoneyInt(c.totalMax)}`;
  }
  return formatMoneyInt(c.totalMax ?? c.totalMin ?? 0);
}

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

function CotizacionFotoCard({
  c,
  onFoto,
  onBorrar,
  borrando,
}: {
  c: CotizacionFoto;
  onFoto: (id: string, url: string) => void;
  onBorrar: (c: CotizacionFoto) => void;
  borrando: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Menú A/B abierto: de qué tipo, o null si no hay menú.
  const [menuTipo, setMenuTipo] = useState<TipoDoc | null>(null);
  // Lista completa de archivos (todos los tipos), null hasta el primer fetch.
  const [archivos, setArchivos] = useState<CotizacionArchivo[] | null>(null);
  // Tipo cuyo doc se está cargando (para el spinner del botón correcto).
  const [cargandoTipo, setCargandoTipo] = useState<TipoDoc | null>(null);
  // A qué tipo adjunta el input cuando lo dispara un botón sin archivos.
  const tipoDestinoRef = useRef<TipoDoc>("propuesta");
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/cotizaciones/${c.id}/portada`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setError(j.error ?? "No se pudo subir.");
        return;
      }
      onFoto(c.id, j.url);
    } catch {
      setError("Error de red.");
    } finally {
      setSubiendo(false);
    }
  }

  // Carga la lista completa (todos los tipos) una sola vez y la cachea.
  async function cargarArchivos(): Promise<CotizacionArchivo[] | null> {
    if (archivos) return archivos;
    const res = await fetch(`/api/cotizaciones/${c.id}/archivos`, { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      archivos?: CotizacionArchivo[];
      error?: string;
    };
    if (!res.ok) {
      setError(j.error ?? "No se pudieron leer los documentos.");
      return null;
    }
    const list = j.archivos ?? [];
    setArchivos(list);
    return list;
  }

  // Abre el doc del tipo pedido. 0 → adjuntar; 1 → abre directo; varios → menú.
  async function abrirDoc(tipo: TipoDoc) {
    setError(null);
    setMenuTipo(null);
    setCargandoTipo(tipo);
    try {
      const list = await cargarArchivos();
      if (list === null) return;
      const propios = list.filter((a) => a.tipo === tipo);
      if (propios.length === 0) {
        adjuntar(tipo); // todavía no hay de este tipo → a adjuntar
      } else if (propios.length === 1 && propios[0].url) {
        window.open(propios[0].url, "_blank", "noopener");
      } else if (propios.length > 1) {
        setMenuTipo(tipo);
      } else {
        setError(`${TIPO_LABEL[tipo]}: el documento no se pudo firmar.`);
      }
    } catch {
      setError("Error de red.");
    } finally {
      setCargandoTipo(null);
    }
  }

  // Dispara el selector de archivo apuntando el upload al tipo dado.
  function adjuntar(tipo: TipoDoc) {
    tipoDestinoRef.current = tipo;
    inputRef.current?.click();
  }

  async function adjuntarDoc(file: File, tipo: TipoDoc) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", tipo);
      const res = await fetch(`/api/cotizaciones/${c.id}/archivos`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => ({}))) as {
        archivo?: CotizacionArchivo;
        error?: string;
      };
      if (!res.ok || !j.archivo) {
        setError(j.error ?? "No se pudo adjuntar.");
        return;
      }
      setArchivos((prev) => [j.archivo as CotizacionArchivo, ...(prev ?? [])]);
      if (j.archivo.url) window.open(j.archivo.url, "_blank", "noopener");
    } catch {
      setError("Error de red.");
    } finally {
      setSubiendo(false);
    }
  }

  // Archivos ya cargados de un tipo (vacío si todavía no se hizo el fetch).
  function docs(tipo: TipoDoc): CotizacionArchivo[] {
    return (archivos ?? []).filter((a) => a.tipo === tipo);
  }

  // Botón de documento (DIAGNÓSTICO / PROPUESTA). Antes del primer fetch usa
  // el conteo global como hint de "hay algo"; después manda el conteo por tipo.
  function DocBoton({ tipo }: { tipo: TipoDoc }) {
    const cargando = cargandoTipo === tipo;
    const tieneHint = archivos ? docs(tipo).length > 0 : c.archivosCount > 0;
    return (
      <button
        type="button"
        onClick={() => void abrirDoc(tipo)}
        disabled={cargandoTipo !== null || subiendo}
        className={`font-mono-hud inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors disabled:opacity-50 ${
          tieneHint
            ? "text-cdm-fg ring-cdm-line hover:ring-cdm-accent/40 hover:text-cdm-accent"
            : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
        }`}
      >
        {cargando ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-cdm-accent/30 border-t-cdm-accent" />
        ) : (
          TIPO_LABEL[tipo]
        )}
      </button>
    );
  }

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 18 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-[28px] ring-1 ring-zinc-950/[0.07] dark:ring-white/[0.08] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-20px_rgba(16,24,40,0.18)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_22px_50px_-22px_rgba(0,0,0,0.65)]"
    >
      <div className="relative aspect-[16/11] w-full overflow-hidden">
        {c.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.fotoUrl}
            alt={c.titulo}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800/60 dark:to-zinc-900">
            <span className="font-geist text-6xl font-semibold text-zinc-300 dark:text-zinc-700">
              {c.titulo.trim().charAt(0).toUpperCase() || "·"}
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
          className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur ${ESTADO_BADGE[c.estado]}`}
        >
          {ESTADO_LABEL[c.estado]}
        </span>

        {/* Cambiar/subir portada arriba a la izquierda */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          aria-label={c.fotoUrl ? "Cambiar foto de portada" : "Subir foto de portada"}
          title={c.fotoUrl ? "Cambiar foto" : "Subir foto"}
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60 disabled:opacity-40"
        >
          {subiendo ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <CamaraIcon className="h-5 w-5" />
          )}
        </button>

        {/* Borrar — aparece al hover */}
        <button
          type="button"
          onClick={() => onBorrar(c)}
          disabled={borrando}
          aria-label={`Borrar cotización ${c.titulo}`}
          title="Borrar cotización"
          className="absolute bottom-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 opacity-0 backdrop-blur transition-all hover:bg-red-500/70 hover:text-white focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
        >
          {borrando ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <span className="text-lg leading-none">×</span>
          )}
        </button>

        {/* Título + zona sobre la foto */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 pr-14">
          <h3 className="font-geist text-xl font-semibold leading-tight tracking-tight text-white line-clamp-2">
            {c.titulo}
          </h3>
          {c.zona && (
            <p className="font-geist mt-1 text-[13px] text-white/70 line-clamp-1">{c.zona}</p>
          )}
        </div>
      </div>

      {/* Pie: rango de precio + accesos CÁLCULO / PROPUESTA */}
      <div className="flex flex-col gap-3 bg-white px-5 py-4 dark:bg-zinc-900/70">
        <div>
          <p className="font-mono-hud text-[10px] uppercase tracking-[0.16em] text-cdm-muted">
            Total estimado
          </p>
          <p className="font-geist text-[15px] font-semibold tabular-nums text-cdm-fg">
            {rangoTotal(c)}
          </p>
        </div>

        <div className="relative flex gap-2">
          <Link
            href={`/cotizaciones/${c.id}/revision`}
            className="font-mono-hud inline-flex flex-1 items-center justify-center rounded-full bg-cdm-accent/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cdm-accent ring-1 ring-cdm-accent/40 transition-colors hover:bg-cdm-accent/20"
          >
            Cálculo
          </Link>

          <DocBoton tipo="diagnostico" />
          <DocBoton tipo="propuesta" />

          {/* Menú A/B cuando hay varios documentos del mismo tipo */}
          {menuTipo && docs(menuTipo).length > 1 && (
            <div className="absolute bottom-full right-0 z-20 mb-2 w-48 overflow-hidden rounded-2xl bg-white p-1 shadow-xl ring-1 ring-cdm-line dark:bg-zinc-900">
              {docs(menuTipo).map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setMenuTipo(null);
                    if (a.url) window.open(a.url, "_blank", "noopener");
                  }}
                  disabled={!a.url}
                  className="block w-full truncate rounded-xl px-3 py-2 text-left font-geist text-[12px] text-cdm-fg transition-colors hover:bg-cdm-accent/10 disabled:opacity-40"
                >
                  {a.titulo?.trim() || `Opción ${String.fromCharCode(65 + i)}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const t = menuTipo;
                  setMenuTipo(null);
                  if (t) adjuntar(t);
                }}
                className="block w-full rounded-xl px-3 py-2 text-left font-mono-hud text-[10px] uppercase tracking-[0.12em] text-cdm-muted transition-colors hover:bg-cdm-accent/10 hover:text-cdm-accent"
              >
                + Adjuntar otra
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="bg-white px-5 pb-2 text-[11px] text-red-500 dark:bg-zinc-900/70">{error}</p>
      )}

      {/* Input compartido: portada (imagen) y adjuntar documento (PDF/doc).
          La cámara sube portada; los botones DIAGNÓSTICO/PROPUESTA sin archivo
          adjuntan al tipo que dejaron en tipoDestinoRef. Para no duplicar
          inputs, uso uno solo y resuelvo por tipo de archivo + ref. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          // Imagen → portada; cualquier otra cosa (PDF) → doc del tipo destino.
          if (f.type.startsWith("image/")) {
            void subir(f);
          } else {
            void adjuntarDoc(f, tipoDestinoRef.current);
          }
        }}
      />
    </motion.article>
  );
}

export function GaleriaCotizaciones({
  cotizaciones,
  onFoto,
  onBorrar,
  borrandoId,
}: {
  cotizaciones: CotizacionFoto[];
  onFoto: (id: string, url: string) => void;
  onBorrar: (c: CotizacionFoto) => void;
  borrandoId: string | null;
}) {
  return (
    <motion.div
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {cotizaciones.map((c) => (
        <CotizacionFotoCard
          key={c.id}
          c={c}
          onFoto={onFoto}
          onBorrar={onBorrar}
          borrando={borrandoId === c.id}
        />
      ))}
    </motion.div>
  );
}
