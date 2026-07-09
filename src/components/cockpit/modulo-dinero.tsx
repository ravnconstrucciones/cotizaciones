"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel } from "./panel";
import { SkeletonCifra } from "./skeleton-glass";
import { fetchCompartido } from "@/lib/fetch-compartido";
import { formatMoneyInt } from "@/lib/format-currency";
import {
  borradoresAgrupados,
  deudasConAntiguedad,
  nombreDueno,
  totalesPorDueno,
  type BolsilloVista,
  type BorradorVista,
  type FinanciamientoVista,
} from "@/lib/dinero-tablero";

/**
 * Card del módulo DINERO en la home (Fase 3): el resumen del ledger que pide
 * el spec — de quién es la plata (bolsillos por dueño), qué deudas hay
 * abiertas entre dueños y qué operación del bot quedó sin confirmar. El
 * detalle vive en /dinero. Hermana de ModuloPlata (que mira las CUENTAS:
 * dónde está la plata; esta mira los BOLSILLOS: de quién es).
 */

type PayloadDinero = {
  bolsillos: BolsilloVista[];
  financiamientos: FinanciamientoVista[];
  borradores: BorradorVista[];
  obras: Record<string, string>;
  /** Cuentas tarjeta: personales, solo control — nunca restan en bolsillos. */
  tarjetas?: string[];
};

const COLOR_DUENO: Record<string, string> = {
  obra: "bg-cdm-accent/70",
  empresa: "bg-emerald-400/80",
};

/** USD como en el resto del cockpit: "US$ 1.234" es-AR (paridad modulo-plata). */
function formatUsdInt(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

export function ModuloDinero({ className }: { className?: string }) {
  const [data, setData] = useState<PayloadDinero | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetchCompartido("/api/dinero");
      if (res.ok) setData(res.body as PayloadDinero);
      else setError("No se pudo cargar el ledger.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Tarjetas afuera (regla 08/07): personales, control nomás — su deuda no
  // le resta a RAVN; se cancela con retiro declarado.
  const totales = useMemo(
    () => (data ? totalesPorDueno(data.bolsillos, new Set(data.tarjetas ?? [])) : null),
    [data]
  );
  const abiertas = useMemo(
    () =>
      data
        ? deudasConAntiguedad(data.financiamientos, Date.now()).filter(
            (d) => d.estado === "abierto"
          )
        : [],
    [data]
  );
  const borradores = useMemo(
    () => (data ? borradoresAgrupados(data.borradores) : []),
    [data]
  );

  return (
    <Panel
      titulo="Bolsillos y deudas"
      className={className}
      accion={
        <Link
          href="/dinero"
          className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
        >
          [DINERO] ↑
        </Link>
      }
    >
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!data && !error && <SkeletonCifra className="mt-2" />}
      {data && data.bolsillos.length === 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-cdm-muted">
            Sin ledger todavía — se enciende con la foto inicial.
          </p>
          {/* Un borrador colgado se muestra SIEMPRE (spec decisión 4),
              incluso antes de la foto: jamás queda escondido. */}
          {borradores.length > 0 && (
            <p className="text-[11px] text-amber-300">
              {borradores.length === 1
                ? "1 operación del bot sin confirmar"
                : `${borradores.length} operaciones del bot sin confirmar`}{" "}
              — detalle en /dinero.
            </p>
          )}
        </div>
      )}
      {data && data.bolsillos.length > 0 && totales && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* De quién es la plata */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              De quién es
            </p>
            <ul className="mt-1.5 space-y-1">
              {(
                [
                  ["obra", "Obras"],
                  ["empresa", "RAVN"],
                ] as const
              ).map(([tipo, titulo]) => (
                <li
                  key={tipo}
                  className="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span className="flex items-center gap-1.5 text-cdm-muted">
                    <span className={`inline-block h-1.5 w-1.5 ${COLOR_DUENO[tipo]}`} />
                    {titulo}
                  </span>
                  <span
                    className={`shrink-0 tabular-nums ${
                      totales[tipo].ars < 0 ? "text-red-400" : "text-cdm-fg"
                    }`}
                  >
                    {formatMoneyInt(totales[tipo].ars)}
                    {totales[tipo].usd !== 0 &&
                      ` + US$ ${formatUsdInt(totales[tipo].usd)}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Deudas abiertas */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Deudas abiertas
            </p>
            {abiertas.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-cdm-muted">ninguna</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {abiertas.slice(0, 3).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-cdm-muted">
                      {nombreDueno(d.deudor_tipo, d.deudor_obra_id, data.obras)} →{" "}
                      {nombreDueno(d.acreedor_tipo, d.acreedor_obra_id, data.obras)}
                    </span>
                    <span className="shrink-0 tabular-nums text-red-400">
                      {d.moneda === "USD"
                        ? `US$ ${formatUsdInt(d.saldoPendiente)}`
                        : formatMoneyInt(d.saldoPendiente)}
                    </span>
                  </li>
                ))}
                {abiertas.length > 3 && (
                  <li className="text-[10px] text-cdm-muted">
                    +{abiertas.length - 3} más en /dinero
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Borradores */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-cdm-muted">
              Sin confirmar
            </p>
            {borradores.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-cdm-muted">
                nada colgado del bot
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {borradores.slice(0, 3).map((g) => (
                  <li
                    key={g.grupo_id}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="min-w-0 truncate text-cdm-muted">
                      {g.descripcion || g.origen_tipo.replace(/_/g, " ")}
                    </span>
                    <span className="shrink-0 tabular-nums text-amber-300">
                      {g.totalArs > 0 && formatMoneyInt(g.totalArs)}
                      {g.totalArs > 0 && g.totalUsd > 0 && " + "}
                      {g.totalUsd > 0 && `US$ ${formatUsdInt(g.totalUsd)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
