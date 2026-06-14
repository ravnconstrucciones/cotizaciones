"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AvatarBot } from "@/components/cockpit/avatar-bot";
import { SkeletonGlass } from "@/components/cockpit/skeleton-glass";
import type { Referencia, SinClasificar } from "@/types/centro-mando";

/** Monolito 3D: lazy, solo cliente — el objeto de la página de filosofía. */
const Monolito3D = dynamic(
  () => import("@/components/cockpit/monolito-3d"),
  { ssr: false }
);

type Vista = "estetica" | "filosofia";

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Vista ADN (spec §7.2): el lineamiento estético y filosófico de Ravn, captura a captura. */
export function AdnScreen() {
  const [referencias, setReferencias] = useState<Referencia[]>([]);
  const [sinClasificar, setSinClasificar] = useState<SinClasificar[]>([]);
  const [vista, setVista] = useState<Vista>("estetica");
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [res, resSin] = await Promise.all([
        fetch("/api/referencias?limit=200", { cache: "no-store" }),
        fetch("/api/adn/sin-clasificar", { cache: "no-store" }),
      ]);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "No se pudo cargar el ADN.");
        return;
      }
      setError(null);
      setReferencias(j.referencias ?? []);
      // Sin clasificar es best-effort: si falla, el moodboard vive igual.
      if (resSin.ok) {
        const jSin = await resSin.json();
        setSinClasificar(jSin.sin_clasificar ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const esteticas = useMemo(
    () => referencias.filter((r) => r.tipo === "estetica"),
    [referencias]
  );
  const filosofia = useMemo(
    () => referencias.filter((r) => r.tipo === "filosofia"),
    [referencias]
  );
  const etiquetas = useMemo(() => {
    const s = new Set<string>();
    for (const r of esteticas) for (const e of r.etiquetas ?? []) s.add(e);
    return [...s].sort();
  }, [esteticas]);
  const filtradas = etiqueta
    ? esteticas.filter((r) => (r.etiquetas ?? []).includes(etiqueta))
    : esteticas;

  return (
    <div className="font-geist relative min-h-screen bg-cdm-bg text-cdm-fg">
      {/* En filosofía el monolito acompaña las frases desde la derecha,
          hundido en la niebla. En estética no compite con el moodboard. */}
      {vista === "filosofia" && (
        <Monolito3D
          className="fixed inset-0 z-[5] hidden lg:block"
          posicion="derecha"
          opacidad={0.75}
        />
      )}
      <header className="relative z-10 flex items-baseline justify-between px-6 pt-8 md:px-10">
        <div>
          <h1 className="font-geist text-3xl font-semibold tracking-tight text-cdm-fg">
            ADN
          </h1>
          <p className="font-mono-hud mt-1 text-[11px] uppercase tracking-[0.18em] text-cdm-muted">
            La filosofía y la estética de Ravn, captura a captura.
          </p>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-6 md:px-10">
        <div className="flex gap-2">
          {(["estetica", "filosofia"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`font-mono-hud inline-flex cursor-pointer items-center rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                vista === v
                  ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                  : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
              }`}
            >
              {v === "estetica"
                ? `Estética · ${esteticas.length}`
                : `Filosofía · ${filosofia.length}`}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonGlass filas={3} alto="h-4" anchos={["w-full", "w-2/3", "w-1/2"]} />
            <SkeletonGlass filas={3} alto="h-4" anchos={["w-3/4", "w-full", "w-2/5"]} />
            <SkeletonGlass filas={3} alto="h-4" anchos={["w-2/3", "w-1/2", "w-full"]} />
          </div>
        )}

        {!error && !cargando && vista === "estetica" && (
          <>
            {etiquetas.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setEtiqueta(null)}
                  className={`font-mono-hud inline-flex items-center rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                    etiqueta === null
                      ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                      : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
                  }`}
                >
                  Todas
                </button>
                {etiquetas.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEtiqueta(e)}
                    className={`font-mono-hud inline-flex items-center rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ring-1 transition-colors ${
                      etiqueta === e
                        ? "bg-cdm-accent/10 text-cdm-accent ring-cdm-accent/50"
                        : "text-cdm-muted ring-cdm-line hover:text-cdm-fg hover:ring-cdm-accent/30"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {filtradas.length === 0 ? (
              <div className="mt-8 flex min-h-[30vh] items-center justify-center">
                <span className="font-mono-hud px-4 text-center text-[10px] uppercase tracking-[0.2em] text-cdm-muted">
                  Mandale una foto al bot — acá nace el moodboard
                </span>
              </div>
            ) : (
              /* Moodboard: grilla flotante — cards Geist con ring cdm-line. */
              <div className="mt-8 columns-2 gap-4 md:columns-3 xl:columns-4">
                {filtradas.map((r, i) => (
                  <motion.figure
                    key={r.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: Math.min(i * 0.05, 0.9), ease: [0.22, 1, 0.36, 1] }}
                    className="mb-4 break-inside-avoid overflow-hidden rounded-[24px] ring-1 ring-cdm-line bg-white/60 dark:bg-zinc-900/40 transition-all duration-300 hover:-translate-y-1 hover:ring-cdm-accent/30"
                  >
                    {r.imagen_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.imagen_url}
                        alt={r.texto ?? "Referencia estética"}
                        className="w-full"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center border-b border-cdm-line">
                        <span className="font-mono-hud text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                          Sin imagen
                        </span>
                      </div>
                    )}
                    <figcaption className="px-3 py-2.5">
                      {r.texto && (
                        <p className="font-geist text-[11px] leading-snug text-cdm-fg/85">{r.texto}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {(r.etiquetas ?? []).map((e) => (
                          <button
                            key={e}
                            onClick={() => setEtiqueta(e)}
                            className="font-mono-hud cursor-pointer rounded-full px-1.5 py-0.5 text-[8px] uppercase tracking-widest ring-1 ring-cdm-line text-cdm-accent transition-colors hover:bg-cdm-accent/10 hover:ring-cdm-accent/50"
                          >
                            {e}
                          </button>
                        ))}
                        <span className="font-mono-hud ml-auto flex items-center gap-1.5 text-[9px] tabular-nums text-cdm-muted">
                          {r.evento_id ? <AvatarBot className="h-5 w-5" /> : null}
                          {fmtFecha(r.creado_at)}
                        </span>
                      </div>
                    </figcaption>
                  </motion.figure>
                ))}
              </div>
            )}

            {/* Sin clasificar: imágenes que entraron por WhatsApp y quedaron
                en Archivados sin destino — el moodboard las muestra para que
                no haya ADN invisible, con link directo a resolverlas. */}
            {sinClasificar.length > 0 && (
              <section className="mt-10">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-mono-hud flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                    Sin clasificar
                    <span className="inline-flex items-center rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[9px] ring-1 ring-amber-300/30">
                      {sinClasificar.length}
                    </span>
                  </h2>
                  <Link
                    href="/archivados"
                    className="font-mono-hud text-[9px] uppercase tracking-[0.12em] text-cdm-muted transition-colors hover:text-cdm-accent"
                  >
                    Resolver en Archivados ↑
                  </Link>
                </div>
                <div className="mt-4 columns-2 gap-3 md:columns-3 xl:columns-4">
                  {sinClasificar.map((s, i) => (
                    <motion.figure
                      key={s.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.6) }}
                      className="mb-3 break-inside-avoid overflow-hidden rounded-[24px] ring-1 ring-amber-300/30 bg-white/60 dark:bg-zinc-900/40"
                    >
                      <Link href="/archivados" className="block cursor-pointer">
                        {s.imagen_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={s.imagen_url}
                            alt={s.texto ?? s.titulo}
                            className="w-full opacity-90"
                          />
                        ) : (
                          <div className="flex h-28 flex-col items-center justify-center gap-2 border-b border-cdm-line">
                            <AvatarBot className="h-7 w-7" title="Llegó por WhatsApp" />
                            <span className="font-mono-hud px-3 text-center text-[9px] uppercase tracking-[0.18em] text-cdm-muted/70">
                              {s.tipo_media === "image" ? "Imagen en WhatsApp" : "Media en WhatsApp"}
                            </span>
                          </div>
                        )}
                        <figcaption className="px-3 py-2.5">
                          <p className="font-geist text-[11px] leading-snug text-cdm-fg/80">
                            {s.texto ?? s.titulo}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between gap-1">
                            <span className="font-mono-hud rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-amber-300/90 ring-1 ring-amber-300/30">
                              Pendiente
                            </span>
                            <span className="font-mono-hud flex items-center gap-1.5 text-[9px] tabular-nums text-cdm-muted">
                              <AvatarBot className="h-5 w-5" />
                              {fmtFecha(s.creado_at)}
                            </span>
                          </div>
                        </figcaption>
                      </Link>
                    </motion.figure>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Filosofía (iteración 5 — la content page de IGLOO): las frases
            flotan EN la atmósfera como bloques terminal con aire enorme.
            Entrada con fade lento al scrollear, índice mono, cero cajas. */}
        {!error && !cargando && vista === "filosofia" && (
          <div className="mx-auto mt-24 max-w-3xl pb-24">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="font-mono-hud text-[10px] uppercase tracking-[0.3em] text-cdm-accent/70"
            >
              <span aria-hidden className="mr-2 text-cdm-accent/40">
                {"//////"}
              </span>
              Filosofía
            </motion.p>

            {filosofia.length === 0 && (
              <div className="mt-16 flex h-32 items-center justify-center border border-dashed border-cdm-line">
                <span className="font-mono-hud px-4 text-center text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                  Mandale una frase al bot — acá nace la filosofía
                </span>
              </div>
            )}

            <div className="mt-20 space-y-32">
              {filosofia.map((r, i) => (
                <motion.blockquote
                  key={r.id}
                  initial={{ opacity: 0, y: 28 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    i % 2 === 1 ? "lg:translate-x-16" : "lg:-translate-x-4"
                  }
                >
                  <span
                    aria-hidden
                    className="font-mono-hud text-[10px] tabular-nums tracking-[0.2em] text-cdm-accent/50"
                  >
                    {String(i + 1).padStart(2, "0")} {"////"}
                  </span>
                  <p className="font-mono-hud mt-5 text-lg leading-[1.9] text-cdm-fg/90 md:text-xl">
                    &ldquo;{r.texto}&rdquo;
                  </p>
                  <footer className="font-mono-hud mt-5 flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-cdm-muted/70">
                    {r.evento_id ? <AvatarBot className="h-5 w-5" /> : null}
                    <span>
                      {r.fuente ? `${r.fuente} · ` : ""}
                      {fmtFecha(r.creado_at)}
                    </span>
                  </footer>
                </motion.blockquote>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

