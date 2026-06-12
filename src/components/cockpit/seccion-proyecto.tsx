"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { formatMoneyInt } from "@/lib/format-currency";

/**
 * Sección de proyecto de la galería /obras (ref. section-with-mockup de
 * 21st.dev). El parallax/stagger de framer-motion se conserva tal cual;
 * lo que cambia es el contenido: en vez de imágenes Unsplash, la "mockup
 * card" flotante es un mini-dashboard VIVO de la obra (saldo, margen,
 * últimos gastos, % ejecutado) con la capa trasera blureada de profundidad.
 * Radius 0 (ADN RAVN): el único objeto redondeado del cockpit sigue siendo
 * el prompt box.
 */

export type MovimientoCard = {
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  fecha: string;
};

export type ProyectoCard = {
  presupuestoId: string;
  nombre: string;
  cliente: string | null;
  estadoLabel: string;
  estadoCls: string;
  desde: string | null;
  saldoCaja: number;
  margenAlDia: number | null;
  /** % del precio de la propuesta ya consumido por egresos (null sin propuesta). */
  pctConsumido: number | null;
  movimientos: MovimientoCard[];
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.2 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" as const },
  },
};

export function SeccionProyecto({
  proyecto,
  reverseLayout = false,
}: {
  proyecto: ProyectoCard;
  reverseLayout?: boolean;
}) {
  const p = proyecto;
  const layoutClasses = reverseLayout
    ? "md:grid-cols-2 md:grid-flow-col-dense"
    : "md:grid-cols-2";
  const textOrderClass = reverseLayout ? "md:col-start-2" : "";
  const imageOrderClass = reverseLayout ? "md:col-start-1" : "";

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="container relative z-10 mx-auto w-full max-w-[1220px] px-6 md:px-10">
        <motion.div
          className={`grid w-full grid-cols-1 items-center gap-16 md:gap-8 ${layoutClasses}`}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          {/* Columna de texto */}
          <motion.div
            className={`mx-auto mt-10 flex max-w-[546px] flex-col items-start gap-4 md:mx-0 md:mt-0 ${textOrderClass}`}
            variants={itemVariants}
          >
            <p className="text-[10px] uppercase tracking-[0.3em] text-cdm-accent">
              Proyecto
            </p>
            <h2 className="font-raleway text-3xl font-black leading-tight text-cdm-fg md:text-[40px] md:leading-[48px]">
              {p.nombre}
            </h2>
            <div className="space-y-1 text-sm leading-6 text-cdm-muted">
              {p.cliente && <p>Cliente: {p.cliente}</p>}
              <p>
                Estado:{" "}
                <span className={`uppercase tracking-[0.12em] ${p.estadoCls}`}>
                  {p.estadoLabel}
                </span>
              </p>
              {p.desde && <p>Inicio: {p.desde}</p>}
            </div>
            <Link
              href={`/obras/${p.presupuestoId}`}
              className="mt-2 border border-cdm-accent/40 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg"
            >
              Ver orbital →
            </Link>
          </motion.div>

          {/* Mockup card: mini-dashboard vivo de la obra */}
          <motion.div
            className={`relative mx-auto mt-10 w-full max-w-[300px] md:mt-0 md:max-w-[440px] ${imageOrderClass}`}
            variants={itemVariants}
          >
            {/* Capa trasera blureada (profundidad) */}
            <motion.div
              aria-hidden
              className="absolute z-0 h-[300px] w-[280px] border border-cdm-line/60 bg-[#0d0d0c] light:bg-[#dde5ee] md:h-[440px] md:w-[420px]"
              style={{
                top: reverseLayout ? "auto" : "10%",
                bottom: reverseLayout ? "10%" : "auto",
                left: reverseLayout ? "auto" : "-14%",
                right: reverseLayout ? "-14%" : "auto",
                filter: "blur(2px)",
              }}
              initial={{ y: 0 }}
              whileInView={{ y: reverseLayout ? -20 : -30 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              viewport={{ once: true, amount: 0.5 }}
            />

            {/* Card principal */}
            <motion.div
              className="cdm-glass relative z-10 w-full"
              initial={{ y: 0 }}
              whileInView={{ y: reverseLayout ? 20 : 30 }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
              viewport={{ once: true, amount: 0.5 }}
            >
              <Link
                href={`/obras/${p.presupuestoId}`}
                className="flex h-full flex-col p-6 md:p-8"
                aria-label={`Abrir orbital de ${p.nombre}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[9px] uppercase tracking-[0.3em] text-cdm-accent">
                    Obra en vivo
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-[0.15em] ${p.estadoCls}`}
                  >
                    {p.estadoLabel}
                  </span>
                </div>

                <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-cdm-muted">
                  Saldo de caja
                </p>
                <p
                  className={`font-raleway text-3xl font-medium tabular-nums md:text-4xl ${
                    p.saldoCaja >= 0 ? "text-cdm-fg" : "text-red-400"
                  }`}
                >
                  {formatMoneyInt(p.saldoCaja)}
                </p>

                <p className="mt-3 text-[11px] text-cdm-muted">
                  Margen al día:{" "}
                  {p.margenAlDia == null ? (
                    "sin propuesta"
                  ) : (
                    <span
                      className={`tabular-nums ${
                        p.margenAlDia >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatMoneyInt(p.margenAlDia)}
                    </span>
                  )}
                </p>

                {p.pctConsumido != null && (
                  <div className="mt-5">
                    <div className="mb-1 flex items-center justify-between text-[10px]">
                      <span className="uppercase tracking-[0.15em] text-cdm-muted">
                        Ejecutado
                      </span>
                      <span className="tabular-nums text-cdm-fg/80">
                        {Math.round(p.pctConsumido)}%
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden bg-cdm-fg/10">
                      <div
                        className="h-full bg-gradient-to-r from-cdm-deep to-cdm-accent"
                        style={{
                          width: `${Math.min(100, Math.max(0, p.pctConsumido))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex-1 border-t border-cdm-line pt-3">
                  <p className="text-[9px] uppercase tracking-[0.25em] text-cdm-muted">
                    Últimos movimientos
                  </p>
                  {p.movimientos.length === 0 && (
                    <p className="mt-2 text-[11px] text-cdm-muted">
                      Sin movimientos todavía.
                    </p>
                  )}
                  <ul className="mt-1 divide-y divide-cdm-line/60">
                    {p.movimientos.map((m, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-2 py-2"
                      >
                        <span className="truncate text-[11px] text-cdm-fg/80">
                          {m.descripcion || "Movimiento"}
                        </span>
                        <span
                          className={`shrink-0 text-[11px] tabular-nums ${
                            m.tipo === "ingreso"
                              ? "text-emerald-400"
                              : "text-cdm-muted"
                          }`}
                        >
                          {m.tipo === "ingreso" ? "+" : "−"}
                          {formatMoneyInt(Math.abs(m.monto))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="mt-4 text-right text-[9px] uppercase tracking-[0.2em] text-cdm-accent/70">
                  Ver orbital →
                </p>
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>

      {/* Línea divisoria con degradé radial (del original, en off-white bajo) */}
      <div
        aria-hidden
        className="absolute bottom-0 left-0 z-0 h-px w-full"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, var(--cdm-hairline) 0%, transparent 100%)",
        }}
      />
    </section>
  );
}
