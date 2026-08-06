"use client";

import { useCallback, useEffect, useReducer } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  estadoInicialUltimosGastos,
  reducirUltimosGastos,
  type GastoRapidoReciente,
} from "@/lib/gastos-rapidos";

const EASE = [0.22, 1, 0.36, 1] as const;
const TIPO: Record<GastoRapidoReciente["tipo"], string> = {
  obra: "Obra",
  empresa: "Empresa",
  personal: "Personal",
};

function importe(gasto: GastoRapidoReciente): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: gasto.moneda,
    maximumFractionDigits: gasto.moneda === "ARS" ? 0 : 2,
  }).format(gasto.importe);
}

function fecha(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function UltimosGastos({
  refreshKey,
  onDeshecho,
}: {
  refreshKey: number;
  onDeshecho?: () => void;
}) {
  const reducir = useReducedMotion();
  const [estado, dispatch] = useReducer(
    reducirUltimosGastos,
    estadoInicialUltimosGastos
  );

  const cargar = useCallback(async (signal?: AbortSignal) => {
    dispatch({ tipo: "carga_inicio" });
    try {
      const response = await fetch("/api/gastos/rapido/recientes", {
        cache: "no-store",
        signal,
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        gastos?: GastoRapidoReciente[];
        error?: string;
      } | null;
      if (!response.ok || !body?.ok || !Array.isArray(body.gastos)) {
        throw new Error(body?.error || "No se pudieron cargar los últimos gastos.");
      }
      dispatch({ tipo: "carga_ok", items: body.gastos });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      dispatch({
        tipo: "carga_error",
        mensaje:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar los últimos gastos.",
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void cargar(controller.signal);
    return () => controller.abort();
  }, [cargar, refreshKey]);

  useEffect(() => {
    if (!estado.confirmandoId) return;
    const cerrar = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !estado.deshaciendo) {
        dispatch({ tipo: "confirmar_cerrar" });
      }
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [estado.confirmandoId, estado.deshaciendo]);

  const confirmar = async () => {
    const gasto = estado.items.find((item) => item.id === estado.confirmandoId);
    if (!gasto || estado.deshaciendo) return;
    dispatch({ tipo: "deshacer_inicio" });
    try {
      const response = await fetch(
        `/api/gastos/rapido/${gasto.tipo}/${gasto.id}/deshacer`,
        { method: "POST" }
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        estado?: string;
        error?: string;
      } | null;
      if (response.status === 409 && body?.estado === "ya_deshacido") {
        dispatch({ tipo: "deshacer_ya_hecho", id: gasto.id });
        onDeshecho?.();
        return;
      }
      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || "No se pudo deshacer el gasto.");
      }
      dispatch({ tipo: "deshacer_ok", id: gasto.id });
      onDeshecho?.();
    } catch (error) {
      dispatch({
        tipo: "deshacer_error",
        mensaje:
          error instanceof Error ? error.message : "No se pudo deshacer el gasto.",
      });
    }
  };

  const gastoConfirmado = estado.items.find(
    (item) => item.id === estado.confirmandoId
  );

  return (
    <section className="mt-8 border-t border-cdm-line pt-6" aria-labelledby="ultimos-gastos-titulo">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono-hud text-[9px] uppercase tracking-[0.2em] text-cdm-muted">
            Carga rápida
          </p>
          <h2 id="ultimos-gastos-titulo" className="mt-1 text-lg font-medium text-cdm-fg">
            Últimos gastos cargados
          </h2>
        </div>
        {!estado.cargando && !estado.error && estado.items.length > 0 && (
          <span className="font-mono-hud text-[9px] tabular-nums text-cdm-muted">
            {estado.items.length}/10
          </span>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {estado.anuncio}
      </p>

      {estado.cargando && (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando últimos gastos">
          {[0, 1, 2].map((item) => (
            <motion.div
              key={item}
              className="h-[68px] border border-cdm-line bg-cdm-panel"
              animate={reducir ? undefined : { opacity: [0.45, 0.8, 0.45] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: item * 0.08 }}
            />
          ))}
        </div>
      )}

      {!estado.cargando && estado.error && (
        <div role="alert" className="border border-red-400/35 bg-red-400/5 p-4 text-sm text-red-300">
          <p>{estado.error}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="font-mono-hud mt-2 min-h-[44px] px-1 text-[10px] uppercase tracking-[0.14em] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-cdm-fg"
          >
            [REINTENTAR]
          </button>
        </div>
      )}

      {!estado.cargando && !estado.error && estado.items.length === 0 && (
        <div className="border border-cdm-line p-4 text-sm leading-relaxed text-cdm-muted">
          Los próximos gastos que cargues desde esta pantalla van a aparecer acá.
        </div>
      )}

      {!estado.cargando && !estado.error && estado.items.length > 0 && (
        <div className="divide-y divide-cdm-line border border-cdm-line">
          {estado.items.map((gasto) => {
            const abierto = estado.expandidoId === gasto.id;
            const panelId = `gasto-rapido-${gasto.id}`;
            return (
              <article key={gasto.id}>
                <button
                  type="button"
                  aria-expanded={abierto}
                  aria-controls={panelId}
                  onClick={() => dispatch({ tipo: "alternar", id: gasto.id })}
                  className="flex min-h-[68px] w-full touch-manipulation items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cdm-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cdm-fg"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono-hud text-[9px] uppercase tracking-[0.14em] text-cdm-muted">
                        {TIPO[gasto.tipo]}
                      </span>
                      {gasto.detalle && (
                        <span className="truncate text-[11px] text-cdm-muted">{gasto.detalle}</span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-sm text-cdm-fg">
                      {gasto.concepto}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-cdm-muted">
                      {fecha(gasto.fecha)} · {gasto.cuenta || "Sin cuenta"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums text-cdm-fg">
                      {importe(gasto)}
                    </span>
                    <motion.svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      className="ml-auto mt-1 h-4 w-4 text-cdm-muted"
                      animate={{ rotate: abierto ? 180 : 0 }}
                      transition={{ duration: reducir ? 0 : 0.18 }}
                    >
                      <path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    </motion.svg>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {abierto && (
                    <motion.div
                      id={panelId}
                      initial={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      animate={reducir ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                      exit={reducir ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: reducir ? 0 : 0.2, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-cdm-line bg-cdm-panel px-3 py-3">
                        <p className="text-xs leading-relaxed text-cdm-muted">
                          {TIPO[gasto.tipo]} · {fecha(gasto.fecha)} · {gasto.cuenta || "Sin cuenta"}
                        </p>
                        <button
                          type="button"
                          onClick={() => dispatch({ tipo: "confirmar_abrir", id: gasto.id })}
                          className="font-mono-hud mt-2 inline-flex min-h-[48px] touch-manipulation items-center px-1 text-[10px] uppercase tracking-[0.14em] text-red-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-red-300"
                        >
                          [DESHACER GASTO]
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </article>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {gastoConfirmado && (
          <>
            <motion.button
              type="button"
              aria-label="Cancelar deshacer"
              className="fixed inset-0 z-40 cursor-default bg-black/65"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducir ? 0 : 0.18 }}
              onClick={() =>
                !estado.deshaciendo && dispatch({ tipo: "confirmar_cerrar" })
              }
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirmar-deshacer-titulo"
              aria-describedby="confirmar-deshacer-descripcion"
              className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border border-cdm-line bg-cdm-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
              initial={reducir ? { opacity: 0 } : { y: "100%" }}
              animate={reducir ? { opacity: 1 } : { y: 0 }}
              exit={reducir ? { opacity: 0 } : { y: "100%" }}
              transition={{ duration: reducir ? 0 : 0.24, ease: EASE }}
            >
              <p className="font-mono-hud text-[9px] uppercase tracking-[0.2em] text-red-300">
                Acción destructiva
              </p>
              <h3 id="confirmar-deshacer-titulo" className="mt-2 text-xl font-medium text-cdm-fg">
                ¿Deshacer este gasto?
              </h3>
              <p id="confirmar-deshacer-descripcion" className="mt-3 text-sm leading-relaxed text-cdm-muted">
                También se revertirá la salida de Caja. El gasto quedará en Papelera y podrás restaurarlo.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  autoFocus
                  disabled={estado.deshaciendo}
                  onClick={() => dispatch({ tipo: "confirmar_cerrar" })}
                  className="font-mono-hud min-h-[48px] border border-cdm-line px-3 text-[10px] uppercase tracking-[0.12em] text-cdm-fg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cdm-fg"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={estado.deshaciendo}
                  onClick={() => void confirmar()}
                  className="font-mono-hud min-h-[48px] bg-red-500 px-3 text-[10px] uppercase tracking-[0.12em] text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                >
                  {estado.deshaciendo ? "Deshaciendo…" : "Confirmar deshacer"}
                </button>
              </div>
              {estado.errorDeshacer && (
                <p role="alert" className="mt-3 text-sm text-red-300">
                  {estado.errorDeshacer}
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </section>
  );
}
