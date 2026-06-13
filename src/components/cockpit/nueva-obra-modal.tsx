"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Modal de ALTA DE OBRA (botón "+ NUEVA OBRA"). Estética cockpit (mono,
 * cdm-glass, radius 0, ambos temas). Liviano: nombre de obra + cliente +
 * instancia/estado inicial opcional. Al guardar pega a POST /api/obras, que
 * crea el presupuesto aprobado + su fila en obras → la obra aparece de una como
 * ACTIVA en home y galería. NO reemplaza /nuevo-presupuesto (ese arma el
 * presupuesto formal con ítems).
 */

const fieldCls =
  "w-full border-0 border-b border-cdm-line bg-transparent px-1 py-2 text-sm text-cdm-fg placeholder:text-cdm-muted/50 transition-[border-color,box-shadow] duration-200 focus-visible:border-cdm-accent focus-visible:outline-none focus-visible:shadow-[0_12px_24px_-16px_rgba(34,211,238,0.6)]";

const labelCls =
  "mb-2 block font-mono-hud text-[10px] font-medium uppercase tracking-[0.18em] text-cdm-muted";

export function NuevaObraModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Se llama con el presupuesto_id de la obra nueva tras crearla. */
  onCreated: (presupuestoId: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [instancia, setInstancia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setNombre("");
    setCliente("");
    setInstancia("");
    setError(null);
    setGuardando(false);
  }

  function cerrar() {
    if (guardando) return;
    reset();
    onClose();
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const nombre_obra = nombre.trim();
    if (!nombre_obra || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/obras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_obra,
          nombre_cliente: cliente.trim(),
          instancia_inicial: instancia.trim(),
        }),
      });
      const j = (await res.json()) as {
        error?: string;
        presupuesto_id?: string;
      };
      if (!res.ok || !j.presupuesto_id) {
        setError(j.error ?? "No se pudo crear la obra.");
        setGuardando(false);
        return;
      }
      const pid = j.presupuesto_id;
      reset();
      onCreated(pid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setGuardando(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <motion.div
            className="cdm-glass font-grotesk flex max-h-[92dvh] w-full max-w-md flex-col"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="flex items-baseline justify-between border-b border-cdm-line bg-[linear-gradient(90deg,rgba(34,211,238,0.07),transparent_60%)] px-5 py-4">
              <h2 className="font-mono-hud text-[11px] font-semibold uppercase tracking-[0.2em] text-cdm-accent">
                <span aria-hidden className="mr-2 text-cdm-accent/45">
                  {"//////"}
                </span>
                Nueva obra
              </h2>
              <button
                type="button"
                onClick={cerrar}
                disabled={guardando}
                aria-label="Cerrar"
                className="font-mono-hud cursor-pointer text-[11px] text-cdm-muted transition-colors hover:text-cdm-accent disabled:opacity-40"
              >
                [×]
              </button>
            </div>

            {/* Body */}
            <form onSubmit={guardar} className="flex min-h-0 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <p className="text-[11px] leading-relaxed text-cdm-muted">
                  Da de alta una obra al toque. Queda{" "}
                  <span className="text-emerald-400 light:text-emerald-600">
                    activa
                  </span>{" "}
                  lista para cargarle avances y gastos. El presupuesto formal con
                  ítems se arma aparte.
                </p>

                <div>
                  <label htmlFor="no-nombre" className={labelCls}>
                    Nombre de obra *
                  </label>
                  <input
                    id="no-nombre"
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Reforma baño · Cocina Nordelta…"
                    autoFocus
                    className={fieldCls}
                  />
                </div>

                <div>
                  <label htmlFor="no-cliente" className={labelCls}>
                    Cliente
                  </label>
                  <input
                    id="no-cliente"
                    type="text"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Apellido o nombre del cliente"
                    className={fieldCls}
                  />
                </div>

                <div>
                  <label htmlFor="no-instancia" className={labelCls}>
                    Instancia inicial (opcional)
                  </label>
                  <input
                    id="no-instancia"
                    type="text"
                    value={instancia}
                    onChange={(e) => setInstancia(e.target.value)}
                    placeholder="Demolición · Replanteo · Inicio…"
                    className={fieldCls}
                  />
                </div>

                {error && <p className="text-[11px] text-red-400">{error}</p>}
              </div>

              {/* Footer */}
              <div className="flex flex-col gap-3 border-t border-cdm-line px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={cerrar}
                  disabled={guardando}
                  className="cdm-chip cursor-pointer border border-cdm-line px-6 py-3 text-xs font-semibold uppercase tracking-wider text-cdm-muted transition-colors hover:border-cdm-accent/30 hover:text-cdm-fg disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!nombre.trim() || guardando}
                  className="cdm-chip cursor-pointer border border-cdm-accent/60 bg-cdm-accent/15 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-cdm-accent shadow-[0_0_18px_-6px_rgba(34,211,238,0.55)] transition-colors hover:bg-cdm-accent/25 disabled:opacity-50"
                >
                  {guardando ? "Creando…" : "Crear obra"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
