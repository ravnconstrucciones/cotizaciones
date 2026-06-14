"use client";

import { motion } from "framer-motion";
import { AREAS_ORDEN, type AreaNota, type TuDiaData } from "@/lib/tu-dia";

/* dd/mm/aaaa a partir de un ISO YYYY-MM-DD. */
function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Emoji de fallback por archivo (si el .md no trae H1 con emoji). */
const EMOJI_FALLBACK = new Map<string, string>(
  AREAS_ORDEN.map((a) => [a.archivo, a.emojiFallback])
);

function CardArea({
  area,
  hoy1,
  i,
}: {
  area: AreaNota;
  /** 1% del día (dia.json) para esta área — null si dia.json no lo trae. */
  hoy1: string | null;
  i: number;
}) {
  const emoji = area.emoji ?? EMOJI_FALLBACK.get(area.archivo) ?? "•";
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 * i, ease: "easeOut" }}
      className="flex flex-col rounded-[24px] bg-white/60 p-5 ring-1 ring-cdm-line dark:bg-zinc-900/40"
    >
      <header className="flex items-baseline gap-2.5">
        <span aria-hidden className="text-lg leading-none">
          {emoji}
        </span>
        <div>
          <p className="font-mono-hud text-[9px] uppercase tracking-[0.18em] text-cdm-muted">
            Área
          </p>
          <h3 className="font-geist text-[14px] font-medium tracking-tight text-cdm-fg">
            {area.titulo}
          </h3>
        </div>
      </header>

      {area.estado && (
        <div className="mt-4">
          <p className="font-mono-hud text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
            Estado
          </p>
          <p className="mt-1 font-geist text-[12px] leading-relaxed text-cdm-fg/80">
            {area.estado}
          </p>
        </div>
      )}

      {/* PRÓXIMO 1% — el corazón de la card, destacado en cian. */}
      <div className="mt-4 border-l-2 border-cdm-accent/70 pl-3">
        <p className="font-mono-hud text-[9px] uppercase tracking-[0.2em] text-cdm-accent/80">
          Próximo 1%
        </p>
        <p className="mt-1 font-geist text-[13px] font-medium leading-snug text-cdm-fg">
          {area.proximo1 ?? (
            <span className="text-cdm-muted/70">sin definir</span>
          )}
        </p>
      </div>

      {/* 1% del día (dia.json) — si lo hay, "hoy:" debajo del próximo 1%. */}
      {hoy1 && (
        <div className="mt-3 flex gap-2">
          <span className="font-mono-hud mt-0.5 shrink-0 text-[9px] uppercase tracking-[0.18em] text-cdm-accent">
            hoy:
          </span>
          <p className="font-geist text-[11px] leading-relaxed text-cdm-fg/70">{hoy1}</p>
        </div>
      )}

      {/* Brújula — nota al pie, al fondo de la card. */}
      {area.brujula && (
        <p className="mt-auto pt-4 font-geist text-[11px] italic leading-relaxed text-cdm-muted">
          <span aria-hidden className="mr-1 text-cdm-accent/50">
            ↳
          </span>
          {area.brujula}
        </p>
      )}
    </motion.article>
  );
}

export function DiaScreen({ data, hoy }: { data: TuDiaData; hoy: string }) {
  const { dia, areas, error } = data;
  const maestro = dia.maestro;
  const fresco = dia.fecha === hoy;

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Header — lenguaje Geist idéntico a /obras */}
        <header className="relative flex items-baseline justify-between pb-0">
          <div>
            <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
              Tu Día
            </h1>
            <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
              {dia.fecha ? fmtFecha(dia.fecha) : "Áreas de vida y negocio"}
            </p>
          </div>
        </header>

        {error && (
          <p className="mt-6 rounded-[16px] border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-[12px] text-amber-300">
            {error}
          </p>
        )}

        {/* 1% MAESTRO DE HOY — card protagonista */}
        {maestro && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-8 overflow-hidden rounded-[28px] bg-white/60 p-6 ring-1 ring-cdm-accent/30 dark:bg-zinc-900/40 sm:p-8"
            style={{
              boxShadow: "0 0 40px 0 color-mix(in srgb, var(--cdm-accent, #22d3ee) 8%, transparent)",
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono-hud text-[10px] uppercase tracking-[0.24em] text-cdm-accent">
                El 1% maestro de hoy
              </p>
              <span className="font-mono-hud text-[10px] uppercase tracking-[0.18em] text-cdm-muted">
                {maestro.area}
              </span>
            </div>
            <p className="mt-4 font-geist text-lg font-medium leading-snug text-cdm-fg sm:text-xl">
              {maestro.accion}
            </p>
            <p className="mt-3 max-w-2xl font-geist text-[13px] leading-relaxed text-cdm-muted">
              {maestro.porque}
            </p>
          </motion.section>
        )}

        {/* Sello de frescura: si dia.json no es de hoy, avisar tenue */}
        {dia.fecha && !fresco && (
          <p className="font-mono-hud mt-3 text-[10px] uppercase tracking-[0.16em] text-cdm-muted/55">
            actualizado {fmtFecha(dia.fecha)} · el 1% del día se regenera en pausa
          </p>
        )}

        {/* Grid de las áreas */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {areas.map((a, i) => (
            <CardArea
              key={a.archivo}
              area={a}
              hoy1={dia.areas[a.archivo] ?? null}
              i={i}
            />
          ))}
        </div>

        {areas.length === 0 && !error && (
          <div className="mt-10 flex h-32 items-center justify-center rounded-[20px] border border-dashed border-cdm-line">
            <span className="font-mono-hud px-4 text-center text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
              Sin lectura del vault aún
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
