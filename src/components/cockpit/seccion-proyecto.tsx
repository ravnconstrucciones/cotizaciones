"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";

/**
 * Sección de proyecto de la galería /obras (ref. section-with-mockup de
 * 21st.dev). El parallax/stagger de framer-motion se conserva tal cual;
 * lo que cambia (Ola B) es el contenido de la "mockup card" flotante: ya no
 * es el mini-dashboard de plata (los gastos viven SOLO en el orbital) sino el
 * SEGUIMIENTO de la obra — por qué instancia va, el último avance EN VERDE,
 * los pendientes vinculados y el alta de avance de 1 toque.
 * Radius 0 (ADN RAVN): el único objeto redondeado del cockpit sigue siendo
 * el prompt box.
 */

export type AvanceCard = {
  texto: string;
  instancia: string | null;
  creadoAt: string;
};

export type PendienteCard = { id: string; texto: string };

export type ProyectoCard = {
  presupuestoId: string;
  nombre: string;
  cliente: string | null;
  estadoLabel: string;
  estadoCls: string;
  desde: string | null;
  /** Instancia actual de la obra (la del último avance que la declaró). */
  instancia: string | null;
  ultimoAvance: AvanceCard | null;
  cantAvances: number;
  /** Tareas pendientes vinculadas a la obra (tareas.presupuesto_id). */
  pendientes: PendienteCard[];
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

/** "hoy", "ayer" o dd/mm — el cuándo del último avance. */
export function cuandoDisplay(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const dif = Math.round((dia(ahora).getTime() - dia(d).getTime()) / 86400000);
  if (dif <= 0) return "hoy";
  if (dif === 1) return "ayer";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function SeccionProyecto({
  proyecto,
  reverseLayout = false,
  onAgregarAvance,
}: {
  proyecto: ProyectoCard;
  reverseLayout?: boolean;
  /** Insert en obra_avances — devuelve true si salió bien. */
  onAgregarAvance: (presupuestoId: string, texto: string) => Promise<boolean>;
}) {
  const p = proyecto;
  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const layoutClasses = reverseLayout
    ? "md:grid-cols-2 md:grid-flow-col-dense"
    : "md:grid-cols-2";
  const textOrderClass = reverseLayout ? "md:col-start-2" : "";
  const imageOrderClass = reverseLayout ? "md:col-start-1" : "";

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    const texto = nuevo.trim();
    if (!texto || guardando) return;
    setGuardando(true);
    try {
      if (await onAgregarAvance(p.presupuestoId, texto)) setNuevo("");
    } finally {
      setGuardando(false);
    }
  }

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

          {/* Mockup card: el SEGUIMIENTO de la obra (los gastos quedaron en el orbital) */}
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
              <div className="flex h-full flex-col p-6 md:p-8">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[9px] uppercase tracking-[0.3em] text-cdm-accent">
                    Seguimiento
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-[0.15em] ${p.estadoCls}`}
                  >
                    {p.estadoLabel}
                  </span>
                </div>

                {/* Instancia: por dónde va la obra */}
                <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-cdm-muted">
                  Instancia
                </p>
                <p className="font-raleway text-2xl font-black uppercase leading-tight text-cdm-fg md:text-3xl">
                  {p.instancia ?? "—"}
                </p>

                {/* ÚLTIMO AVANCE — EN VERDE, presencia fuerte */}
                <div className="mt-5 border-l-2 border-emerald-400 bg-emerald-400/[0.07] py-2.5 pl-3 pr-2">
                  <p className="font-mono-hud text-[9px] uppercase tracking-[0.25em] text-emerald-400 light:text-emerald-600">
                    Último avance
                    {p.ultimoAvance && (
                      <span className="ml-2 text-emerald-400/70 light:text-emerald-600/70">
                        {cuandoDisplay(p.ultimoAvance.creadoAt)}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-[13px] font-medium leading-snug text-emerald-400 light:text-emerald-600">
                    {p.ultimoAvance?.texto ??
                      "Sin avances todavía — cargá el primero acá abajo."}
                  </p>
                </div>

                {/* Pendientes vinculados a la obra */}
                <div className="mt-5 flex-1 border-t border-cdm-line pt-3">
                  <p className="text-[9px] uppercase tracking-[0.25em] text-cdm-muted">
                    Pendientes de la obra
                    {p.pendientes.length > 0 && (
                      <span className="font-mono-hud ml-2 tabular-nums text-cdm-fg/70">
                        {p.pendientes.length}
                      </span>
                    )}
                  </p>
                  {p.pendientes.length === 0 ? (
                    <p className="mt-2 text-[11px] text-cdm-muted">
                      Nada pendiente en esta obra.
                    </p>
                  ) : (
                    <ul className="mt-1 divide-y divide-cdm-line/60">
                      {p.pendientes.slice(0, 4).map((t) => (
                        <li
                          key={t.id}
                          className="flex items-baseline gap-2 py-1.5"
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 translate-y-px border border-cdm-line"
                          />
                          <span className="min-w-0 truncate text-[11px] text-cdm-fg/80">
                            {t.texto}
                          </span>
                        </li>
                      ))}
                      {p.pendientes.length > 4 && (
                        <li className="py-1.5 text-[10px] uppercase tracking-[0.15em] text-cdm-muted">
                          +{p.pendientes.length - 4} más
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                {/* + avance: alta de 1 toque → obra_avances */}
                <form onSubmit={agregar} className="mt-4 flex">
                  <input
                    type="text"
                    value={nuevo}
                    onChange={(e) => setNuevo(e.target.value)}
                    placeholder="+ avance…"
                    aria-label={`Nuevo avance en ${p.nombre}`}
                    className="font-raleway w-full border border-cdm-line bg-transparent px-3 py-1.5 text-[11px] text-cdm-fg placeholder:text-cdm-muted/50 focus:border-emerald-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!nuevo.trim() || guardando}
                    className="font-mono-hud shrink-0 border border-l-0 border-cdm-line px-3 text-[10px] uppercase tracking-widest text-emerald-400 transition-colors hover:bg-emerald-400 hover:text-cdm-bg disabled:opacity-30 light:text-emerald-600 light:hover:bg-emerald-600 light:hover:text-white"
                  >
                    {guardando ? "…" : "+"}
                  </button>
                </form>

                <Link
                  href={`/obras/${p.presupuestoId}`}
                  className="mt-4 text-right text-[9px] uppercase tracking-[0.2em] text-cdm-accent/70 transition-colors hover:text-cdm-accent"
                >
                  Bitácora completa ({p.cantAvances}) →
                </Link>
              </div>
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
