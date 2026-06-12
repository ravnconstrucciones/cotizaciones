"use client";

import type { CerebroData } from "@/types/centro-mando";
import { Panel } from "./panel";

function ListaMini({
  titulo,
  items,
  color,
}: {
  titulo: string;
  items: string[];
  color: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">{titulo}</p>
      <ul className="mt-1 space-y-1">
        {items.map((it) => (
          <li key={it} className="flex gap-2 text-[11px] leading-snug text-cdm-fg/80">
            <span className={`mt-1.5 h-1 w-1 shrink-0 ${color}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Módulo 8: siguiente paso de la última Orientación + Patrones + FODA (spec §4.8). */
export function ModuloCerebro({
  cerebro,
  className,
}: {
  cerebro: CerebroData;
  className?: string;
}) {
  return (
    <Panel titulo="El cerebro" className={className}>
      {cerebro.error && <p className="mb-3 text-[11px] text-amber-300">{cerebro.error}</p>}
      {cerebro.orientacion && (
        <div className="mb-4">
          <p className="text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
            Última orientación
          </p>
          <p className="mt-0.5 text-xs font-medium text-cdm-taupe">
            {cerebro.orientacion.titulo}
          </p>
          {cerebro.orientacion.siguientePaso && (
            <p className="mt-2 whitespace-pre-line text-[11px] leading-relaxed text-cdm-fg/85">
              {cerebro.orientacion.siguientePaso}
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 border-t border-cdm-line pt-3">
        <ListaMini
          titulo="Me potencia"
          items={cerebro.patrones.potencian.slice(0, 2)}
          color="bg-cdm-taupe"
        />
        <ListaMini
          titulo="Me frena"
          items={cerebro.patrones.frenan.slice(0, 2)}
          color="bg-red-400"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 border-t border-cdm-line pt-3">
        <ListaMini titulo="Fortalezas" items={cerebro.foda.fortalezas.slice(0, 1)} color="bg-emerald-400" />
        <ListaMini titulo="Oportunidades" items={cerebro.foda.oportunidades.slice(0, 1)} color="bg-emerald-400" />
        <ListaMini titulo="Debilidades" items={cerebro.foda.debilidades.slice(0, 1)} color="bg-amber-300" />
        <ListaMini titulo="Amenazas" items={cerebro.foda.amenazas.slice(0, 1)} color="bg-red-400" />
      </div>
    </Panel>
  );
}
