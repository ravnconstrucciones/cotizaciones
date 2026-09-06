"use client";

import { useEffect, useState } from "react";
import { agruparAlcancePropuesta } from "@/lib/alcance-propuesta";
import type { Desglose } from "@/lib/cotizador/tipos";
import { motion, useReducedMotion } from "framer-motion";
import type { CotizacionRow } from "@/lib/cotizador/tipos";
import { formatMoneyInt } from "@/lib/format-currency";

/**
 * Pestaña PROPUESTA de la mesa: el borrador vivo que redacta Fable
 * (revision.documento_borrador). No es el documento emitido — es la
 * previsualización que se va escribiendo mientras charlan.
 */
export function PropuestaViva({
  cotizacion,
  version,
}: {
  cotizacion: CotizacionRow;
  version: number;
}) {
  const reduced = useReducedMotion();
  const etapas = agruparAlcancePropuesta((cotizacion.desglose as Desglose | null)?.items ?? []);
  const b = cotizacion.revision?.documento_borrador;
  const min = cotizacion.total_min;
  const max = cotizacion.total_max;

  // Fotos marcadas "en propuesta" (mismo endpoint que FotosPanel).
  const [fotos, setFotos] = useState<Array<{ id: string; url: string | null }>>([]);
  useEffect(() => {
    let vivo = true;
    void fetch(`/api/cotizaciones/${cotizacion.id}/archivos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        // Por tipo, no por `url`: un PDF marcado "en propuesta" también tiene
        // `url` y rompía el documento como imagen rota (fix ronda 1, finding 2).
        setFotos(
          (j?.archivos ?? []).filter(
            (a: { tipo?: string; en_propuesta?: boolean; url?: string | null }) =>
              a.tipo === "foto" && a.en_propuesta && a.url
          )
        );
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [cotizacion.id, version]);

  if (!b && min == null) {
    return (
      <p className="p-6 text-[11px] leading-relaxed text-cdm-muted">
        Todavía no hay propuesta. A medida que charles con Fable, el documento
        se va redactando solo acá.
      </p>
    );
  }

  return (
    <motion.article
      key={JSON.stringify(b) + String(min)}
      initial={reduced ? false : { opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto my-4 w-full max-w-[520px] bg-[#1c1c1a] px-5 py-8 text-[#f2efe8] sm:px-8 sm:py-10 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]"
      style={{ fontFamily: "var(--font-raleway, Raleway), sans-serif" }}
    >
      <p className="text-right text-sm font-light tracking-[0.28em]">R A V N .</p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-[#f2efe8]/60">
        Propuesta{b?.cliente ? ` · ${b.cliente}` : ""}{b?.lugar ? ` · ${b.lugar}` : ""}
      </p>
      <p className="mt-8 text-4xl font-light">Propuesta</p>
      <p className="mt-2 text-xs text-[#f2efe8]/60">Borrador · pendiente de aprobación</p>
      <h3 className="mt-6 border-b border-white/20 pb-3 text-lg font-light">{cotizacion.titulo}</h3>
      {etapas.map((etapa) => <section key={etapa.nombre} className="mt-5">
        <h4 className="text-sm font-semibold">{etapa.nombre}</h4>
        <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-[#f2efe8]/80">{etapa.items.map((item,i)=><li key={i}>{item.nombre}{item.tipo !== "mano_de_obra" ? ` (${item.cantidad} ${item.unidad})` : ""}</li>)}</ul>
      </section>)}
      <div className="mt-4 space-y-3 text-[13px] leading-relaxed">
        {(b?.notas ?? []).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {min != null && max != null && (
        <p className="mt-8 text-4xl font-light tabular-nums">
          {min === max
            ? formatMoneyInt(min)
            : `${formatMoneyInt(min)} – ${formatMoneyInt(max)}`}
        </p>
      )}
      {(b?.forma_pago?.length ?? 0) > 0 && (
        <div className="mt-6 text-[11px] leading-relaxed text-[#f2efe8]/75">
          <h4 className="mb-2 border-b border-white/20 pb-2 text-base font-light">Forma de pago</h4>
          {b!.forma_pago.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </div>
      )}
      {!!b?.plazo?.length && <section className="mt-6 text-sm leading-relaxed"><h4 className="mb-2 border-b border-white/20 pb-2 text-base font-light">Plazo</h4>{b.plazo.map((p,i)=><p key={i}>{p}</p>)}</section>}
      {fotos.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={f.url!} alt="Registro incluido en la propuesta" className="aspect-[4/3] w-full object-contain" />
          ))}
        </div>
      )}
    </motion.article>
  );
}
