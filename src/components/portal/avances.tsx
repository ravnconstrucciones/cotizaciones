"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fechaCorta, type RegistroPortal } from "@/lib/portal/tipos";
import { EASE } from "./portal-ui";

/**
 * Avances de la obra (pedido de Eze, 19/11/2026): sólo fotos y videos, en
 * tarjetas grandes que se deslizan de costado (estilo cards de 21st.dev).
 * Los videos se reproducen solos, mudos, cuando la tarjeta está a la vista.
 * Tocar una tarjeta la abre a pantalla completa, con flechas y deslizar.
 */
export function Avances({ items, nombreRubro }: { items: RegistroPortal[]; nombreRubro: (id: string | null) => string | null }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const pista = useRef<HTMLDivElement>(null);
  const quieto = useReducedMotion();

  const mover = (dir: 1 | -1) => {
    const el = pista.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: quieto ? "auto" : "smooth" });
  };

  return (
    <>
      <div className="relative -mx-5 sm:-mx-8">
        <div
          ref={pista}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:none] sm:scroll-px-8 sm:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((r, i) => (
            <Tarjeta key={r.id} r={r} rubro={nombreRubro(r.rubroId)} indice={i} onAbrir={() => setAbierto(i)} />
          ))}
        </div>
      </div>
      {items.length > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[14px] tabular-nums text-[#f2efe8]/75">
            {items.length} avances · deslizá para ver más
          </span>
          <div className="hidden gap-1.5 sm:flex">
            <Flecha onClick={() => mover(-1)} etiqueta="Anteriores">
              <ChevronLeft size={18} strokeWidth={1.5} aria-hidden />
            </Flecha>
            <Flecha onClick={() => mover(1)} etiqueta="Siguientes">
              <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
            </Flecha>
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {abierto !== null ? (
          <Visor items={items} indice={abierto} setIndice={setAbierto} nombreRubro={nombreRubro} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Flecha({ onClick, etiqueta, children }: { onClick: () => void; etiqueta: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="inline-flex size-11 cursor-pointer items-center justify-center border border-[#f2efe8]/25 text-[#f2efe8]/80 transition-colors hover:border-[#f2efe8]/60 hover:text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8]"
    >
      {children}
    </button>
  );
}

function Tarjeta({ r, rubro, indice, onAbrir }: { r: RegistroPortal; rubro: string | null; indice: number; onAbrir: () => void }) {
  const quieto = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const esVideo = r.mediaTipo === "video";

  // Video mudo en bucle mientras la tarjeta está a la vista.
  useEffect(() => {
    const v = video.current;
    if (!v || quieto) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.6 }
    );
    obs.observe(v);
    return () => obs.disconnect();
  }, [quieto]);

  return (
    <motion.button
      type="button"
      onClick={onAbrir}
      aria-label={`Abrir ${esVideo ? "video" : "foto"}: ${r.titulo}`}
      initial={quieto ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, ease: EASE, delay: Math.min(indice, 4) * 0.08 }}
      className="group relative aspect-[4/5] w-[78%] shrink-0 cursor-pointer snap-start overflow-hidden bg-[#0e0e0d] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2efe8] sm:w-[46%] lg:w-[38%]"
    >
      {r.mediaUrl ? (
        esVideo ? (
          <video
            ref={video}
            src={r.mediaUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.mediaUrl}
            alt=""
            loading={indice < 2 ? "eager" : "lazy"}
            className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        )
      ) : null}

      {/* Velo para que el texto se lea sobre cualquier foto. */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#070707] via-[#070707]/25 to-transparent" />

      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
        <span className="bg-[#070707]/70 px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#f2efe8] backdrop-blur-sm">
          {fechaCorta(r.fecha)}
        </span>
        {esVideo ? (
          <span className="inline-flex size-10 items-center justify-center bg-[#f2efe8] text-[#070707]">
            <Play size={16} strokeWidth={2} fill="currentColor" aria-hidden />
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5">
        {rubro ? <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f2efe8]/75">{rubro}</p> : null}
        <p className="mt-1.5 text-[clamp(19px,4.6vw,24px)] font-semibold leading-[1.12] tracking-[-0.03em] text-[#f2efe8]">{r.titulo}</p>
        <span aria-hidden className="mt-4 block h-px w-10 bg-[#f2efe8]/60 transition-all duration-500 group-hover:w-20" />
      </div>
    </motion.button>
  );
}

/** Pantalla completa: foto o video con sonido, flechas, teclado y deslizar. */
function Visor({
  items,
  indice,
  setIndice,
  nombreRubro,
}: {
  items: RegistroPortal[];
  indice: number;
  setIndice: (i: number | null) => void;
  nombreRubro: (id: string | null) => string | null;
}) {
  const r = items[indice];
  const cerrar = useCallback(() => setIndice(null), [setIndice]);
  const ir = useCallback((d: number) => setIndice((indice + d + items.length) % items.length), [indice, items.length, setIndice]);
  const toque = useRef<number | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", tecla);
    };
  }, [cerrar, ir]);

  const rubro = nombreRubro(r.rubroId);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={r.titulo}
      className="fixed inset-0 z-50 flex flex-col bg-[#070707]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (toque.current === null) return;
        const dx = e.changedTouches[0].clientX - toque.current;
        if (Math.abs(dx) > 50) ir(dx < 0 ? 1 : -1);
        toque.current = null;
      }}
    >
      <div className="flex items-center justify-between px-5 py-4 text-[14px] text-[#f2efe8]/80">
        <span className="tabular-nums">
          {indice + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar"
          className="inline-flex size-11 cursor-pointer items-center justify-center text-[#f2efe8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f2efe8]"
        >
          <X size={22} strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={r.id}
            className="flex size-full items-center justify-center"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {r.mediaTipo === "video" ? (
              <video src={r.mediaUrl ?? undefined} controls autoPlay playsInline className="max-h-full max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.mediaUrl ?? undefined} alt={r.titulo} className="max-h-full max-w-full object-contain" />
            )}
          </motion.div>
        </AnimatePresence>
        {items.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => ir(-1)}
              aria-label="Anterior"
              className="absolute left-2 top-1/2 hidden size-12 -translate-y-1/2 cursor-pointer items-center justify-center bg-[#070707]/60 text-[#f2efe8] sm:inline-flex"
            >
              <ChevronLeft size={22} strokeWidth={1.5} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => ir(1)}
              aria-label="Siguiente"
              className="absolute right-2 top-1/2 hidden size-12 -translate-y-1/2 cursor-pointer items-center justify-center bg-[#070707]/60 text-[#f2efe8] sm:inline-flex"
            >
              <ChevronRight size={22} strokeWidth={1.5} aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      <div className="px-5 pb-8 pt-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#f2efe8]/75">
          {[fechaCorta(r.fecha), rubro].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1.5 text-[20px] font-semibold leading-snug tracking-[-0.025em] text-[#f2efe8]">{r.titulo}</p>
        {r.texto ? <p className="mt-1 max-w-[62ch] text-[15px] leading-relaxed text-[#f2efe8]/80">{r.texto}</p> : null}
      </div>
    </motion.div>
  );
}
