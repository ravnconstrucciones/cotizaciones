"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { WavesBackdrop } from "@/components/cockpit/waves-backdrop";
import { AvatarBot } from "@/components/cockpit/avatar-bot";
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

const CHIP_ACTIVO =
  "border-cdm-accent/70 bg-cdm-accent/15 text-cdm-accent shadow-[0_0_18px_-4px_rgba(34,211,238,0.5)]";
const CHIP_IDLE =
  "border-cdm-line text-cdm-muted hover:border-cdm-accent/30 hover:text-cdm-fg";

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
    <div className="font-grotesk relative min-h-screen bg-cdm-bg px-4 pb-24 pt-14 text-cdm-fg sm:px-8">
      <WavesBackdrop />
      {/* En filosofía el monolito acompaña las frases desde la derecha,
          hundido en la niebla. En estética no compite con el moodboard. */}
      {vista === "filosofia" && (
        <Monolito3D
          className="fixed inset-0 z-[5] hidden lg:block"
          posicion="derecha"
          opacidad={0.75}
        />
      )}
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="relative pb-3">
          {/* Línea de horizonte detrás del header — mismo lenguaje que historial/obras. */}
          <span aria-hidden className="cdm-horizon absolute inset-x-0 bottom-0" />
          <h1 className="font-mono-hud flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-cdm-muted">
            <span aria-hidden className="text-cdm-accent/60">{"//////"}</span>
            ADN
          </h1>
        </div>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-cdm-muted">
          La filosofía y la estética de Ravn construyéndose solas, captura a captura.
        </p>

        <div className="font-mono-hud mt-8 flex gap-2">
          {(["estetica", "filosofia"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`cdm-chip cursor-pointer border px-4 py-1.5 text-[10px] uppercase tracking-[0.12em] transition-colors ${
                vista === v ? CHIP_ACTIVO : CHIP_IDLE
              }`}
            >
              {v === "estetica"
                ? `[ESTÉTICA] ${esteticas.length}`
                : `[FILOSOFÍA] ${filosofia.length}`}
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-[11px] text-red-400">{error}</p>}
        {!error && cargando && (
          <p className="mt-6 text-[11px] text-cdm-muted">Cargando…</p>
        )}

        {!error && !cargando && vista === "estetica" && (
          <>
            {etiquetas.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setEtiqueta(null)}
                  className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                    etiqueta === null ? CHIP_ACTIVO : CHIP_IDLE
                  }`}
                >
                  Todas
                </button>
                {etiquetas.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEtiqueta(e)}
                    className={`border px-3 py-1 text-[9px] uppercase tracking-[0.18em] transition-colors ${
                      etiqueta === e ? CHIP_ACTIVO : CHIP_IDLE
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
            {filtradas.length === 0 ? (
              <div className="mt-8 flex h-32 items-center justify-center border border-dashed border-cdm-line">
                <span className="px-4 text-center text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                  Mandale una foto al bot — acá nace el moodboard
                </span>
              </div>
            ) : (
              /* Moodboard (iteración 5): grilla flotante en la niebla — sin
                 cajas duras; cada captura levita con sombra ambiental. */
              <div className="mt-10 columns-2 gap-5 md:columns-3 xl:columns-4">
                {filtradas.map((r, i) => (
                  <motion.figure
                    key={r.id}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: Math.min(i * 0.05, 0.9), ease: [0.22, 1, 0.36, 1] }}
                    className="mb-5 break-inside-avoid bg-cdm-panel/50 shadow-[0_28px_60px_-24px_rgba(0,0,0,0.85),0_0_30px_-18px_rgba(34,211,238,0.25)] backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1"
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
                        <span className="text-[10px] uppercase tracking-[0.2em] text-cdm-muted/60">
                          Sin imagen
                        </span>
                      </div>
                    )}
                    <figcaption className="px-3 py-2">
                      {r.texto && (
                        <p className="text-[11px] leading-snug text-cdm-fg/85">{r.texto}</p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {(r.etiquetas ?? []).map((e) => (
                          <button
                            key={e}
                            onClick={() => setEtiqueta(e)}
                            className="cursor-pointer border border-cdm-line px-1.5 py-0.5 text-[8px] uppercase tracking-widest text-cdm-accent transition-colors hover:bg-cdm-accent hover:text-cdm-bg"
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
                  <h2 className="font-mono-hud flex items-baseline gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-300">
                    <span aria-hidden className="text-amber-300/70">{"//////"}</span>
                    Sin clasificar ({sinClasificar.length})
                  </h2>
                  <Link
                    href="/archivados"
                    className="font-mono-hud text-[9px] uppercase tracking-[0.08em] text-cdm-muted transition-colors hover:text-cdm-accent"
                  >
                    [RESOLVER EN ARCHIVADOS] ↑
                  </Link>
                </div>
                <div className="mt-4 columns-2 gap-3 md:columns-3 xl:columns-4">
                  {sinClasificar.map((s, i) => (
                    <motion.figure
                      key={s.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.6) }}
                      className="mb-3 break-inside-avoid border border-dashed border-amber-300/40 bg-cdm-panel/70"
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
                            <span className="px-3 text-center text-[9px] uppercase tracking-[0.18em] text-cdm-muted/70">
                              {s.tipo_media === "image" ? "Imagen en WhatsApp" : "Media en WhatsApp"}
                            </span>
                          </div>
                        )}
                        <figcaption className="px-3 py-2">
                          <p className="text-[11px] leading-snug text-cdm-fg/80">
                            {s.texto ?? s.titulo}
                          </p>
                          <div className="mt-1.5 flex items-center justify-between gap-1">
                            <span className="text-[8px] uppercase tracking-widest text-amber-300/90">
                              Pendiente
                            </span>
                            <span className="flex items-center gap-1.5 text-[9px] tabular-nums text-cdm-muted">
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
