"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";
import {
  FOTO_ACTUAL,
  rubrosOrdenados,
  totalPersonalPuro,
  totalRubro,
  totalSoftwareEmpresa,
  type ConsumoFoto,
  type RubroFoto,
} from "@/lib/finanzas-foto-tarjeta";

/**
 * BLOQUE — Foto mensual de la tarjeta, rubro por rubro.
 *
 * En qué se va cada peso del último resumen cerrado. Cada rubro se abre y
 * muestra consumo por consumo. El Software / IA va aparte (inversión del
 * negocio), fuera del total personal puro.
 */

const CARD = "rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 p-5";

/** Color de la etiqueta según su intención. */
function tagClass(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "cancelar" || t === "auditar" || t.includes("tna")) return "bg-red-400/10 text-red-300";
  if (t === "negocio") return "bg-sky-400/10 text-sky-300";
  if (t === "reintegrado") return "bg-emerald-400/10 text-emerald-300";
  if (t.includes("?") || t === "hormiga") return "bg-amber-300/10 text-amber-300";
  return "bg-cdm-fg/5 text-cdm-muted";
}

function ConsumoRow({ c }: { c: ConsumoFoto }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5 text-[12px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-geist ${c.pendiente ? "text-amber-300" : "text-cdm-fg"}`}>{c.nombre}</span>
          {c.tag && (
            <span className={`font-mono-hud rounded-full px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.08em] ${tagClass(c.tag)}`}>
              {c.tag}
            </span>
          )}
        </div>
        {c.detalle && <div className="font-mono-hud mt-0.5 text-[10px] text-cdm-muted/80">{c.detalle}</div>}
      </div>
      <div className="shrink-0 text-right">
        <span className={`font-geist tabular-nums ${c.monto === 0 ? "text-cdm-muted/60 line-through" : "text-cdm-fg"}`}>
          {c.monto === 0 ? "$0" : formatMoneyInt(c.monto)}
        </span>
        {c.fecha && <div className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted/60">{c.fecha}</div>}
      </div>
    </li>
  );
}

function RubroRow({
  rubro,
  total,
  pct,
  maxPct,
  abierto,
  onToggle,
  empresa,
}: {
  rubro: RubroFoto;
  total: number;
  pct: number;
  maxPct: number;
  abierto: boolean;
  onToggle: () => void;
  empresa?: boolean;
}) {
  const width = maxPct > 0 ? (pct / maxPct) * 100 : 0;
  return (
    <div className="border-b border-cdm-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full flex-col gap-1.5 py-3 text-left"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-2">
            <span className={`font-mono-hud text-[10px] tabular-nums ${empresa ? "text-cdm-muted/50" : "text-cdm-muted/60"}`}>
              {rubro.id}
            </span>
            <span className={`font-geist text-[13px] ${empresa ? "text-cdm-muted" : "text-cdm-fg"} group-hover:text-cdm-accent`}>
              {rubro.nombre}
            </span>
            <motion.span
              animate={{ rotate: abierto ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="font-mono-hud text-[10px] text-cdm-muted/50"
            >
              ›
            </motion.span>
          </span>
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className={`font-geist tabular-nums text-[13px] font-medium ${empresa ? "text-cdm-muted" : "text-cdm-fg"}`}>
              {formatMoneyInt(total)}
            </span>
            {!empresa && <span className="font-mono-hud text-[10px] text-cdm-muted/60">{Math.round(pct * 100)}%</span>}
          </span>
        </div>
        <div className="h-1 w-full bg-cdm-fg/10">
          <div
            className={`h-1 ${empresa ? "bg-cdm-muted/40" : "bg-cdm-accent/70"}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <ul className="divide-y divide-cdm-line/50 pb-3">
              {rubro.items.map((c, i) => (
                <ConsumoRow key={`${rubro.id}-${i}`} c={c} />
              ))}
            </ul>
            {rubro.nota && (
              <p className="font-mono-hud border-t border-cdm-line/50 py-3 text-[10px] leading-relaxed text-cdm-muted/80">
                {rubro.nota}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FotoTarjetaBlock() {
  const foto = FOTO_ACTUAL;
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ordenados = rubrosOrdenados(foto);
  const personalPuro = totalPersonalPuro(foto);
  const software = totalSoftwareEmpresa(foto);
  const maxPct = ordenados.length > 0 ? ordenados[0].pct : 1;
  const softwarePct = personalPuro > 0 ? software / personalPuro : 0;

  return (
    <div className={`${CARD} mt-3`}>
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
          Foto de la tarjeta
        </h2>
        <span className="font-mono-hud text-[10px] uppercase tracking-[0.1em] text-cdm-muted/70">
          {foto.cierre}
        </span>
      </div>

      {/* Total personal puro */}
      <div className="mt-3">
        <span className="font-mono-hud text-[10px] uppercase tracking-widest text-cdm-muted">
          Tu gasto personal puro
        </span>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-geist tabular-nums text-[clamp(30px,6vw,42px)] leading-none font-semibold text-cdm-fg">
            {formatMoneyInt(personalPuro)}
          </span>
        </div>
        <p className="font-mono-hud mt-2 text-[10px] leading-relaxed text-cdm-muted/80">
          Ciclo {foto.cicloLabel} · {foto.tarjetas}. Sin el software de la empresa (abajo).
          El mes está inflado por el roaming del viaje (Personal $187k → normal ≈ $50k); descontándolo, el piso real es más bajo.
        </p>
      </div>

      {/* Rubros personales — desplegables */}
      <div className="mt-4 border-t border-cdm-line">
        {ordenados.map(({ rubro, total, pct }) => (
          <RubroRow
            key={rubro.id}
            rubro={rubro}
            total={total}
            pct={pct}
            maxPct={maxPct}
            abierto={abiertos.has(rubro.id)}
            onToggle={() => toggle(rubro.id)}
          />
        ))}
      </div>

      {/* Software / IA — empresa, aparte */}
      <div className="mt-5 rounded-[16px] border border-dashed border-cdm-line p-3">
        <p className="font-mono-hud mb-1 text-[9.5px] uppercase tracking-[0.12em] text-cdm-muted/70">
          Aparte · inversión del negocio (no es tu gasto personal)
        </p>
        <RubroRow
          rubro={foto.software}
          total={software}
          pct={softwarePct}
          maxPct={maxPct}
          abierto={abiertos.has(foto.software.id)}
          onToggle={() => toggle(foto.software.id)}
          empresa
        />
      </div>
    </div>
  );
}
