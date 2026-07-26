"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
        setFotos(
          (j?.archivos ?? []).filter(
            (a: { en_propuesta?: boolean; url?: string | null }) => a.en_propuesta && a.url
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
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto my-4 w-full max-w-[520px] bg-[#f2efe8] px-8 py-10 text-[#1a1a18] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]"
      style={{ fontFamily: "Raleway, sans-serif" }}
    >
      <p className="text-sm font-extrabold tracking-[0.4em]">R A V N</p>
      <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-[#8a857a]">
        Propuesta{b?.cliente ? ` · ${b.cliente}` : ""}{b?.lugar ? ` · ${b.lugar}` : ""}
      </p>
      <h3 className="mt-6 text-lg font-bold">{cotizacion.titulo}</h3>
      <div className="mt-4 space-y-3 text-[13px] leading-relaxed">
        {(b?.notas ?? []).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {min != null && max != null && (
        <p className="mt-8 text-3xl font-extrabold tabular-nums">
          {min === max
            ? formatMoneyInt(min)
            : `${formatMoneyInt(min)} – ${formatMoneyInt(max)}`}
        </p>
      )}
      {(b?.forma_pago?.length ?? 0) > 0 && (
        <div className="mt-6 text-[11px] leading-relaxed text-[#4a463e]">
          {b!.forma_pago.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
        </div>
      )}
      {fotos.length > 0 && (
        <div className="mt-6 grid grid-cols-3 gap-2">
          {fotos.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={f.url!} alt="" className="aspect-[4/3] w-full object-cover" />
          ))}
        </div>
      )}
    </motion.article>
  );
}
